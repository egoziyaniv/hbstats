jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('@/lib/auth', () => ({ hashPassword: jest.fn(async (password: string) => `hash:${password}`) }));
jest.mock('@/lib/activity', () => ({ logActivity: jest.fn(async () => undefined) }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(() => true),
  getClientIp: jest.fn(() => '127.0.0.1'),
}));

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { logActivity } from '@/lib/activity';
import { POST } from '@/app/api/auth/reset-confirm/route';

function request(token: string, password: string): NextRequest {
  return new NextRequest('http://localhost/api/auth/reset-confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
}

test('consumes one reset token exactly once under concurrent requests', async () => {
  const rawToken = 'single-use-token';
  let tokenRecord: any = {
    id: 'token-id',
    userId: 'user-id',
    tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
  };
  let storedPassword = 'old-hash';

  Object.assign(prisma, {
    passwordResetToken: {
      findUnique: jest.fn(async () => tokenRecord ? { ...tokenRecord } : null),
      update: jest.fn(async ({ data }: any) => {
        tokenRecord = { ...tokenRecord, ...data };
        return tokenRecord;
      }),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const available = tokenRecord
          && tokenRecord.id === where.id
          && tokenRecord.usedAt === null
          && tokenRecord.expiresAt > where.expiresAt.gt;
        if (!available) return { count: 0 };
        tokenRecord = { ...tokenRecord, ...data };
        return { count: 1 };
      }),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    user: {
      update: jest.fn(async ({ data }: any) => {
        storedPassword = data.password;
        return { id: 'user-id' };
      }),
    },
    session: { deleteMany: jest.fn(async () => ({ count: 0 })) },
    $queryRaw: jest.fn(async () => [{ id: 'user-id' }]),
    $transaction: jest.fn(async (operation: any) => {
      if (typeof operation === 'function') return operation(prisma);
      return Promise.all(operation);
    }),
  });

  const responses = await Promise.all([
    POST(request(rawToken, 'ReplacementPassword123')),
    POST(request(rawToken, 'OtherReplacementPassword123')),
  ]);

  expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
  expect(storedPassword).toMatch(/^hash:/);
  expect(logActivity).toHaveBeenCalledTimes(1);
});
