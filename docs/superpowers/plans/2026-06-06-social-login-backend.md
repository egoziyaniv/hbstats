# Social Login — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Server-side foundation for "Sign in with Google" and "Sign in with Apple" — token verification, account linking, and web + mobile endpoints — buildable and unit-testable now without external OAuth credentials.

**Architecture:** A shared core `src/lib/social-auth.ts` verifies provider ID tokens (Google via `google-auth-library`, Apple via `jose`+JWKS) and resolves them to a `User` (match-by-sub → link-by-verified-email → create). Thin endpoints reuse existing issuance: web `createSession` (cookie), mobile a new extracted `issueMobileSession` helper (refresh row + access JWT). `User.password` becomes optional; existing password-login paths get null guards.

**Tech Stack:** Next.js 14 route handlers, Prisma, `google-auth-library`, `jose`, `jsonwebtoken` (existing), Jest (real-DB backend tests with mocked provider verifiers).

**Scope note:** This is the backend ONLY. Mobile UI and web UI are separate plans gated on the owner-provided credentials (Apple Service ID/key, Google OAuth client IDs). The endpoints here reject cleanly until those env vars are set, so this plan deploys safely on its own.

---

## Background facts (verified)

- `createSession(userId)` (`src/lib/auth.ts`) sets the web cookie session.
- Mobile login (`src/app/api/mobile/v1/auth/login/route.ts`) inlines: create a refresh-token `Session` (`familyId = session.id`), `signAccessToken(userId)`, return `LoginResponse = { accessToken, refreshToken, user: SafeUser }`.
- `verifyPassword(pw, hash)` is called with `user.password` in 3 places: `src/app/api/auth/route.ts:105` (login), `:136` (change-password), and the mobile login route. After `password` becomes nullable these need a null guard.
- `signAccessToken(userId)` / `verifyAccessToken` in `src/lib/jwt.ts`. `LoginResponse`/`SafeUser` in `shared/types/mobile-api.ts`. `checkRateLimit(key,max,windowMs)` + `getClientIp(req)` in `src/lib/rate-limit.ts`.
- Prisma model `User` (`@@map("users")`): `password String`, `email String @unique`, `role UserRole @default(USER)`.
- `tsconfig.json` has `strict: false` — discriminated unions do NOT narrow through a negative check; use `'x' in obj` guards or explicit checks (do not rely on `!result.ok` narrowing).
- Backend Jest tests run against the real local DB (`roots: ['<rootDir>/src']`, `testMatch: ['**/__tests__/**/*.test.ts']`).

---

### Task 1: Add dependencies + env placeholders

**Files:**
- Modify: `package.json` (via npm install)
- Modify: `.env.example`

- [ ] **Step 1: Install libraries**

Run: `npm install google-auth-library jose`
Expected: both added to `dependencies`, exit 0.

- [ ] **Step 2: Document env vars in `.env.example`**

Append these lines to `.env.example`:
```
# Social login (Google) — OAuth client IDs accepted as token audiences
GOOGLE_CLIENT_ID_WEB=
GOOGLE_CLIENT_ID_IOS=
# Social login (Apple) — comma-separated accepted audiences (iOS bundle id + web Service ID)
APPLE_CLIENT_IDS=
```

- [ ] **Step 3: Verify install**

Run: `node -e "require('google-auth-library');require('jose');console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .env.example
git commit -m "chore(social-auth): add google-auth-library + jose deps and env placeholders"
```

---

### Task 2: Schema — optional password + provider columns, with null guards

**Files:**
- Modify: `prisma/schema.prisma` (model `User`)
- Modify: `src/app/api/auth/route.ts` (lines ~105 and ~136)
- Modify: `src/app/api/mobile/v1/auth/login/route.ts`

- [ ] **Step 1: Edit the `User` model**

In `prisma/schema.prisma`, change `password String` to `password String?` and add the two provider columns directly after it:
```prisma
  password                  String?
  googleSub                 String?          @unique
  appleSub                  String?          @unique
```

- [ ] **Step 2: Push schema + regenerate client**

Run: `npx prisma db push && npx prisma generate`
Expected: schema in sync; client regenerated; exit 0.

- [ ] **Step 3: Guard null password in web login**

In `src/app/api/auth/route.ts`, find the login check (around line 105):
```ts
    if (!user || !(await verifyPassword(password, user.password))) {
```
Replace with:
```ts
    if (!user || !user.password || !(await verifyPassword(password, user.password))) {
```

