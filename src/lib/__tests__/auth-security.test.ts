import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser, issueMobileSession } from '@/lib/auth';
import { POST as refresh } from '@/app/api/mobile/v1/auth/refresh/route';
import { POST as logout } from '@/app/api/mobile/v1/auth/logout/route';
import { POST as logoutAll } from '@/app/api/mobile/v1/auth/logout-all/route';
import { _clearIdempotencyCacheForTests } from '@/lib/refresh-cache';

jest.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined, set: jest.fn() }) }));
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  session: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
  user: { findUnique: jest.fn() }, $transaction: jest.fn(), $queryRaw: jest.fn(),
} }));
jest.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => true, getClientIp: () => 'test' }));

const db = prisma as any;
const user = { id: 'user', email: 'test@example.test', name: 'Test', role: 'USER', avatarUrl: null, isActive: true };
let sessions: Map<string, any>;
let queue: Promise<any>;
const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const request = (token: string) => new NextRequest('http://localhost/api/mobile/v1/auth/refresh', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refreshToken: token }),
});
const bearer = (token: string) => new NextRequest('http://localhost/api/auth', { headers: { authorization: `Bearer ${token}` } });

beforeEach(() => {
  process.env.JWT_SECRET = 'auth-security-test-secret-not-used-outside-tests';
  jest.clearAllMocks();
  _clearIdempotencyCacheForTests();
  sessions = new Map(); queue = Promise.resolve(); user.isActive = true;
  db.user.findUnique.mockImplementation(async () => ({ ...user }));
  db.session.findUnique.mockImplementation(async ({ where, include }: any) => {
    const row = where.id ? sessions.get(where.id) : [...sessions.values()].find(s => s.tokenHash === where.tokenHash);
    return row ? { ...row, ...(include?.user ? { user: { ...user } } : {}) } : null;
  });
  db.session.create.mockImplementation(async ({ data }: any) => {
    const row = { id: data.id || crypto.randomUUID(), createdAt: new Date(), replacedAt: null, replacedBy: null, ...data };
    sessions.set(row.id, row); return { ...row };
  });
  db.session.update.mockImplementation(async ({ where, data }: any) => {
    const row = sessions.get(where.id); if (!row) throw new Error('missing session');
    Object.assign(row, data); return { ...row };
  });
  db.session.deleteMany.mockImplementation(async ({ where }: any) => {
    for (const [id, row] of sessions) if (Object.entries(where).every(([k, v]) => row[k] === v)) sessions.delete(id);
    return { count: 1 };
  });
  // Model serial execution provided by a successful serializable transaction.
  db.$transaction.mockImplementation((callback: any) => {
    const run = queue.then(() => callback(db)); queue = run.catch(() => {}); return run;
  });
});

async function login() { return issueMobileSession(user as any); }

test('concurrent refresh retries return one successor and identical tokens', async () => {
  const loginResult = await login();
  const responses = await Promise.all([refresh(request(loginResult.refreshToken)), refresh(request(loginResult.refreshToken))]);
  expect(responses.map(r => r.status)).toEqual([200, 200]);
  const bodies = await Promise.all(responses.map(r => r.json()));
  expect(bodies[0]).toEqual(bodies[1]);
  expect([...sessions.values()].filter(s => !s.replacedAt)).toHaveLength(1);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
});

test('refresh idempotency survives loss of process cache', async () => {
  const tokens = await login();
  const first = await refresh(request(tokens.refreshToken));
  _clearIdempotencyCacheForTests();
  const second = await refresh(request(tokens.refreshToken));
  expect(second.status).toBe(200);
  expect(await second.json()).toEqual(await first.json());
});

test('a cached refresh response cannot revive a logged-out session', async () => {
  const tokens = await login();
  await refresh(request(tokens.refreshToken));
  sessions.clear();
  expect((await refresh(request(tokens.refreshToken))).status).toBe(401);
});

test('inactive accounts cannot refresh even during the retry window', async () => {
  const tokens = await login();
  await refresh(request(tokens.refreshToken));
  user.isActive = false;
  expect((await refresh(request(tokens.refreshToken))).status).toBe(401);
});

test('logout-all immediately invalidates issued bearer tokens', async () => {
  const tokens = await login();
  expect((await getRequestUser(bearer(tokens.accessToken)))?.id).toBe(user.id);
  expect((await logoutAll(bearer(tokens.accessToken))).status).toBe(204);
  expect(await getRequestUser(bearer(tokens.accessToken))).toBeNull();
});

test('normal refresh preserves prior unexpired access while session deletion revokes it', async () => {
  const tokens = await login();
  await refresh(request(tokens.refreshToken));
  expect((await getRequestUser(bearer(tokens.accessToken)))?.id).toBe(user.id);
  sessions.clear();
  expect(await getRequestUser(bearer(tokens.accessToken))).toBeNull();
});

test('legacy access tokens without session binding fail closed', async () => {
  const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: 900 });
  expect(await getRequestUser(bearer(token))).toBeNull();
});

test('expired retry windows revoke the compromised family', async () => {
  const tokens = await login();
  await refresh(request(tokens.refreshToken));
  const original = [...sessions.values()].find(s => s.tokenHash === hash(tokens.refreshToken));
  original.replacedAt = new Date(Date.now() - 31_000);
  _clearIdempotencyCacheForTests();
  expect((await refresh(request(tokens.refreshToken))).status).toBe(401);
  expect(sessions.size).toBe(0);
});


test('device logout revokes old and new access tokens after rotation without logging out another device', async () => {
  const device = await login();
  const other = await login();
  const replacement = await (await refresh(request(device.refreshToken))).json();
  const req = new NextRequest('http://localhost/api/mobile/v1/auth/logout', {
    method: 'POST', headers: { authorization: `Bearer ${replacement.accessToken}` },
    body: JSON.stringify({ refreshToken: replacement.refreshToken }),
  });
  expect((await logout(req)).status).toBe(204);
  expect(await getRequestUser(bearer(device.accessToken))).toBeNull();
  expect(await getRequestUser(bearer(replacement.accessToken))).toBeNull();
  expect((await getRequestUser(bearer(other.accessToken)))?.id).toBe(user.id);
});
