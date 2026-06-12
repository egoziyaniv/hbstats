import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

function post(headers: Record<string, string>) {
  return middleware(
    new NextRequest('https://hbs.co.il/api/games', { method: 'POST', headers })
  );
}

describe('middleware CSRF origin allowlist', () => {
  it('allows a same-host origin', () => {
    expect(post({ host: 'hbs.co.il', origin: 'https://hbs.co.il' }).status).not.toBe(403);
  });

  it('allows a request with no Origin/Referer (server-to-server)', () => {
    expect(post({ host: 'hbs.co.il' }).status).not.toBe(403);
  });

  it('rejects a look-alike domain that only shares a prefix', () => {
    // The startsWith bug let this through; exact match must block it.
    expect(post({ host: 'hbs.co.il', origin: 'https://hbs.co.il.evil.com' }).status).toBe(403);
  });

  it('rejects an unrelated cross-site origin', () => {
    expect(post({ host: 'hbs.co.il', origin: 'https://evil.com' }).status).toBe(403);
  });

  it('rejects an origin embedding the host as a path, not the authority', () => {
    expect(post({ host: 'hbs.co.il', origin: 'https://evil.com/https://hbs.co.il' }).status).toBe(403);
  });
});
