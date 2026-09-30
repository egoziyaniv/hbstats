# Critical Code Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close all four P0 findings by making database restore, merge rollback, and password-reset token consumption fail closed and atomic.

**Architecture:** Extract the PostgreSQL restore decision tree into a small dependency-injected orchestrator, so command failures can be tested without executing PostgreSQL tools. Run merge rollback inside one serializable Prisma transaction with an atomic status claim and compare-before-restore checks. Consume password-reset tokens inside one interactive transaction using a conditional claim before changing the user.

**Tech Stack:** Next.js route handlers, TypeScript 5, Prisma 5/PostgreSQL, Jest 30, SWC Jest.

---

## File map

- Create `src/lib/db-restore.ts`: command-result types and the fail-closed restore/rollback state machine.
- Create `src/lib/__tests__/db-restore.test.ts`: unit coverage for every PostgreSQL command failure boundary.
- Modify `src/app/api/admin/db-transfer/route.ts`: invoke the tested state machine and map outcomes to Hebrew API responses and activity logs.
- Create `src/lib/merge-rollback-safety.ts`: normalize applied values and compare current rows with merge-written values.
- Create `src/lib/__tests__/merge-rollback-safety.test.ts`: unit tests for direct and preview-shaped applied data.
- Modify `src/lib/merge-engine.ts`: capture complete created-row baselines and execute rollback in one serializable transaction.
- Modify `src/lib/__tests__/merge-rollback-children.test.ts`: assert all-or-nothing conflict handling and atomic status claim.
- Modify `src/lib/__tests__/data-repair.integration.test.ts`: assert later DB edits survive a rejected rollback.
- Modify `src/app/api/auth/reset-confirm/route.ts`: move token validation and consumption into an interactive transaction.
- Modify `src/app/api/mobile/v1/auth/__tests__/refresh.test.ts`: add real concurrent token-consumption coverage.
- Modify `docs/CODE-REVIEW-2026-09-30.md`: mark P0 findings fixed after verification.
- Modify `src/lib/version.ts` and `package.json`: apply the required patch version bump before push.

## Task 1: Fail-closed database restore

**Files:**
- Create: `src/lib/db-restore.ts`
- Create: `src/lib/__tests__/db-restore.test.ts`
- Modify: `src/app/api/admin/db-transfer/route.ts`

- [x] **Step 1: Write failing orchestration tests**

Create table-driven tests with injected Jest functions. The essential assertions are:

```ts
import { runRestoreWorkflow } from '@/lib/db-restore';

const ok = { code: 0, stdout: '', stderr: '', timedOut: false };
const failed = { code: 1, stdout: '', stderr: 'boom', timedOut: false };

test('does not restore the import when initial cleanup fails', async () => {
  const restoreImport = jest.fn();
  const result = await runRestoreWorkflow({
    dropBeforeImport: jest.fn().mockResolvedValue(failed),
    restoreImport,
    dropBeforeRollback: jest.fn(),
    restoreSnapshot: jest.fn(),
  });
  expect(result.phase).toBe('prepare_failed');
  expect(restoreImport).not.toHaveBeenCalled();
});

test('does not restore a snapshot when rollback cleanup fails', async () => {
  const restoreSnapshot = jest.fn();
  const result = await runRestoreWorkflow({
    dropBeforeImport: jest.fn().mockResolvedValue(ok),
    restoreImport: jest.fn().mockResolvedValue(failed),
    dropBeforeRollback: jest.fn().mockResolvedValue(failed),
    restoreSnapshot,
  });
  expect(result.phase).toBe('rollback_prepare_failed');
  expect(restoreSnapshot).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run the new tests and verify the red state**

Run:

```bash
npm test -- --runInBand src/lib/__tests__/db-restore.test.ts
```

Expected: FAIL because `@/lib/db-restore` does not exist.

- [x] **Step 3: Implement the restore state machine**

Create the following public contract and perform each dependency call only after the previous result has `code === 0`:

```ts
export type PgCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

type RestoreStep = () => Promise<PgCommandResult>;

