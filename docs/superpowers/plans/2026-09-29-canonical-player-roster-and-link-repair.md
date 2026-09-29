# Canonical player roster display and link repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** Show one roster-integrity row per player family and safely repair a self-linked player record by attaching it to an existing canonical player.

**Architecture:** A pure family helper will normalize self-links, choose a representative roster status, and validate strong identity evidence for a family link. The roster page groups before filtering. The duplicates page chooses either the existing same-squad merge or a new link-repair action; the API performs writes atomically and records reversible audit details.

**Tech Stack:** Next.js App Router, TypeScript, React client components, Prisma, Jest.

---

### Task 1: Define and test canonical-family helpers

**Files:**
- Create: \`src/lib/canonical-player-family.ts\`
- Create: \`src/lib/__tests__/canonical-player-family.test.ts\`
- Modify: \`src/lib/player-duplicate-candidates.ts\`
- Test: \`src/lib/__tests__/player-duplicate-candidates.test.ts\`

- [ ] **Step 1: Write the failing family tests**

~~~ts
import { canonicalFamilyId, groupRosterFamilyRows, canRepairFamilyLink } from '@/lib/canonical-player-family';

const row = (id: string, patch: Record<string, unknown> = {}) => ({
  id, canonicalPlayerId: null, updatedAt: new Date('2026-09-29T10:00:00.000Z'),
  nameHe: 'נועם בן הרוש', nameEn: 'Noam Ben Harosh', birthDate: new Date('2005-05-13'), apiFootballId: null,
  rosterStatus: { kind: 'LOAN' as const, updatedAt: '2026-09-29T10:00:00.000Z' }, ...patch,
});

test('self link is its own family rather than a valid child link', () => {
  expect(canonicalFamilyId(row('source', { canonicalPlayerId: 'source' }))).toBe('source');
});
test('groups linked statuses and retains the newest status source', () => {
  const groups = groupRosterFamilyRows([row('root'), row('old', { canonicalPlayerId: 'root', rosterStatus: { kind: 'LOAN', updatedAt: '2026-09-28T10:00:00.000Z' } })]);
  expect(groups).toHaveLength(1);
  expect(groups[0].statusSourceId).toBe('root');
});
test('allows only a self-linked source to attach to a root with exact name and date of birth', () => {
  expect(canRepairFamilyLink(row('source', { canonicalPlayerId: 'source' }), row('root'))).toBe(true);
  expect(canRepairFamilyLink(row('source', { canonicalPlayerId: 'source', birthDate: new Date('2004-01-01') }), row('root'))).toBe(false);
});
~~~

- [ ] **Step 2: Run the new tests and verify failure**

Run: \`npx jest src/lib/__tests__/canonical-player-family.test.ts --runInBand\`

Expected: FAIL because \`canonical-player-family\` does not exist.

- [ ] **Step 3: Implement the pure helper**

~~~ts
export function canonicalFamilyId(player: { id: string; canonicalPlayerId?: string | null }) {
  return player.canonicalPlayerId && player.canonicalPlayerId !== player.id ? player.canonicalPlayerId : player.id;
}

export function canRepairFamilyLink(source: IdentityPlayer, target: IdentityPlayer) {
  if (source.id === target.id || source.canonicalPlayerId !== source.id || target.canonicalPlayerId) return false;
  if (source.apiFootballId && target.apiFootballId && source.apiFootballId !== target.apiFootballId) return false;
  if (day(source.birthDate) && day(target.birthDate) && day(source.birthDate) !== day(target.birthDate)) return false;
  return sameProviderId(source, target) || (sameFullName(source, target) && day(source.birthDate) === day(target.birthDate));
}
~~~

Implement \`groupRosterFamilyRows\` with a \`Map\` keyed by \`canonicalFamilyId\`. It retains aliases for search, chooses the status whose \`rosterStatus.updatedAt\` is newest, breaks ties by player id, and uses the canonical record as display identity when it is in the group.

- [ ] **Step 4: Make duplicate discovery use the same family key**

Replace \`player.canonicalPlayerId || player.id\` with \`canonicalFamilyId(player)\` in \`buildDuplicateCandidates\`. Add:

~~~ts
test('a self-linked source remains a separate repair family', () => {
  const rows = buildDuplicateCandidates([p('source', { canonicalPlayerId: 'source', birthDate: '1997-01-01' }), p('root', { birthDate: '1997-01-01' })]);
  expect(rows).toHaveLength(1);
});
~~~

- [ ] **Step 5: Run helper and candidate tests**

Run: \`npx jest src/lib/__tests__/canonical-player-family.test.ts src/lib/__tests__/player-duplicate-candidates.test.ts --runInBand\`

Expected: PASS.

- [ ] **Step 6: Commit the helper boundary**

~~~bash
git add src/lib/canonical-player-family.ts src/lib/__tests__/canonical-player-family.test.ts src/lib/player-duplicate-candidates.ts src/lib/__tests__/player-duplicate-candidates.test.ts
git commit -m "feat: model canonical player families"
~~~

### Task 2: Collapse roster-integrity display by family

**Files:**
- Modify: \`src/app/admin/roster-integrity/page.tsx\`
- Test: \`src/lib/__tests__/canonical-player-family.test.ts\`

- [ ] **Step 1: Extend the query with identity needed for grouping**

Add \`canonicalPlayerId: true\` to the player selection. Preserve the existing id, names, \`additionalInfo\`, \`updatedAt\`, and team selection because the status action needs the source id and optimistic-lock timestamp.

- [ ] **Step 2: Replace per-row mapping with grouped view rows**

~~~ts
const statusRows = players.flatMap((player) => {
  const rosterStatus = getRosterStatus(player.additionalInfo);
  return rosterStatus ? [{ ...player, rosterStatus }] : [];
});
const rows = groupRosterFamilyRows(statusRows);
~~~

Map every table row from \`group.displayPlayer\` for the label and link, and \`group.statusSource\` for the status, destination, date, \`playerId\`, and \`expectedUpdatedAt\`. Compute count cards from the grouped list before status or text filters.

- [ ] **Step 3: Preserve search and editing semantics**

~~~ts
const searchable = row.aliases.flatMap((player) => [player.nameHe, player.nameEn, player.team.nameHe, player.team.nameEn]);
const filtered = rows.filter((row) =>
  (selectedStatus === 'all' || row.rosterStatus.kind === selectedStatus) &&
  (!query || searchable.filter(Boolean).join(' ').includes(query)),
);
~~~

Pass \`row.statusSource.id\` and \`row.statusSource.updatedAt.toISOString()\` to \`RosterReviewActions\`, never the representative player timestamp unless it supplied the status.

- [ ] **Step 4: Run focused display checks**

Run: \`npx jest src/lib/__tests__/canonical-player-family.test.ts src/lib/__tests__/roster-integrity.test.ts src/app/api/admin/roster-integrity/__tests__/route.test.ts src/components/__tests__/RosterReviewActions.test.tsx --runInBand\`

Expected: PASS; grouping proves a linked family produces one row and endpoint tests preserve guarded source-row writes.

- [ ] **Step 5: Commit the grouped roster screen**

~~~bash
git add src/app/admin/roster-integrity/page.tsx src/lib/__tests__/canonical-player-family.test.ts
git commit -m "fix: group roster integrity by player family"
~~~

### Task 3: Add the audited existing-player link repair

**Files:**
- Create: \`src/components/PlayerFamilyLinkDialog.tsx\`
- Create: \`src/components/__tests__/PlayerFamilyLinkDialog.test.tsx\`
- Modify: \`src/app/admin/player-duplicates/page.tsx\`
- Modify: \`src/app/api/admin/player-duplicates/route.ts\`
- Modify: \`src/app/api/admin/player-duplicates/__tests__/route.test.ts\`

- [ ] **Step 1: Write failing route tests for link and undo**

~~~ts
it('repairs a self-link by attaching it to a verified root without copying fields', async () => {
  const response = await route.POST(request({ action: 'link', sourceId: 'source', targetRootId: 'root', expectedSourceUpdatedAt: timestamp, expectedTargetUpdatedAt: timestamp }));
  expect(response.status).toBe(200);
  expect(tx.player.update).toHaveBeenCalledWith({ where: { id: 'source' }, data: { canonicalPlayerId: 'root' } });
  expect(tx.activityLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionHe: 'קישור לרשומת שחקן קיימת' }) }));
});
it('rejects a target that is not a root or a conflicting birth date', async () => {
  tx.player.findUnique.mockResolvedValueOnce(player('source', { canonicalPlayerId: 'source' })).mockResolvedValueOnce(player('root', { canonicalPlayerId: 'other' }));
  expect((await route.POST(request({ action: 'link', sourceId: 'source', targetRootId: 'root', expectedSourceUpdatedAt: timestamp, expectedTargetUpdatedAt: timestamp }))).status).toBe(409);
});
~~~

- [ ] **Step 2: Add \`link\` validation and an audit-detail variant**

Parse \`action: 'link'\` independently from \`merge\`. Require distinct nonempty ids and exact timestamps. In one transaction, reload both player records, call \`canRepairFamilyLink(source, target)\`, update only the source \`canonicalPlayerId\`, and log:

~~~ts
{ type: 'PLAYER_FAMILY_LINK', sourceId, targetRootId, previousCanonicalId: source.canonicalPlayerId }
~~~

Extend \`details()\` into a discriminated union. In \`undo\`, restore \`previousCanonicalId\` only when source and target did not change after the log timestamp, mark the original log undone, and create \`בוטל קישור לרשומת שחקן קיימת\`.

- [ ] **Step 3: Add a separate client action**

\`PlayerFamilyLinkDialog\` receives source and target ids, display names, and timestamps. It explains that the action only connects a source row to an existing family, has a confirmation button labelled \`קישור לרשומת שחקן קיימת\`, and after success exposes \`ביטול הקישור\`. It posts only the \`link\` payload and refreshes after undo.

- [ ] **Step 4: Resolve candidate families and choose the valid action**

Load every root referenced by \`canonicalPlayerId\` for selected-season rows, then resolve candidate family ids to roots. Render \`PlayerManualMergeDialog\` only when both resolved rows are independent roots in the same team. Render \`PlayerFamilyLinkDialog\` only when \`canRepairFamilyLink(source, target)\` is true. Do not render any action for an already shared valid family.

The table label for this case is \`קישור למשפחה קיימת\`, so a row such as Noam Ben Harosh cannot show a strong match with an invalid merge button.

- [ ] **Step 5: Write and run client and route tests**

~~~ts
test('renders the existing-player link confirmation for a self-link repair', () => {
  render(<PlayerFamilyLinkDialog source={source} target={target} />);
  expect(screen.getByRole('button', { name: 'קישור לרשומת שחקן קיימת' })).toBeInTheDocument();
});
~~~

Run: \`npx jest src/app/api/admin/player-duplicates/__tests__/route.test.ts src/components/__tests__/PlayerManualMergeDialog.test.tsx src/components/__tests__/PlayerFamilyLinkDialog.test.tsx src/lib/__tests__/canonical-player-family.test.ts --runInBand\`

Expected: PASS.

- [ ] **Step 6: Commit the repair action**

~~~bash
git add src/app/api/admin/player-duplicates/route.ts src/app/api/admin/player-duplicates/__tests__/route.test.ts src/app/admin/player-duplicates/page.tsx src/components/PlayerFamilyLinkDialog.tsx src/components/__tests__/PlayerFamilyLinkDialog.test.tsx
git commit -m "feat: repair links to canonical players"
~~~

### Task 4: Release verification

**Files:**
- Modify: \`package.json\`
- Modify: \`src/lib/version.ts\`

- [ ] **Step 1: Bump the patch version consistently**

Set both version declarations from \`0.52.1\` to \`0.52.2\`.

- [ ] **Step 2: Run complete relevant validation**

Run: \`npx jest src/lib/__tests__/canonical-player-family.test.ts src/lib/__tests__/player-duplicate-candidates.test.ts src/lib/__tests__/roster-integrity.test.ts src/app/api/admin/player-duplicates/__tests__/route.test.ts src/app/api/admin/roster-integrity/__tests__/route.test.ts src/components/__tests__/PlayerManualMergeDialog.test.tsx src/components/__tests__/PlayerFamilyLinkDialog.test.tsx src/components/__tests__/RosterReviewActions.test.tsx --runInBand && npx tsc --noEmit --incremental false && git diff --check\`

Expected: all Jest suites pass, TypeScript exits 0, and \`git diff --check\` produces no output.

- [ ] **Step 3: Commit release metadata**

~~~bash
git add package.json src/lib/version.ts
git commit -m "chore: bump version to 0.52.2"
~~~

- [ ] **Step 4: Push and deploy**

~~~bash
git push origin codex/fix-turner-venue-data
ssh hbstats-deploy 'cd /home/hbs/hbstats && git pull --ff-only && npm run build && pm2 restart hbstats'
~~~

Verify that \`/admin/roster-integrity\` redirects unauthenticated visitors to login, \`POST /api/admin/player-duplicates\` returns 403 without a session, and an authenticated administrator sees one Itay Hazut row plus \`קישור למשפחה קיימת\` for the self-linked Noam Ben Harosh record.