- [ ] **Step 4: Guard null password in web change-password**

In the same file (around line 136):
```ts
    if (!fullUser || !(await verifyPassword(currentPassword, fullUser.password))) {
```
Replace with:
```ts
    if (!fullUser || !fullUser.password || !(await verifyPassword(currentPassword, fullUser.password))) {
```

- [ ] **Step 5: Guard null password in mobile login**

In `src/app/api/mobile/v1/auth/login/route.ts`, the lookup currently is:
```ts
  const user = await prisma.user.findUnique({
    where: { email: body.email.toLowerCase() },
  });
  if (!user || !user.isActive) {
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
  }

  const passwordValid = await verifyPassword(body.password, user.password);
```
Change the password line to guard null (a social-only account has no password):
```ts
  const passwordValid = user.password ? await verifyPassword(body.password, user.password) : false;
```

- [ ] **Step 6: Verify existing auth tests + type-check**

Run: `npm test -- src/app/api/mobile/v1/auth/__tests__/login.test.ts && npx tsc --noEmit`
Expected: login tests pass; tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma src/app/api/auth/route.ts src/app/api/mobile/v1/auth/login/route.ts
git commit -m "feat(social-auth): optional password + provider columns, null-password guards"
```

---

### Task 3: Shared core — token verification + user resolution

**Files:**
- Create: `src/lib/social-auth.ts`
- Test: `src/lib/__tests__/social-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/social-auth.test.ts
import { resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('resolveSocialUser', () => {
  it('creates a new USER when no match exists', async () => {
    const email = `new-${uniq()}@test.local`;
    const sub = `g-${uniq()}`;
    const user = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: true, name: 'New Person' });
    expect(user.email).toBe(email.toLowerCase());
    expect(user.role).toBe('USER');
    expect(user.googleSub).toBe(sub);
    expect(user.password).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('links to an existing account when the verified email matches', async () => {
    const email = `link-${uniq()}@test.local`;
    const existing = await prisma.user.create({
      data: { email: email.toLowerCase(), name: 'Existing', password: await hashPassword('Password123'), isActive: true },
    });
    const sub = `g-${uniq()}`;
    const resolved = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: true });
    expect(resolved.id).toBe(existing.id);
    expect(resolved.googleSub).toBe(sub);
    await prisma.user.delete({ where: { id: existing.id } });
  });

  it('returns the same user when the provider sub already exists', async () => {
    const email = `sub-${uniq()}@test.local`;
    const sub = `a-${uniq()}`;
    const first = await resolveSocialUser({ provider: 'apple', sub, email, emailVerified: true });
    const second = await resolveSocialUser({ provider: 'apple', sub, email, emailVerified: true });
    expect(second.id).toBe(first.id);
    await prisma.user.delete({ where: { id: first.id } });
  });

  it('does NOT link to an existing email when the email is unverified', async () => {
    const email = `unverified-${uniq()}@test.local`;
    const existing = await prisma.user.create({
      data: { email: email.toLowerCase(), name: 'Existing', password: await hashPassword('Password123'), isActive: true },
    });
    const sub = `g-${uniq()}`;
    const resolved = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: false });
    expect(resolved.id).not.toBe(existing.id);
    expect(resolved.googleSub).toBe(sub);
    await prisma.user.delete({ where: { id: resolved.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/social-auth.test.ts`
Expected: FAIL — `Cannot find module '@/lib/social-auth'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/social-auth.ts
import { OAuth2Client } from 'google-auth-library';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { User } from '@prisma/client';
import prisma from '@/lib/prisma';

export type SocialProvider = 'google' | 'apple';

export interface SocialIdentity {
  provider: SocialProvider;
  sub: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
}

/** Thrown on any token-verification or configuration failure. Endpoints map it to 401. */
export class SocialAuthError extends Error {}

function googleAudiences(): string[] {
  return [process.env.GOOGLE_CLIENT_ID_WEB, process.env.GOOGLE_CLIENT_ID_IOS].filter(Boolean) as string[];
}

function appleAudiences(): string[] {
  return (process.env.APPLE_CLIENT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
}

const googleClient = new OAuth2Client();
const APPLE_ISSUER = 'https://appleid.apple.com';
const appleJWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export async function verifyGoogleIdToken(idToken: string): Promise<SocialIdentity> {
  const audience = googleAudiences();
  if (audience.length === 0) throw new SocialAuthError('Google login not configured');
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken, audience });
    payload = ticket.getPayload();
  } catch {
    throw new SocialAuthError('Invalid Google token');
  }
  if (!payload || !payload.sub) throw new SocialAuthError('Invalid Google token');
  return {
    provider: 'google',
    sub: payload.sub,
    email: payload.email,
    emailVerified: payload.email_verified === true,
    name: payload.name,
  };
}

export async function verifyAppleIdToken(
  idToken: string,
  expectedNonce?: string,
  name?: string,
): Promise<SocialIdentity> {
  const audience = appleAudiences();
  if (audience.length === 0) throw new SocialAuthError('Apple login not configured');
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, appleJWKS, { issuer: APPLE_ISSUER, audience }));
  } catch {
    throw new SocialAuthError('Invalid Apple token');
  }
  if (!payload.sub) throw new SocialAuthError('Invalid Apple token');
  if (expectedNonce && payload.nonce !== expectedNonce) throw new SocialAuthError('Nonce mismatch');
  return {
    provider: 'apple',
    sub: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : undefined,
    emailVerified: true, // Apple only issues tokens for verified Apple IDs
    name,
  };
}

