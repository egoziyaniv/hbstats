import * as SecureStore from 'expo-secure-store';
import type { SafeUser } from '@shared/types/common';

const REFRESH_KEY = 'hbs_refresh';
const USER_KEY = 'hbs_user';
const GUEST_KEY = 'hbs_guest';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export async function storeRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function loadRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_KEY);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  accessToken = null;
}

export async function storeUser(user: SafeUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

// Guest mode: the user chose to browse without an account. Persisted so the
// choice survives app restarts (until they log in or log out). Best-effort —
// a SecureStore failure must never block browsing, so we swallow errors.
export async function storeGuest(isGuest: boolean): Promise<void> {
  try {
    if (isGuest) await SecureStore.setItemAsync(GUEST_KEY, '1');
    else await SecureStore.deleteItemAsync(GUEST_KEY);
  } catch {
    // ignore — guest mode still works in-memory for this session
  }
}

export async function loadGuest(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(GUEST_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function loadUser(): Promise<SafeUser | null> {
  const raw = await SecureStore.getItemAsync(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SafeUser;
  } catch {
    return null;
  }
}
