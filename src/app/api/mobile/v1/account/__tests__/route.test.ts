// src/app/api/mobile/v1/account/__tests__/route.test.ts
import { DELETE } from '../route';
import { NextRequest } from 'next/server';

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx'; });

function mkReq(auth?: string): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/account', {
    method: 'DELETE',
    headers: auth ? { authorization: auth } : {},
  });
}

describe('DELETE /api/mobile/v1/account', () => {
  it('returns 401 without a bearer token', async () => {
    const res = await DELETE(mkReq());
    expect(res.status).toBe(401);
  });
});
