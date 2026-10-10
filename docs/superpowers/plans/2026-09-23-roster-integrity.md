# Roster Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit every current-season squad, apply only verified player movement statuses, and provide an admin review queue for duplicates and unresolved roster discrepancies.

**Architecture:** Keep the current JSON-backed status model in `Player.additionalInfo`, and add pure TypeScript functions that turn API-Football transfer rows and supplier roster rows into verified or review-only actions. A protected admin API executes individual approved actions atomically; the admin page consumes its report and never performs automatic low-confidence merges.

**Tech Stack:** Next.js App Router, TypeScript, Prisma/PostgreSQL, Tailwind, Jest.

---

## File structure

- Create `src/lib/roster-integrity.ts`: status types, transfer classification, canonical-family duplicate confidence, and report builders.
- Create `src/lib/__tests__/roster-integrity.test.ts`: pure logic tests.
- Create `src/app/api/admin/roster-integrity/route.ts`: authenticated report and individual apply endpoints.
- Create `src/app/admin/roster-integrity/page.tsx`: server-loaded admin route.
- Create `src/components/AdminRosterIntegrityClient.tsx`: review, apply, reject controls.
- Modify `src/components/AdminShell.tsx`: add the admin navigation item.
- Create `scripts/audit-roster-integrity.js`: dry-run command for production auditing.
- Modify `scripts/reconcile-beer-sheva-roster-2026.js`: reuse the common status writer or remove it after parity is verified.
- Modify `src/lib/roster-status.ts`: add `confidence` and a shared updater that preserves unrelated JSON.

### Task 1: Status model and pure classifier

**Files:**
- Modify: `src/lib/roster-status.ts`
- Create: `src/lib/roster-integrity.ts`
- Test: `src/lib/__tests__/roster-integrity.test.ts`

- [ ] **Step 1: Write failing tests for status labels and safe confidence rules.**

```ts
import { classifyTransfer, scoreDuplicateCandidate } from '@/lib/roster-integrity';

test('marks an outgoing loan with verified confidence when API ids match', () => {
  expect(classifyTransfer({ playerApiId: 7, sourceApiTeamId: 1, destinationNameHe: 'מ.ס. אשדוד', date: new Date('2026-09-20'), type: 'Loan' }, { apiFootballId: 7, teamApiId: 1 })).toMatchObject({ kind: 'LOAN', confidence: 'VERIFIED' });
});

test('does not auto-merge a name-only duplicate', () => {
  expect(scoreDuplicateCandidate({ nameEn: 'A. Cohen' }, { nameEn: 'A. Cohen' })).toBe('REVIEW');
});
```

- [ ] **Step 2: Run the focused test and confirm it fails.**

Run: `npx jest src/lib/__tests__/roster-integrity.test.ts --runInBand`

Expected: FAIL because the integrity module does not exist.

- [ ] **Step 3: Define shared types and implementation.**

```ts
export type RosterIntegrityConfidence = 'VERIFIED' | 'REVIEW';
export type RosterActionKind = 'LOAN' | 'SOLD' | 'DEPARTED';
export type RosterIntegrityAction = { playerId: string; kind: RosterActionKind; destinationNameHe?: string; effectiveDate?: string; sourceUrl?: string; confidence: RosterIntegrityConfidence; reason: string };

export function scoreDuplicateCandidate(a: Identity, b: Identity) {
  if (a.apiFootballId && a.apiFootballId === b.apiFootballId) return 'VERIFIED';
  if (a.birthDate && a.birthDate === b.birthDate && normalizedFullName(a) === normalizedFullName(b)) return 'VERIFIED';
  return 'REVIEW';
}
```

`classifyTransfer` must only return an action when the roster player is on the transfer source team. Map `loan` to `LOAN`, permanent transfer to `SOLD`, and release/free/unknown outgoing status to `DEPARTED`.

- [ ] **Step 4: Extend `RosterStatus` without breaking existing data.**

```ts
confidence?: 'VERIFIED' | 'REVIEW';
updatedAt?: string;

export function withRosterStatus(additionalInfo: unknown, rosterStatus: RosterStatus) {
  return { ...(additionalInfo && typeof additionalInfo === 'object' ? additionalInfo as Record<string, unknown> : {}), departed: true, rosterStatus };
}
```

- [ ] **Step 5: Run tests and type check.**

Run: `npx jest src/lib/__tests__/roster-integrity.test.ts --runInBand && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add src/lib/roster-status.ts src/lib/roster-integrity.ts src/lib/__tests__/roster-integrity.test.ts
git commit -m "feat: add roster integrity classifier"
```

### Task 2: Production dry-run auditor

**Files:**
- Create: `scripts/audit-roster-integrity.js`
- Test: `src/lib/__tests__/roster-integrity.test.ts`

- [ ] **Step 1: Add a test fixture with a verified API identity and an ambiguous name-only family.**

```ts
expect(buildIntegrityReport(fixture)).toEqual(expect.objectContaining({ verified: [expect.objectContaining({ kind: 'LOAN' })], review: [expect.objectContaining({ reason: 'name-only match' })] }));
```

- [ ] **Step 2: Implement a read-only script.**

