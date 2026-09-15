import { NextRequest } from 'next/server';
import { PUT } from '../route';

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx'; });

describe('PUT /api/account/matchdays/:gameId', () => {
  it('requires an authenticated session', async () => {
    const request = new NextRequest('http://localhost/api/account/matchdays/game-1', {
      method: 'PUT', body: JSON.stringify({ attended: true }), headers: { 'content-type': 'application/json' },
    });
    const response = await PUT(request, { params: Promise.resolve({ gameId: 'game-1' }) });
    expect(response.status).toBe(401);
  });
});
