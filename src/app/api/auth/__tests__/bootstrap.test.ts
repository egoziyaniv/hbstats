import { NextRequest } from 'next/server';
import { POST } from '../route';
import prisma from '@/lib/prisma';

jest.mock('@/lib/prisma', () => ({ __esModule: true, default: { user: { findUnique: jest.fn() }, $transaction: jest.fn() } }));
jest.mock('@/lib/auth', () => ({ hashPassword: jest.fn(async () => 'hash'), createSession: jest.fn(), toSafeUser: (u: any) => u }));
jest.mock('@/lib/activity', () => ({ logActivity: jest.fn() }));
const db = prisma as any;
const request = () => new NextRequest('http://localhost/api/auth', { method: 'POST', body: JSON.stringify({ action: 'register', name: 'First', email: 'first@example.test', password: 'password123' }) });
beforeEach(() => { jest.clearAllMocks(); delete process.env.REGISTRATION_DISABLED; db.user.findUnique.mockResolvedValue(null); });

test('first-admin decision uses serializable isolation', async () => {
  db.$transaction.mockImplementation(async (callback: any) => callback({ user: { count: async () => 0, create: async ({ data }: any) => ({ id: 'first', ...data }) } }));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }));
});

test('serialization conflict retries count and does not grant a second admin', async () => {
  db.$transaction.mockRejectedValueOnce({ code: 'P2034' }).mockImplementation(async (callback: any) => callback({ user: { count: async () => 1, create: async ({ data }: any) => ({ id: 'second', ...data }) } }));
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).user.role).toBe('USER');
});
