# Social Login (Google + Apple) & Account Deletion — Design

**Date:** 2026-06-06
**Status:** Approved (design) — pending spec review
**Driver:** App Store compliance + user-requested auth options

## Goal

Add "Sign in with Google" and "Sign in with Apple" to **both** the web app and the
iOS (Expo) app, and add **in-app account deletion** (required by App Store Review
Guideline 5.1.1(v)). Existing email/password login is kept. Social sign-in links to
an existing account when the verified email matches.

## Non-goals

- Not adopting NextAuth/Auth.js — the existing custom session + mobile-JWT system stays.
- Not adding providers beyond Google and Apple.
- No Android-specific work (iOS app + web only for now).
- No MFA/2FA (not required by Apple; out of scope).

## Decisions (from brainstorming)

- **Platforms:** web + mobile.
- **Account linking:** link to the same account when a **verified** provider email
  matches an existing user.
- **Methods:** keep all three — email/password, Google, Apple.
- **Identity storage:** provider columns on `User` (not a separate table) — only two providers.

## Architecture

Extend the existing auth rather than replace it. A shared verification/resolution core
is consumed by thin web and mobile endpoints, which reuse the existing session-cookie
issuance (web) and access/refresh JWT issuance (mobile).

```
                 ┌─────────────────────────────────────────┐
   client token  │   src/lib/social-auth.ts (shared core)   │
  (Google/Apple) │  verifyGoogleIdToken / verifyAppleIdToken │
        ─────────▶  resolveSocialUser  (find / link / create)│
                 └───────────────┬─────────────────────────┬─┘
                                 │                         │
              web endpoints      │                         │  mobile endpoints
   POST /api/auth/google|apple   ▼                         ▼  POST /api/mobile/v1/auth/google|apple
        createSession (cookie)                       issue access+refresh JWT
```

## Components

### 1. Schema changes (`prisma/schema.prisma`, model `User`)

- `password String` → `password String?` (social-only users have no password)
- add `googleSub String? @unique`
- add `appleSub  String? @unique`

Applied with `npx prisma db push` + `npx prisma generate` (no migration files, per project convention).

### 2. Shared core — `src/lib/social-auth.ts`

- `verifyGoogleIdToken(idToken: string): Promise<SocialIdentity>`
  - uses `google-auth-library` `OAuth2Client.verifyIdToken`, audience = configured Google client IDs (iOS + web).
  - returns `{ provider: 'google', sub, email, emailVerified, name }`.
- `verifyAppleIdToken(idToken: string, expectedNonce?: string): Promise<SocialIdentity>`
  - fetches Apple JWKS (`https://appleid.apple.com/auth/keys`), verifies the JWT with `jose`.
  - validates `iss === 'https://appleid.apple.com'`, `aud ∈ configured Apple client/Service IDs`, expiry, and nonce when present.
  - Apple only returns `email` on first authorization and the name is never in the token → name comes from the client payload on first sign-in.
  - returns `{ provider: 'apple', sub, email, emailVerified: true, name? }`.
- `resolveSocialUser(identity): Promise<User>`
  1. find by `${provider}Sub` → return that user.
  2. else if `emailVerified` and a user with that `email` exists → set `${provider}Sub` on it (link) → return.
  3. else create a new `USER` (no password, `${provider}Sub` set, name from identity/email).
  - **Security:** linking happens only when `emailVerified` is true. Unverified email → never auto-link (treated as new account or rejected).

`SocialIdentity = { provider: 'google'|'apple'; sub: string; email?: string; emailVerified: boolean; name?: string }`

### 3. Endpoints

Web (cookie session, reuse `createSession`):
- `POST /api/auth/google` — body `{ idToken }`
- `POST /api/auth/apple`  — body `{ idToken, nonce?, name? }`

Mobile (bearer, reuse existing access/refresh issuance + `Session` row):
- `POST /api/mobile/v1/auth/google` — body `{ idToken }`
- `POST /api/mobile/v1/auth/apple`  — body `{ idToken, nonce?, name? }`

