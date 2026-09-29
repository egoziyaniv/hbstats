# Manual Player Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an administrator merge a reviewed duplicate without deleting source rows and undo the merge when no later change has occurred.

**Architecture:** A pure helper selects a safe default keeper and forms a copy-only-if-empty patch. A protected admin route revalidates candidate membership and writes canonical links, optional enrichment, and an `ActivityLog` transactionally. A client dialog on the current duplicate table previews and confirms the exact operation.

**Tech Stack:** Next.js App Router, TypeScript, Prisma, React, Tailwind, Jest.

---

### Task 1: Pure merge planner

**Files:**
- Create: `src/lib/player-manual-merge.ts`
- Create: `src/lib/__tests__/player-manual-merge.test.ts`

- [ ] **Step 1: Write a failing test for default keeper and missing-field patch.**

```ts
expect(planManualMerge(primaryWithFiveLineups, secondaryWithBirthDate)).toMatchObject({
  primaryId: 'primary',
  copyableFields: ['birthDate'],
});
```

- [ ] **Step 2: Run `npx jest src/lib/__tests__/player-manual-merge.test.ts --runInBand` and confirm the module is missing.**

- [ ] **Step 3: Implement `planManualMerge` and `applyMissingFields`.**

```ts
export const COPYABLE_FIELDS = ['birthDate', 'position', 'nationalityEn', 'nationalityHe', 'photoUrl', 'firstNameEn', 'firstNameHe', 'lastNameEn', 'lastNameHe'] as const;
export function applyMissingFields(primary: PlayerFields, secondary: PlayerFields, fields: CopyableField[]) {
  return Object.fromEntries(fields.filter((field) => empty(primary[field]) && !empty(secondary[field])).map((field) => [field, secondary[field]]));
}
```

- [ ] **Step 4: Run the focused test and commit the helper.**

### Task 2: Protected merge and undo API

**Files:**
- Create: `src/app/api/admin/player-duplicates/route.ts`
- Create: `src/app/api/admin/player-duplicates/__tests__/route.test.ts`

- [ ] **Step 1: Write failing route tests for unauthorized use, a merge preserving event ownership, only-empty field copies, and undo after a valid log.**

```ts
expect(await POST(request({ action: 'merge', primaryId: 'a', secondaryId: 'b', copyFields: ['birthDate'] }))).toHaveProperty('status', 200);
expect(prisma.player.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { canonicalPlayerId: 'a' } }));
```

- [ ] **Step 2: Run the route test and confirm it fails because the handler is absent.**

- [ ] **Step 3: Implement transactionally.**

```ts
await prisma.$transaction(async (tx) => {
  const [primary, secondary] = await Promise.all([tx.player.findUnique(...), tx.player.findUnique(...)]);
  const copied = applyMissingFields(primary, secondary, copyFields);
  await tx.player.update({ where: { id: primary.id }, data: copied });
  await tx.player.updateMany({ where: { OR: [{ id: secondaryRoot }, { canonicalPlayerId: secondaryRoot }] }, data: { canonicalPlayerId: primaryRoot } });
  await tx.activityLog.create({ data: { entityType: 'PLAYER', entityId: primaryRoot, actionHe: 'איחוד שחקנים ידני', details: { ... } } });
});
```

Undo must restore only the prior links and field values recorded in the action's activity log and reject later changes.

- [ ] **Step 4: Run the route tests and commit the API.**

### Task 3: Inline merge dialog

**Files:**
- Create: `src/components/PlayerManualMergeDialog.tsx`
- Create: `src/components/__tests__/PlayerManualMergeDialog.test.tsx`
- Modify: `src/app/admin/player-duplicates/page.tsx`

- [ ] **Step 1: Write a failing client rendering test for keeper selection, birth-date checkbox, preview, merge confirmation, and undo action.**

- [ ] **Step 2: Implement the dialog with a native `<dialog>` or accessible modal.** It must send primary/secondary IDs and selected fields to the protected endpoint, display API errors inline, refresh after success, and retain the filter query.

- [ ] **Step 3: Pass each candidate's serializable fields and default keeper to the dialog.**

- [ ] **Step 4: Run focused component tests and commit the UI.**

### Task 4: Final verification and release

**Files:**
- Modify: `package.json`
- Modify: `src/lib/version.ts`

- [ ] **Step 1: Update both versions from `0.52.0` to `0.52.1`.**
- [ ] **Step 2: Run `npx jest src/lib/__tests__/player-manual-merge.test.ts src/app/api/admin/player-duplicates/__tests__/route.test.ts src/components/__tests__/PlayerManualMergeDialog.test.tsx --runInBand && npx tsc --noEmit && git diff --check`.**
- [ ] **Step 3: Run `npm run build`; resolve only failures caused by this feature.**
- [ ] **Step 4: Commit, push, build on the server, restart `hbstats`, and verify the authenticated admin page.**