```js
const season = await prisma.season.findFirst({ where: { year }, select: { id: true, name: true } });
const [players, transfers] = await Promise.all([
  prisma.player.findMany({ where: { team: { seasonId: season.id } }, include: { team: true } }),
  prisma.playerTransfer.findMany({ where: { seasonId: season.id } }),
]);
const report = buildIntegrityReport({ players, transfers });
console.log(JSON.stringify(report, null, 2));
```

The script accepts `--season 2026`, `--team <id>` and `--json <path>`. It must never write data.

- [ ] **Step 3: Run focused tests and a local dry run.**

Run: `npx jest src/lib/__tests__/roster-integrity.test.ts --runInBand && node scripts/audit-roster-integrity.js --season 2026`

Expected: tests PASS; report contains counts and no write query.

- [ ] **Step 4: Commit.**

```bash
git add scripts/audit-roster-integrity.js src/lib/__tests__/roster-integrity.test.ts
git commit -m "feat: add roster integrity dry run"
```

### Task 3: Protected admin API

**Files:**
- Create: `src/app/api/admin/roster-integrity/route.ts`
- Modify: `src/lib/roster-integrity.ts`

- [ ] **Step 1: Write a route-level test for authorization and verified-only mutation.**

```ts
expect(await POST(requestFor({ actionId: 'review-only-id' }))).toHaveProperty('status', 422);
expect(await POST(requestFor({ actionId: 'verified-id' }))).toHaveProperty('status', 200);
```

- [ ] **Step 2: Implement `GET` and `POST`.**

```ts
await requireAdminUser();
// GET returns report for ?season=<id>.
// POST accepts { action, playerId, status } and rejects status.confidence !== 'VERIFIED'.
await prisma.$transaction([
  prisma.player.update({ where: { id: playerId }, data: { additionalInfo: withRosterStatus(current.additionalInfo, status) } }),
]);
```

Use `NextResponse.json({ error: '...' }, { status: 422 })` for stale/missing actions. Do not expose unverified actions as executable.

- [ ] **Step 3: Run route tests, type check, and commit.**

Run: `npm test -- --runInBand && npx tsc --noEmit`

```bash
git add src/app/api/admin/roster-integrity/route.ts src/lib/roster-integrity.ts
git commit -m "feat: add roster integrity admin API"
```

### Task 4: Admin review page

**Files:**
- Create: `src/app/admin/roster-integrity/page.tsx`
- Create: `src/components/AdminRosterIntegrityClient.tsx`
- Modify: `src/components/AdminShell.tsx`

- [ ] **Step 1: Render the route server-side with `requireAdminUser` and current-season default.**

```tsx
await requireAdminUser();
return <AdminRosterIntegrityClient initialSeasonId={season.id} initialReport={report} />;
```

- [ ] **Step 2: Implement the client review sections.**

```tsx
<section><h2>פעולות מאומתות</h2><ActionTable rows={report.verified} applyable /></section>
<section><h2>דורש בדיקה</h2><ActionTable rows={report.review} applyable={false} /></section>
<section><h2>כפילויות</h2><DuplicateTable rows={report.duplicates} /></section>
```

Each row displays player, source/destination, type, date, evidence and confidence. Applying calls `/api/admin/roster-integrity`, updates the row in place, and presents an error inline on failure.

- [ ] **Step 3: Add an admin navigation item.**

```ts
{ href: '/admin/roster-integrity', label: 'תקינות סגלים', icon: ShieldCheck }
```

- [ ] **Step 4: Run type check and build.**

Run: `npx tsc --noEmit && npm run build`

Expected: production build completes when the configured database is reachable.

- [ ] **Step 5: Commit.**

```bash
git add src/app/admin/roster-integrity/page.tsx src/components/AdminRosterIntegrityClient.tsx src/components/AdminShell.tsx
git commit -m "feat: add roster integrity admin review"
```

### Task 5: Apply current-season verified actions and deploy

**Files:**
- Modify: `scripts/reconcile-beer-sheva-roster-2026.js` only if its output differs from the shared dry-run report.
- Modify: `package.json`, `src/lib/version.ts`

- [ ] **Step 1: Run the production dry-run and save its JSON report.**

Run on server: `node scripts/audit-roster-integrity.js --season 2026 --json /tmp/roster-integrity-2026.json`

Expected: a report with verified and review-only actions; inspect every verified action before applying.

- [ ] **Step 2: Apply only the verified report actions through the admin endpoint or audited CLI transaction.**

Run: `node scripts/audit-roster-integrity.js --season 2026 --apply-verified --report /tmp/roster-integrity-2026.json`

Expected: status updates only; no `delete` operations against Player, GameEvent, GameLineupEntry, MediaAsset, or PlayerStatistics.

- [ ] **Step 3: Bump matching versions and run verification.**

Update both `package.json` and `src/lib/version.ts` to the same next minor version. Run: `npm test -- --runInBand && npx tsc --noEmit && git diff --check`.

- [ ] **Step 4: Commit, push, build and restart.**

```bash
git add package.json src/lib/version.ts
git commit -m "feat: audit current season rosters"
git push origin codex/fix-turner-venue-data
ssh hbstats-deploy 'cd /home/hbs/hbstats && git fetch origin && git merge --ff-only origin/codex/fix-turner-venue-data && npm run build && pm2 restart hbstats'
```

- [ ] **Step 5: Verify production.**

Run: `curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3100/admin/roster-integrity` and confirm `200` for an authenticated browser session, team page HTTP 200, and no duplicate active canonical families in the dry-run report.