export type RestoreWorkflowResult =
  | { phase: 'restored'; importResult: PgCommandResult }
  | { phase: 'prepare_failed'; prepareResult: PgCommandResult }
  | { phase: 'rolled_back'; importResult: PgCommandResult; rollbackResult: PgCommandResult }
  | { phase: 'rollback_prepare_failed'; importResult: PgCommandResult; prepareResult: PgCommandResult }
  | { phase: 'rollback_failed'; importResult: PgCommandResult; rollbackResult: PgCommandResult };

export async function runRestoreWorkflow(steps: {
  dropBeforeImport: RestoreStep;
  restoreImport: RestoreStep;
  dropBeforeRollback: RestoreStep;
  restoreSnapshot: RestoreStep;
}): Promise<RestoreWorkflowResult> {
  const prepare = await steps.dropBeforeImport();
  if (prepare.code !== 0) return { phase: 'prepare_failed', prepareResult: prepare };
  const imported = await steps.restoreImport();
  if (imported.code === 0) return { phase: 'restored', importResult: imported };
  const rollbackPrepare = await steps.dropBeforeRollback();
  if (rollbackPrepare.code !== 0) {
    return { phase: 'rollback_prepare_failed', importResult: imported, prepareResult: rollbackPrepare };
  }
  const rollback = await steps.restoreSnapshot();
  return rollback.code === 0
    ? { phase: 'rolled_back', importResult: imported, rollbackResult: rollback }
    : { phase: 'rollback_failed', importResult: imported, rollbackResult: rollback };
}
```

Update the route to call `runRestoreWorkflow`, log command details server-side, retain the snapshot for all three failure phases, and delete it after `restored` or `rolled_back`.

- [x] **Step 4: Run focused tests**

Run:

```bash
npm test -- --runInBand src/lib/__tests__/db-restore.test.ts
```

Expected: PASS for initial cleanup failure, import success, automatic rollback success, rollback cleanup failure, and rollback restore failure.

- [x] **Step 5: Commit the database-restore fix**

```bash
git add src/lib/db-restore.ts src/lib/__tests__/db-restore.test.ts src/app/api/admin/db-transfer/route.ts
git commit -m "fix(db): stop unsafe restore sequences"
```

## Task 2: Normalize rollback comparison data

**Files:**
- Create: `src/lib/merge-rollback-safety.ts`
- Create: `src/lib/__tests__/merge-rollback-safety.test.ts`

- [x] **Step 1: Write failing normalization tests**

```ts
import { normalizeAppliedFields, rowMatchesAppliedFields } from '@/lib/merge-rollback-safety';

test('normalizes both persisted applied formats', () => {
  expect(normalizeAppliedFields({ goals: 4, name: null })).toEqual({ goals: 4, name: null });
  expect(normalizeAppliedFields({ goals: { old: 2, new: 4 }, _events: { new: true } }))
    .toEqual({ goals: 4 });
});

test('compares dates and nullable values without representation conflicts', () => {
  expect(rowMatchesAppliedFields(
    { dateTime: new Date('2025-08-30T17:00:00.000Z'), venue: null },
    { dateTime: '2025-08-30T17:00:00.000Z', venue: null },
  )).toBe(true);
});
```

- [x] **Step 2: Run the helper tests and verify the red state**

Run:

```bash
npm test -- --runInBand src/lib/__tests__/merge-rollback-safety.test.ts
```

Expected: FAIL because the helper module does not exist.

- [x] **Step 3: Implement normalization and comparison**

```ts
function comparable(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value === undefined) return null;
  return value;
}

export function normalizeAppliedFields(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).flatMap(([key, value]) => {
    if (key.startsWith('_')) return [];
    if (value && typeof value === 'object' && 'new' in value) {
      return [[key, (value as { new: unknown }).new]];
    }
    return [[key, value]];
  }));
}