All four: verify → `resolveSocialUser` → issue session/tokens → return the same shape
as the existing email/password login on that platform. CSRF middleware already exempts
requests without an Origin (mobile) and validates web Origins.

### 4. Mobile UI (`mobile/app/login.tsx`, `mobile/contexts` auth)

- Apple: `expo-apple-authentication`. Render `AppleAuthenticationButton` **only on iOS**
  (`Platform.OS === 'ios'`). Generate a nonce, request `FULL_NAME` + `EMAIL` scopes,
  send `identityToken` (+ nonce, + name on first sign-in) to the mobile apple endpoint.
- Google: `@react-native-google-signin/google-signin` (requires EAS dev build — already in use).
  Configure with iOS client ID; on success send `idToken` to the mobile google endpoint.
- Auth context gains `loginWithGoogle()` / `loginWithApple()` that store the returned
  access/refresh tokens exactly like password login.
- `app.json`: add `expo-apple-authentication` plugin, `usesAppleSignIn: true`, and the
  Google reversed-client-id URL scheme; keep existing bundle id / EAS project.

### 5. Web UI (`src/app/login`, `src/app/register`)

- Google: Google Identity Services button → returns an ID token credential → POST to `/api/auth/google` → on success refresh to home.
- Apple: Sign in with Apple JS → identity token → POST to `/api/auth/apple`.
  Requires an Apple **Service ID** and a verified return URL/domain.
- Buttons added beneath the existing email/password form on both pages.

### 6. Account deletion

- Core `deleteUserAccount(userId)` (transaction):
  - **Guard:** if the user is `ADMIN` and is the only remaining `ADMIN`, refuse (`409`/error) — prevents self-lockout.
  - delete the user's `Session` rows, then the `User`. Dependent operational rows
    (activity logs / fetch jobs / merge operations) are detached or removed per their
    FK rules so the delete succeeds; regular users have none of these.
- Web: `DELETE /api/account` + a confirm-and-delete control on `/account`. After success, clear session and redirect home.
- Mobile: `DELETE /api/mobile/v1/account` + a "מחיקת חשבון" button in Preferences with a
  confirm dialog. On success, clear stored tokens and route to `/login`.

## Configuration / secrets (env)

- `GOOGLE_CLIENT_ID_WEB`, `GOOGLE_CLIENT_ID_IOS` — accepted audiences for Google verification.
- `APPLE_CLIENT_IDS` — comma-separated accepted audiences (iOS bundle id + web Service ID).
- Mobile public: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` (and reversed id in `app.json`).

## External setup (owner-provided prerequisites)

- **Apple Developer:** enable "Sign in with Apple" capability for the app id; create a
  **Service ID** + key and configure the web return URL/domain (for web Apple sign-in).
- **Google Cloud Console:** create OAuth client IDs — one **iOS**, one **Web** —
  and add the web origin to authorized JavaScript origins.

The implementation will document exact portal steps; these cannot be automated.

## Error handling

- Invalid/expired provider token → `401` with a generic message (no internal details).
- Audience/issuer mismatch → `401`.
- Apple first-sign-in without email (rare, relay edge cases) → create account keyed by
  `appleSub`; allow later email capture.
- Deletion of last admin → blocked with a clear message.
- Existing public-API rate limiting and CSRF behavior unchanged.

## Testing (Jest, following existing backend patterns)

- `resolveSocialUser`: new-user creation; link-by-verified-email; existing-sub returns same user; unverified-email does NOT link.
- Token verification: mocked Google/Apple verifiers (audience/issuer/nonce failures rejected).
- Endpoints: google/apple login returns tokens/session; bad token → 401.
- `deleteUserAccount`: deletes user + sessions; last-admin guard blocks deletion.
- Mobile: auth-context social methods store tokens (mocked endpoints, MSW).

## Rollout

1. Schema push + core + endpoints + backend tests.
2. Account deletion (backend + both UIs) — ship first; it is the App Store blocker and has no external prerequisites.
3. Mobile social UI (after Google/Apple credentials exist).
4. Web social UI (after Apple Service ID configured).
5. Version bump, deploy, verify.

Account deletion can ship independently and immediately; social login lands once the
owner-provided credentials are in place.
