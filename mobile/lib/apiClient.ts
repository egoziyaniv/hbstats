import { apiUrl } from './config';
import {
  getAccessToken,
  setAccessToken,
  loadRefreshToken,
  storeRefreshToken,
  clearRefreshToken,
} from './auth';

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  _retried?: boolean;
}

class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

let inflightRefresh: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const refresh = await loadRefreshToken();
  if (!refresh) return null;

  const res = await fetch(apiUrl('/auth/refresh'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ refreshToken: refresh }),
  });

  if (!res.ok) {
    // Only a genuine auth failure means the token is dead. A transient 5xx
    // (e.g. the 502 during `pm2 restart`) or a rate-limit must NOT wipe the
    // keychain — that would silently log the user out on every deploy.
    if (res.status === 401 || res.status === 403) await clearRefreshToken();
    return null;
  }

  const body = (await res.json()) as { accessToken: string; refreshToken: string };
  setAccessToken(body.accessToken);
  await storeRefreshToken(body.refreshToken);
  return body.accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!inflightRefresh) {
    inflightRefresh = performRefresh().finally(() => {
      inflightRefresh = null;
    });
  }
  return inflightRefresh;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  const access = getAccessToken();
  if (access) headers.authorization = `Bearer ${access}`;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  const res = await fetch(apiUrl(path), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && !options._retried && !path.startsWith('/auth/')) {
    const newAccess = await refreshAccessToken();
    if (newAccess) {
      return request<T>(path, { ...options, _retried: true });
    }
    throw new ApiError('Unauthorized', 401, null);
  }

  if (!res.ok) {
    let body: unknown = null;
    try { body = await res.json(); } catch {}
    throw new ApiError(`HTTP ${res.status}`, res.status, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/**
 * Return a usable access token: the in-memory one, or — on a cold start where
 * only the refresh token survived — mint one from it. Call before an
 * authenticated request that the server would accept anonymously (e.g. the push
 * token register returns 200 with no bearer, so it never 401s into the
 * auto-refresh path and would otherwise bind the device to userId=null).
 */
export async function ensureAccessToken(): Promise<string | null> {
  return getAccessToken() ?? (await refreshAccessToken());
}

export const apiClient = {
  get: <T>(path: string, headers?: Record<string, string>) => request<T>(path, { method: 'GET', headers }),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'POST', body, headers }),
  put: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>(path, { method: 'PUT', body, headers }),
  del: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: 'DELETE', headers }),
};

export { ApiError };