export function rowMatchesAppliedFields(row: Record<string, unknown>, fields: Record<string, unknown>): boolean {
  return Object.entries(fields).every(([key, expected]) =>
    comparable(row[key]) === comparable(expected));
}
```

- [x] **Step 4: Run helper tests**

Run the command from Step 2. Expected: PASS.

- [x] **Step 5: Commit the comparison helper**

```bash
git add src/lib/merge-rollback-safety.ts src/lib/__tests__/merge-rollback-safety.test.ts
git commit -m "test(merge): define safe rollback comparisons"
```

## Task 3: Make merge rollback atomic

**Files:**
- Modify: `src/lib/merge-engine.ts`
- Modify: `src/lib/__tests__/merge-rollback-children.test.ts`
- Modify: `src/lib/__tests__/data-repair.integration.test.ts`

- [x] **Step 1: Change tests to require all-or-nothing behavior**

Replace partial-success assertions with rejection and unchanged-state assertions:

```ts
await expect(rollbackMerge('m')).rejects.toThrow(/changed after the merge/);
expect(state.events()).toHaveLength(2);
expect(state.merge().status).toBe('executed');
```

Add a test where the first row can be reverted but the second row conflicts. Assert the first row remains unchanged after the rejected transaction. Add a parallel-call test whose mocked `updateMany` returns `{ count: 1 }` once and `{ count: 0 }` thereafter.

In the PostgreSQL integration test, change the later-child case to:

```ts
await expect(rollbackMerge(merge.id)).rejects.toThrow(/data added after the merge/);
expect(await prisma.game.findUnique({ where: { id: gameId } })).not.toBeNull();
expect((await prisma.gameEvent.findMany({ where: { gameId } })).map(event => event.id))
  .toContain(later.id);
expect((await prisma.mergeOperation.findUniqueOrThrow({ where: { id: merge.id } })).status)
  .toBe('executed');
