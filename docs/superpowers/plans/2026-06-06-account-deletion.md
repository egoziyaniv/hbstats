# Account Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users delete their account in-app (web + iOS), as required by App Store Review Guideline 5.1.1(v), with a guard that prevents deleting the last admin.

**Architecture:** A shared core (`src/lib/account.ts`) deletes the user and (via Prisma's default referential actions) cascades sessions and null-detaches operational rows. A pure guard helper blocks orphaning the last admin. Thin `DELETE` route handlers (web cookie session + mobile bearer) wrap the core. Web adds a confirm button on `/account`; mobile adds one in Preferences.

**Tech Stack:** Next.js 14 route handlers, Prisma, Jest (real-DB backend tests), Expo/React Native, MSW (mobile tests).

---

## Background facts (verified)

- `getRequestUser(request)` resolves either the web session cookie or the mobile bearer token → `{ id, role, ... }` or null.
- Prisma referential actions on `User` deletion: `Session` → `Cascade`; `ActivityLog`, `FetchJob`, `MergeOperation` (optional relations) → `SetNull`. So `prisma.user.delete()` succeeds without manual FK cleanup.
- Backend Jest tests create real rows (`roots: ['<rootDir>/src']`, `testMatch: ['**/__tests__/**/*.test.ts']`). The live DB already contains exactly one `ADMIN` (the owner).
- Mobile `apiClient` exposes `get/post/put` only — no delete yet.

---

### Task 1: Deletion core + pure last-admin guard

**Files:**
- Create: `src/lib/account.ts`
- Test: `src/lib/__tests__/account.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/__tests__/account.test.ts
import { wouldOrphanLastAdmin, deleteUserAccount } from '@/lib/account';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

describe('wouldOrphanLastAdmin (pure)', () => {
  it('allows deleting a regular USER regardless of admin count', () => {
    expect(wouldOrphanLastAdmin('USER', 1)).toBe(false);
    expect(wouldOrphanLastAdmin('USER', 0)).toBe(false);
  });
  it('blocks deleting an ADMIN when they are the only active admin', () => {
    expect(wouldOrphanLastAdmin('ADMIN', 1)).toBe(true);
  });
  it('allows deleting an ADMIN when other admins remain', () => {
    expect(wouldOrphanLastAdmin('ADMIN', 2)).toBe(false);
  });
});

describe('deleteUserAccount (real DB)', () => {
  it('deletes a USER and their sessions', async () => {
    const user = await prisma.user.create({
      data: {
        email: `del-test-${Date.now()}@test.local`,
        name: 'Delete Me',
        password: await hashPassword('Password123'),
        isActive: true,
      },
    });
    await prisma.session.create({
      data: { userId: user.id, tokenHash: `hash-${Date.now()}`, familyId: 'fam', expiresAt: new Date(Date.now() + 1000) },
    });

    const result = await deleteUserAccount(user.id);

    expect(result).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('returns not_found for a missing user', async () => {
    expect(await deleteUserAccount('nonexistent-id')).toEqual({ ok: false, reason: 'not_found' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/__tests__/account.test.ts`
Expected: FAIL — `Cannot find module '@/lib/account'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/account.ts
import prisma from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'last_admin' };

/** Pure guard: would deleting a user of this role remove the final active admin? */
export function wouldOrphanLastAdmin(role: UserRole, activeAdminCount: number): boolean {
  return role === 'ADMIN' && activeAdminCount <= 1;
}

/**
 * Hard-deletes a user. Sessions cascade; operational rows (activity logs, fetch
 * jobs, merge operations) are detached via Prisma's default SetNull. Refuses to
 * delete the last active admin so the owner cannot lock themselves out.
 */
export async function deleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return { ok: false, reason: 'not_found' };

  if (user.role === 'ADMIN') {
    const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (wouldOrphanLastAdmin(user.role, activeAdminCount)) {
      return { ok: false, reason: 'last_admin' };
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  return { ok: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/__tests__/account.test.ts`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/lib/account.ts src/lib/__tests__/account.test.ts
git commit -m "feat(account): core deleteUserAccount + last-admin guard"
```

---

### Task 2: Web DELETE /api/account endpoint

**Files:**
- Create: `src/app/api/account/route.ts`
- Test: `src/app/api/account/__tests__/route.test.ts`

> Note: client-side fetches reference `/api/account/preferences` (a separate nested route). This task adds the top-level `/api/account` DELETE handler; it does not touch preferences.

- [ ] **Step 1: Write the failing test**

```typescript
// src/app/api/account/__tests__/route.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/account/__tests__/route.test.ts`
Expected: FAIL — cannot find `../route`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/account/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { deleteUserAccount } from '@/lib/account';

const SESSION_COOKIE = 'hbs_session';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await deleteUserAccount(user.id);
  if (!result.ok) {
    if (result.reason === 'last_admin') {
      return NextResponse.json(
        { error: 'לא ניתן למחוק את חשבון המנהל האחרון.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'החשבון לא נמצא.' }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/account/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/account/route.ts src/app/api/account/__tests__/route.test.ts
git commit -m "feat(account): web DELETE /api/account endpoint"
```

---

### Task 3: Web UI — delete button on /account

**Files:**
- Create: `src/components/DeleteAccountButton.tsx`
- Modify: `src/app/account/page.tsx` (add the component near the bottom of the page content)

- [ ] **Step 1: Create the client component**

```tsx
// src/components/DeleteAccountButton.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'מחיקת החשבון נכשלה.');
        setBusy(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('מחיקת החשבון נכשלה.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5">
      <h2 className="text-lg font-black text-red-700">מחיקת חשבון</h2>
      <p className="mt-2 text-sm leading-6 text-red-700/80">
        מחיקת החשבון תסיר לצמיתות את המשתמש שלך ואת כל ההעדפות. הפעולה אינה הפיכה.
      </p>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          מחיקת החשבון שלי
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'מוחק…' : 'אישור מחיקה סופית'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700"
          >
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the account page**

Open `src/app/account/page.tsx`. Add the import at the top with the other imports:

```tsx
import DeleteAccountButton from '@/components/DeleteAccountButton';
```

Then render `<DeleteAccountButton />` just before the closing container of the page's main content (after the existing account/preferences sections). Place it inside the same centered wrapper used by the rest of the page so spacing matches.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/DeleteAccountButton.tsx src/app/account/page.tsx
git commit -m "feat(account): delete-account control on /account (web)"
```

---

### Task 4: Mobile backend DELETE /api/mobile/v1/account

**Files:**
- Create: `src/app/api/mobile/v1/account/route.ts`
- Test: `src/app/api/mobile/v1/account/__tests__/route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/app/api/mobile/v1/account/__tests__/route.test.ts`
Expected: FAIL — cannot find `../route`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/app/api/mobile/v1/account/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { deleteUserAccount } from '@/lib/account';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  const user = await getRequestUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await deleteUserAccount(user.id);
  if (!result.ok) {
    if (result.reason === 'last_admin') {
      return NextResponse.json({ error: 'Cannot delete the last admin account.' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/app/api/mobile/v1/account/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/mobile/v1/account/route.ts src/app/api/mobile/v1/account/__tests__/route.test.ts
git commit -m "feat(account): mobile DELETE /api/mobile/v1/account endpoint"
```

---

### Task 5: Mobile apiClient.del + AuthContext.deleteAccount

**Files:**
- Modify: `mobile/lib/apiClient.ts:89-95` (the exported object)
- Modify: `mobile/contexts/AuthContext.tsx` (add `deleteAccount` to interface, provider, value)
- Test: `mobile/contexts/__tests__/AuthContext.deleteAccount.test.tsx`

- [ ] **Step 1: Add `del` to apiClient**

In `mobile/lib/apiClient.ts`, add a `del` method to the exported `apiClient` object (after `put`):

```typescript
  del: <T>(path: string, headers?: Record<string, string>) =>
    request<T>(path, { method: 'DELETE', headers }),
```

- [ ] **Step 2: Write the failing test**

```tsx
// mobile/contexts/__tests__/AuthContext.deleteAccount.test.tsx
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/apiClient';
import { clearRefreshToken, loadRefreshToken } from '@/lib/auth';

jest.mock('@/lib/apiClient', () => ({
  apiClient: { del: jest.fn(), post: jest.fn(), get: jest.fn(), put: jest.fn() },
}));
jest.mock('@/lib/auth', () => ({
  setAccessToken: jest.fn(),
  storeRefreshToken: jest.fn(),
  loadRefreshToken: jest.fn().mockResolvedValue('refresh-x'),
  storeUser: jest.fn(),
  loadUser: jest.fn().mockResolvedValue(null),
  clearRefreshToken: jest.fn(),
}));

it('deleteAccount calls the endpoint and clears local auth', async () => {
  (apiClient.del as jest.Mock).mockResolvedValue(undefined);
  const wrapper = ({ children }: { children: React.ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  const { result } = renderHook(() => useAuth(), { wrapper });

  await act(async () => { await result.current.deleteAccount(); });

  expect(apiClient.del).toHaveBeenCalledWith('/account');
  expect(clearRefreshToken).toHaveBeenCalled();
  expect(result.current.user).toBeNull();
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npm test -- AuthContext.deleteAccount`
Expected: FAIL — `result.current.deleteAccount is not a function`.

- [ ] **Step 4: Implement `deleteAccount` in AuthContext**

In `mobile/contexts/AuthContext.tsx`:

Add to the `AuthState` interface (after `logout`):
```typescript
  deleteAccount: () => Promise<void>;
```

Add the function inside `AuthProvider` (after `logout`):
```typescript
  const deleteAccount = async () => {
    await apiClient.del('/account');
    await clearRefreshToken();
    setUser(null);
  };
```

Add it to the provider value:
```tsx
    <AuthContext.Provider value={{ user, isLoading, login, logout, deleteAccount }}>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npm test -- AuthContext.deleteAccount`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add mobile/lib/apiClient.ts mobile/contexts/AuthContext.tsx mobile/contexts/__tests__/AuthContext.deleteAccount.test.tsx
git commit -m "feat(account): mobile apiClient.del + AuthContext.deleteAccount"
```

---

### Task 6: Mobile UI — delete button in Preferences

**Files:**
- Modify: `mobile/app/(tabs)/preferences.tsx`

- [ ] **Step 1: Add the delete control**

In `mobile/app/(tabs)/preferences.tsx`:

Pull `deleteAccount` from the hook (it currently reads `{ user, logout }`):
```tsx
  const { user, logout, deleteAccount } = useAuth();
```

Add imports if not present:
```tsx
import { Alert } from 'react-native';
import { useState } from 'react';
```

Add a handler inside the component:
```tsx
  const [deleting, setDeleting] = useState(false);

  function confirmDelete() {
    Alert.alert(
      'מחיקת חשבון',
      'הפעולה תמחק לצמיתות את החשבון וההעדפות שלך. אי אפשר לבטל.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              router.replace('/login');
            } catch {
              Alert.alert('שגיאה', 'מחיקת החשבון נכשלה. נסה שוב.');
              setDeleting(false);
            }
          },
        },
      ],
    );
  }
```

Render a destructive button below the existing logout button (match the logout button's styling, red variant):
```tsx
        <Pressable
          onPress={confirmDelete}
          disabled={deleting}
          testID="delete-account"
          style={{ marginTop: 12, paddingVertical: 12, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', opacity: deleting ? 0.6 : 1 }}
        >
          <Text style={{ color: '#B91C1C', fontWeight: '800', fontSize: 15 }}>
            {deleting ? 'מוחק…' : 'מחיקת חשבון'}
          </Text>
        </Pressable>
```

> If `Pressable`/`Text`/`router` aren't already imported in this file, add them (`Pressable`, `Text` from `react-native`; `router` from `expo-router`). Check the top of the file — logout already uses `router.replace('/login')`, so `router` is present.

- [ ] **Step 2: Type-check**

Run: `cd mobile && npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Run mobile tests**

Run: `cd mobile && npm test`
Expected: all pass (existing 23 + new deleteAccount test).

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(tabs)/preferences.tsx"
git commit -m "feat(account): delete-account button in mobile Preferences"
```

---

### Task 7: Version bump, full verification, deploy

**Files:**
- Modify: `src/lib/version.ts`, `package.json` (bump to `0.11.0` — significant feature)

- [ ] **Step 1: Bump version**

Set `APP_VERSION = '0.11.0'` in `src/lib/version.ts` and `"version": "0.11.0"` in `package.json`.

- [ ] **Step 2: Full backend test + build**

Run: `npm test && npm run build`
Expected: all tests pass; build exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/version.ts package.json
git commit -m "chore: account deletion feature (v0.11.0)"
```

- [ ] **Step 4: Push + deploy**

```bash
git push origin main
ssh hbstats-deploy 'cd ~/hbstats && git pull && npm install && npm run build && pm2 restart hbstats && pm2 save'
```

- [ ] **Step 5: Verify live**

```bash
# DELETE without auth must be 401 (not 500, not 200)
curl -sk -o /dev/null -w "%{http_code}\n" -X DELETE https://hbs.co.il/api/account
```
Expected: `401`.

---

## Self-Review

**Spec coverage:** Implements spec §6 (account deletion: core with last-admin guard, web `DELETE /api/account` + UI, mobile `DELETE /api/mobile/v1/account` + Preferences UI) and the spec's rollout step 2 (ship deletion independently). Social login (spec §1–5) is intentionally a separate plan.

**Placeholder scan:** No TBD/TODO; all steps contain concrete code or exact commands.

**Type consistency:** `deleteUserAccount` returns `DeleteAccountResult` used identically in both endpoints; `wouldOrphanLastAdmin(role, count)` signature matches its test; `apiClient.del(path)` matches `deleteAccount`'s call and the test mock; `deleteAccount` added to `AuthState` matches its usage in Preferences.

**Note on FKs:** Relies on Prisma's verified default referential actions (Session=Cascade, optional user relations=SetNull). If a future required relation is added to `User`, the core's `prisma.user.delete()` would need an explicit transaction — out of scope here.
