import { NextRequest } from 'next/server';

jest.mock('@/lib/social-auth', () => {
  const actual = jest.requireActual('@/lib/social-auth');
  return { ...actual, verifyGoogleIdToken: jest.fn() };
});

import { POST } from '../route';
import { verifyGoogleIdToken, SocialAuthError } from '@/lib/social-auth';

function mkReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/mobile/v1/auth/google', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

it('returns 401 when the Google token is invalid', async () => {
  (verifyGoogleIdToken as jest.Mock).mockRejectedValue(new SocialAuthError('Invalid Google token'));
  const res = await POST(mkReq({ idToken: 'bad' }));
  expect(res.status).toBe(401);
});

it('returns 400 when idToken is missing', async () => {
  const res = await POST(mkReq({}));
  expect(res.status).toBe(400);
});
