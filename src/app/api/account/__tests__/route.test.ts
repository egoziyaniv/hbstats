import { DELETE } from '../route';
import { NextRequest } from 'next/server';
import prisma from '@/lib/prisma';
import { hashPassword, createSession } from '@/lib/auth';

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx'; });

function mkReq(cookie?: string): NextRequest {
  return new NextRequest('http://localhost/api/account', {
    method: 'DELETE',
    headers: cookie ? { cookie } : {},
  });
}

describe('DELETE /api/account', () => {
  it('returns 401 without a session', async () => {
    const res = await DELETE(mkReq());
    expect(res.status).toBe(401);
  });
});