/**
 * Resolve a verified social identity to a User:
 *   1. existing user with this provider sub → return it
 *   2. verified email matches an existing user → link the provider sub onto it
 *   3. otherwise create a new USER (no password)
 * Linking happens ONLY for verified emails (prevents account takeover).
 */
export async function resolveSocialUser(identity: SocialIdentity): Promise<User> {
  const subField = identity.provider === 'google' ? 'googleSub' : 'appleSub';

  const bySub = await prisma.user.findFirst({ where: { [subField]: identity.sub } });
  if (bySub) return bySub;

  if (identity.email && identity.emailVerified) {
    const email = identity.email.toLowerCase();
    const byEmail = await prisma.user.findUnique({ where: { email } });
    if (byEmail) {
      return prisma.user.update({ where: { id: byEmail.id }, data: { [subField]: identity.sub } });
    }
  }

  const fallbackEmail = (identity.email || `${identity.provider}_${identity.sub}@users.noreply.local`).toLowerCase();
  return prisma.user.create({
    data: {
      email: fallbackEmail,
      name: identity.name || identity.email?.split('@')[0] || 'User',
      role: 'USER',
      [subField]: identity.sub,
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/social-auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/social-auth.ts src/lib/__tests__/social-auth.test.ts
git commit -m "feat(social-auth): token verification + account-linking core"
```

---

### Task 4: Extract reusable mobile session issuance

**Files:**
- Modify: `src/lib/auth.ts` (add `issueMobileSession`)
- Modify: `src/app/api/mobile/v1/auth/login/route.ts` (use the helper)
- Test: `src/lib/__tests__/issue-mobile-session.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/issue-mobile-session.test.ts
import { issueMobileSession } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx'; });

it('issues an access token + persisted refresh session for a user', async () => {
  const user = await prisma.user.create({
    data: { email: `issue-${Date.now()}@test.local`, name: 'Issue', password: await hashPassword('Password123'), isActive: true },
  });

  const result = await issueMobileSession(user);

  expect(typeof result.accessToken).toBe('string');
  expect(typeof result.refreshToken).toBe('string');
  expect(result.user.id).toBe(user.id);

  const sessions = await prisma.session.findMany({ where: { userId: user.id } });
  expect(sessions.length).toBe(1);
  expect(sessions[0].familyId).toBe(sessions[0].id);

  await prisma.user.delete({ where: { id: user.id } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/issue-mobile-session.test.ts`
Expected: FAIL — `issueMobileSession is not a function`.

- [ ] **Step 3: Add `issueMobileSession` to `src/lib/auth.ts`**

Add this export (it reuses the existing `sha256` and `prisma` already imported in the file; add the `signAccessToken` import at the top alongside the other imports: `import { signAccessToken } from '@/lib/jwt';`):

```typescript
const REFRESH_TTL_DAYS = 60;

/** Issues a mobile session (persisted refresh token + access JWT) for an already-authenticated user. */
export async function issueMobileSession(user: {
  id: string; email: string; name: string; role: UserRole; avatarUrl: string | null;
}) {
  const rawRefresh = createRawSessionToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000);

  const session = await prisma.session.create({
    data: { userId: user.id, tokenHash: sha256(rawRefresh), expiresAt, familyId: '__placeholder__' },
  });
  await prisma.session.update({ where: { id: session.id }, data: { familyId: session.id } });

  return {
    accessToken: signAccessToken(user.id),
    refreshToken: rawRefresh,
    user: toSafeUser(user),
  };
}
```

- [ ] **Step 4: Run the new test to verify it passes**

Run: `npm test -- src/lib/__tests__/issue-mobile-session.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor mobile login to use the helper**

In `src/app/api/mobile/v1/auth/login/route.ts`, replace the inline refresh-session creation + access-token + payload block (everything from `// Create refresh-token session` through the `return NextResponse.json(payload, { status: 200 });`) with:
```ts
  const payload = await issueMobileSession(user);
  return NextResponse.json(payload, { status: 200 });
```
Add the import: `import { issueMobileSession } from '@/lib/auth';` and remove the now-unused local helpers/constants in that file (`REFRESH_TTL_DAYS`, `createRawRefreshToken`, and the local `sha256` if no longer referenced). Keep `verifyPassword` import.

- [ ] **Step 6: Verify login tests still pass + type-check**

Run: `npm test -- src/app/api/mobile/v1/auth/__tests__/login.test.ts && npx tsc --noEmit`
Expected: existing login tests still PASS; tsc exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/app/api/mobile/v1/auth/login/route.ts src/lib/__tests__/issue-mobile-session.test.ts
git commit -m "refactor(auth): extract issueMobileSession; reuse in mobile login"
```

---

### Task 5: Web social endpoints

**Files:**
- Create: `src/app/api/auth/google/route.ts`
- Create: `src/app/api/auth/apple/route.ts`
- Test: `src/app/api/auth/google/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test** (mocks the verifier; asserts bad token → 401)

```typescript
// src/app/api/auth/google/__tests__/route.test.ts
import { NextRequest } from 'next/server';

jest.mock('@/lib/social-auth', () => {
  const actual = jest.requireActual('@/lib/social-auth');
  return { ...actual, verifyGoogleIdToken: jest.fn() };
});
jest.mock('@/lib/auth', () => ({ createSession: jest.fn() }));

import { POST } from '../route';
import { verifyGoogleIdToken, SocialAuthError } from '@/lib/social-auth';

function mkReq(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/auth/google', {
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/auth/google/__tests__/route.test.ts`
Expected: FAIL — cannot find `../route`.

- [ ] **Step 3: Implement the web Google endpoint**

```typescript
// src/app/api/auth/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdToken, resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import { createSession, toSafeUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  try {
    const identity = await verifyGoogleIdToken(body.idToken);
    const user = await resolveSocialUser(identity);
    if (!user.isActive) {
      return NextResponse.json({ error: 'החשבון מושבת.' }, { status: 403 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: toSafeUser(user) }, { status: 200 });
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return NextResponse.json({ error: 'ההתחברות נכשלה.' }, { status: 401 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Implement the web Apple endpoint**

```typescript
// src/app/api/auth/apple/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAppleIdToken, resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import { createSession, toSafeUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { idToken?: string; nonce?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  try {
    const identity = await verifyAppleIdToken(body.idToken, body.nonce, body.name);
    const user = await resolveSocialUser(identity);
    if (!user.isActive) {
      return NextResponse.json({ error: 'החשבון מושבת.' }, { status: 403 });
    }
    await createSession(user.id);
    return NextResponse.json({ user: toSafeUser(user) }, { status: 200 });
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return NextResponse.json({ error: 'ההתחברות נכשלה.' }, { status: 401 });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run test + type-check**

Run: `npm test -- src/app/api/auth/google/__tests__/route.test.ts && npx tsc --noEmit`
Expected: 2 tests PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/google src/app/api/auth/apple
git commit -m "feat(social-auth): web Google + Apple sign-in endpoints"
```

---

### Task 6: Mobile social endpoints

**Files:**
- Create: `src/app/api/mobile/v1/auth/google/route.ts`
- Create: `src/app/api/mobile/v1/auth/apple/route.ts`
- Test: `src/app/api/mobile/v1/auth/google/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/mobile/v1/auth/google/__tests__/route.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/mobile/v1/auth/google/__tests__/route.test.ts`
Expected: FAIL — cannot find `../route`.

- [ ] **Step 3: Implement the mobile Google endpoint**

```typescript
// src/app/api/mobile/v1/auth/google/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyGoogleIdToken, resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import { issueMobileSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { idToken?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  try {
    const identity = await verifyGoogleIdToken(body.idToken);
    const user = await resolveSocialUser(identity);
    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }
    const payload = await issueMobileSession(user);
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return NextResponse.json({ error: 'Sign-in failed' }, { status: 401 });
    }
    throw err;
  }
}
```

- [ ] **Step 4: Implement the mobile Apple endpoint**

```typescript
// src/app/api/mobile/v1/auth/apple/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { verifyAppleIdToken, resolveSocialUser, SocialAuthError } from '@/lib/social-auth';
import { issueMobileSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let body: { idToken?: string; nonce?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'idToken is required' }, { status: 400 });
  }
  try {
    const identity = await verifyAppleIdToken(body.idToken, body.nonce, body.name);
    const user = await resolveSocialUser(identity);
    if (!user.isActive) {
      return NextResponse.json({ error: 'Account disabled' }, { status: 403 });
    }
    const payload = await issueMobileSession(user);
    return NextResponse.json(payload, { status: 200 });
  } catch (err) {
    if (err instanceof SocialAuthError) {
      return NextResponse.json({ error: 'Sign-in failed' }, { status: 401 });
    }
    throw err;
  }
}
```

- [ ] **Step 5: Run test + full suite + type-check**

Run: `npm test -- src/app/api/mobile/v1/auth/google/__tests__/route.test.ts && npx tsc --noEmit`
Expected: 2 tests PASS; tsc exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/mobile/v1/auth/google src/app/api/mobile/v1/auth/apple
git commit -m "feat(social-auth): mobile Google + Apple sign-in endpoints"
```

---

### Task 7: Version bump + full verification + deploy

**Files:**
- Modify: `src/lib/version.ts`, `package.json` (bump to `0.12.0`)

- [ ] **Step 1: Bump version**

Set `APP_VERSION = '0.12.0'` in `src/lib/version.ts` and `"version": "0.12.0"` in `package.json`.

- [ ] **Step 2: Full verification**

Run: `npm run build` (expect exit 0) and `npm test -- src/lib/__tests__/social-auth.test.ts src/lib/__tests__/issue-mobile-session.test.ts src/app/api/auth/google/__tests__/route.test.ts src/app/api/mobile/v1/auth/google/__tests__/route.test.ts` (expect all pass).
> Note: the pre-existing `games/[id]` test fails on `main` too (local DB drift) — unrelated, not a blocker.

- [ ] **Step 3: Commit**

```bash
git add src/lib/version.ts package.json
git commit -m "chore: social-login backend (v0.12.0)"
```

- [ ] **Step 4: Deploy** (after merge to main per finishing-a-development-branch)

On the server, `npx prisma db push` MUST run before build because the schema changed:
```bash
ssh hbstats-deploy 'cd ~/hbstats && git pull && npm install && npx prisma db push && npx prisma generate && npm run build && pm2 restart hbstats && pm2 save'
```

- [ ] **Step 5: Verify live** (endpoints exist but reject until creds are set)

```bash
# Missing idToken → 400; present-but-unconfigured → 401. Either proves the route is deployed (not 404).
curl -sk -o /dev/null -w "%{http_code}\n" -X POST https://hbs.co.il/api/auth/google -H 'content-type: application/json' -d '{}'
```
Expected: `400`.

---

## Self-Review

**Spec coverage:** Implements spec §1 (schema: optional password + `googleSub`/`appleSub`), §2 (`social-auth.ts`: `verifyGoogleIdToken`, `verifyAppleIdToken`, `resolveSocialUser` with verified-email-only linking), §3 (web `/api/auth/google|apple`, mobile `/api/mobile/v1/auth/google|apple`), and the config env vars. Mobile UI (§4) and web UI (§5) are explicitly deferred to separate credential-gated plans.

**Placeholder scan:** No TBD/TODO; every step has concrete code or exact commands.

**Type consistency:** `SocialIdentity` shape is produced by both verifiers and consumed by `resolveSocialUser`; `SocialAuthError` thrown by verifiers and caught in all four endpoints; `issueMobileSession(user)` returns `{accessToken, refreshToken, user}` matching `LoginResponse` and is used by mobile login + both mobile social endpoints; `createSession(userId)` + `toSafeUser(user)` used by web endpoints. The `strict:false` narrowing caveat is noted and avoided (endpoints use try/catch, not union narrowing).

**Notes:**
- Provider columns are written via Prisma's computed-key (`[subField]`) — valid Prisma usage; both `googleSub`/`appleSub` exist on the model after Task 2.
- Endpoints deploy safely without credentials: verifiers throw `SocialAuthError` ("not configured") → 401, so no crashes.
- Deploy step requires `npx prisma db push` on the server because the schema changed — called out explicitly.