```

- [x] **Step 2: Run rollback tests and verify the red state**

Run:

```bash
npm test -- --runInBand src/lib/__tests__/merge-rollback-children.test.ts
```

Expected: FAIL because the current implementation collects errors, commits partial changes, and writes `rolled_back`.

- [x] **Step 3: Record complete baselines for newly created rows**

When `executeMerge` creates a season, team, player, player statistics row, standing, game, event, or lineup, store the complete created Prisma row in `snapshot.original`. Add a matching `applied` entry for created player-stat rows, whose fields use persisted names such as `gamesPlayed`, `goals`, and `starts`.

Example:

```ts
const created = await prisma.playerStatistics.create({ data: statsData });
snapshots.push({ id: created.id, entity: 'playerStats', original: { ...created }, action: 'create' });
applied.push({ id: created.id, entity: 'playerStats', fields: statsData });
```

- [x] **Step 4: Implement one serializable rollback transaction**

Move the claim, validation, mutations, and final status update into one interactive transaction:

```ts
const result = await prisma.$transaction(async (tx) => {
  const claim = await tx.mergeOperation.updateMany({
    where: { id: mergeId, status: 'executed' },
    data: { status: 'rolling_back' },
  });
  if (claim.count !== 1) throw new Error('Merge cannot be rolled back');

  const merge = await tx.mergeOperation.findUnique({ where: { id: mergeId } });
  if (!merge) throw new Error('Merge not found');

  // Validate all update and create snapshots before the first mutation.
  // Throw on every mismatch so Prisma rolls the claim and all writes back.

  // Restore updates, then delete created children before parents.

  await tx.mergeOperation.update({
    where: { id: mergeId },
    data: { status: 'rolled_back', rolledBackAt: new Date() },
  });
  return { reverted, errors: [] as string[] };
}, { isolationLevel: 'Serializable', timeout: 120_000 });
```

Build the expected-field map from `changesJson.applied` with `normalizeAppliedFields`. For legacy created snapshots without enough baseline data, reject rollback rather than delete a row that cannot be verified. Move all cache clearing after the transaction resolves.

- [x] **Step 5: Run unit and integration coverage**

Run:

```bash
npm test -- --runInBand src/lib/__tests__/merge-rollback-safety.test.ts src/lib/__tests__/merge-rollback-children.test.ts
STATSAI_DATA_INTEGRATION=1 npm test -- --runInBand src/lib/__tests__/data-repair.integration.test.ts
```

Expected: all unit tests PASS; integration PASS against the isolated `statsai_review` database. If the isolated DB is unavailable, record that limitation and run the unit suite plus TypeScript/build validation.

- [x] **Step 6: Commit atomic merge rollback**

```bash
git add src/lib/merge-engine.ts src/lib/__tests__/merge-rollback-children.test.ts src/lib/__tests__/data-repair.integration.test.ts
git commit -m "fix(merge): make rollback atomic"
```

## Task 4: Consume password-reset tokens once

**Files:**
- Modify: `src/app/api/auth/reset-confirm/route.ts`
- Modify: `src/app/api/mobile/v1/auth/__tests__/refresh.test.ts`

- [x] **Step 1: Write the concurrent reset regression test**

```ts
test('a password-reset token succeeds only once under concurrency', async () => {
  const resetToken = crypto.randomBytes(32).toString('hex');
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: crypto.createHash('sha256').update(resetToken).digest('hex'),
      expiresAt: new Date(Date.now() + 60_000),
    },
  });
  const responses = await Promise.all([
    resetPOST(mkResetReq(resetToken, 'ReplacementPassword123')),
    resetPOST(mkResetReq(resetToken, 'OtherReplacementPassword123')),
  ]);
  expect(responses.map(response => response.status).sort()).toEqual([200, 400]);
  expect(await prisma.passwordResetToken.count({ where: { userId, usedAt: { not: null } } })).toBe(1);
});
```

- [x] **Step 2: Run the reset test and verify the red state**

Run:

```bash
npm test -- --runInBand src/app/api/mobile/v1/auth/__tests__/refresh.test.ts -t "password-reset token succeeds only once"
```

Expected: FAIL because both requests currently pass the pre-transaction token check.

- [x] **Step 3: Implement the conditional token claim**

Calculate `newHash` before opening the transaction. Inside one interactive transaction, find and validate the token, lock the user, and claim the token conditionally:

```ts
const reset = await prisma.$transaction(async tx => {
  const now = new Date();
  const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= now) throw new InvalidResetTokenError();
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${record.userId} FOR UPDATE`;
  const claim = await tx.passwordResetToken.updateMany({
    where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claim.count !== 1) throw new InvalidResetTokenError();
  await tx.user.update({
    where: { id: record.userId },
    data: { password: newHash, passwordChangedAt: now },
  });
  await tx.session.deleteMany({ where: { userId: record.userId } });
  await tx.passwordResetToken.deleteMany({
    where: { userId: record.userId, usedAt: null, id: { not: record.id } },
  });
  return { userId: record.userId };
}, { isolationLevel: 'Serializable' });
```

Catch `InvalidResetTokenError` and map it to the current 400 response. Keep activity logging after the successful commit.

- [x] **Step 4: Run the full auth integration file**

Run:

```bash
npm test -- --runInBand src/app/api/mobile/v1/auth/__tests__/refresh.test.ts
```

Expected: PASS, including existing session invalidation tests and the new concurrent reset test.

- [x] **Step 5: Commit token consumption fix**

```bash
git add src/app/api/auth/reset-confirm/route.ts src/app/api/mobile/v1/auth/__tests__/refresh.test.ts
git commit -m "fix(auth): consume reset tokens atomically"
```

## Task 5: Close P0 review items and verify the release

**Files:**
- Modify: `docs/CODE-REVIEW-2026-09-30.md`
- Modify: `src/lib/version.ts`
- Modify: `package.json`

- [x] **Step 1: Update review status and version**

Mark P0-1 through P0-4 as `תוקן` and add the verification commands used. Change both version declarations from `0.52.4` to `0.52.5`.

- [x] **Step 2: Run complete verification**

```bash
npm test -- --runInBand
npx tsc --noEmit
npm run build
git diff --check
```

Expected: all Jest suites PASS, TypeScript exits 0, Next.js build exits 0, and `git diff --check` prints no errors.

- [x] **Step 3: Review the final diff against the four P0 acceptance criteria**

Confirm from the diff and test names that failed PostgreSQL preparation cannot advance, merge rollback is one transaction, later edits cause rollback rejection, and one reset token yields one successful response.

- [x] **Step 4: Commit release metadata and review status**

```bash
git add docs/CODE-REVIEW-2026-09-30.md src/lib/version.ts package.json
git commit -m "chore: bump version to 0.52.5"
```
