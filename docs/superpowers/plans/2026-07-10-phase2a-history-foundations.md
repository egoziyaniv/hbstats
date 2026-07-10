# Phase 2A — History Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Records & History flagship's foundations (spec §5, first half): phase-1 follow-up fixes, the club-identity service, the filterable all-time club table, and full rivalry (H2H) pages — web + mobile.

**Architecture:** Pure-computation services in `src/lib/history/` over Prisma (module-level 1h caches, cleared by admin mutations), thin API routes, server-component web pages, OTA-shippable mobile screens. **No schema changes in 2A** (the `RecordEntry` table is 2B).

**Tech Stack:** TypeScript 5, Prisma 5, Jest (`src/**/__tests__/*.test.ts` only — mobile is jest-ignored), Next 14 App Router, Expo/expo-router + TanStack Query.

**Recon facts the code below relies on (verified):**
- Club families are ad-hoc today: grouped by `nameHe`/`nameEn` in `h2h.ts:46-53`, `coach-timeline.ts:105`, team page `allTimeTeamIds`. `Team.apiFootballId` is stable per club (`@@unique([apiFootballId, seasonId])`). Dev-DB probe: 1798 team rows → 323 normalized-nameHe families; exactly ONE apiFootballId spans two name spellings (Marmorek transliteration) — so union by apiId THEN name is correct.
- `buildH2H(teamAId, teamBId, limit)` in `src/lib/h2h.ts` already family-aware by name; aggregates all games, caps `meetings` at limit; NO per-competition/biggest-win/venue split.
- `/statistics/all-time` is PLAYER leaderboards (`buildUnifiedLeaderboard`) — the club all-time table is a NEW page, don't touch it.
- Standings rows exist for ~75 seasons (1949+); games only 2000+. So: scope=all aggregates **Standing** rows (75 seasons); scope home/away aggregates **games** (2000+, with a coverage note).
- `merge-rsssf.js --mode topscorers` crashes P2002 in `getOrCreateSeason` (line ~142): it looks up seasons by NAME then creates, violating the unique **year**. Prod scraped data: `source:'rsssf', category:'goals'` (84 rows) + `source:'walla', category:'goals'` (125 rows/25 seasons). `merge-walla-leaderboards.js` maps only `goals_full` — plain `goals` never merged.
- Jest: tests MUST live under `src/**/__tests__/*.test.ts`. Mobile Header takes `onBack` + `showBack`. Standalone mobile screens render `<BottomNav />`. `@shared/*` alias works web+mobile. `theme.ink` keys: 50/100/200/300/500/700/900.

---

### Task 0: Phase-1 follow-ups

**Files:**
- Modify: `scripts/merge-rsssf.js` (getOrCreateSeason year-first lookup)
- Modify: `scripts/merge-walla-leaderboards.js` (map plain categories)
- Modify: `src/lib/on-this-day.ts` (daily memo)
- Test: extend `src/lib/__tests__/on-this-day.test.ts`
- Modify: `src/app/standings/page.tsx` (link to /history/seasons)

- [ ] **Step 0.1: Fix `getOrCreateSeason` in `scripts/merge-rsssf.js`**

Read the function (~line 130-150). It resolves a season by `name` and creates on miss. Change the lookup to try the **year first** (parse the start year from the season string), then name, and only create when neither exists:

```js
async function getOrCreateSeason(seasonStr) {
  // "1955/1956" → startYear 1955. Look up by YEAR first — season names drift
  // ("1955/1956" vs "1955/56") but year is unique; creating on a name-miss
  // violates the unique(year) constraint (P2002).
  const m = seasonStr.match(/^(\d{4})/);
  const year = m ? parseInt(m[1], 10) : null;
  if (year != null) {
    const byYear = await prisma.season.findUnique({ where: { year } });
    if (byYear) return byYear;
  }
  const byName = await prisma.season.findFirst({ where: { name: seasonStr } });
  if (byName) return byName;
  if (year == null) return null;
  return prisma.season.create({
    data: { year, name: seasonStr, startDate: new Date(`${year}-08-01`), endDate: new Date(`${year + 1}-06-30`) },
  });
}
```
Adapt to the function's real signature/return handling (read it first; keep callers working — if callers expect null-on-failure keep that).

- [ ] **Step 0.2: Map plain Walla categories in `scripts/merge-walla-leaderboards.js`**

Extend `CATEGORY_MAP` (line ~14) so the compact per-season lists merge too:
```js
const CATEGORY_MAP = {
  goals_full: 'TOP_SCORERS',
  assists_full: 'TOP_ASSISTS',
  yellowCards_full: 'TOP_YELLOW_CARDS',
  redCards_full: 'TOP_RED_CARDS',
  substitutedIn_full: 'TOP_SUBSTITUTED_IN',
  substitutedOut_full: 'TOP_SUBSTITUTED_OUT',
  // Compact per-season top lists (scrape-walla.js writes these without _full)
  goals: 'TOP_SCORERS',
  assists: 'TOP_ASSISTS',
  yellowCards: 'TOP_YELLOW_CARDS',
  redCards: 'TOP_RED_CARDS',
  substitutedIn: 'TOP_SUBSTITUTED_IN',
  substitutedOut: 'TOP_SUBSTITUTED_OUT',
};
```
CAUTION: read the script's row handling first — compact rows may lack fields the `_full` path expects (e.g. team name, rank). The script skips on `findFirst` duplicate (seasonId+competitionId+category+rank), so re-runs are idempotent. IMPORTANT: the script must SKIP rsssf-source rows (those belong to merge-rsssf) — check whether it filters by source; if not, add `where.source = 'walla'`.

- [ ] **Step 0.3: Verify both scripts against the dev DB**

Run: `node scripts/merge-rsssf.js --mode topscorers --dry-run` → completes without P2002.
Run: `node scripts/merge-walla-leaderboards.js 2>&1 | tail -3` — if it has no dry-run flag, run against dev (dev data is disposable) and report created/skipped counts.
Then verify: a quick tsx probe printing `competitionLeaderboardEntry.count({ where: { category: 'TOP_SCORERS', rank: 1, competitionId: 'comp_liga_haal' } })` — expect a meaningful increase from 6 (dev has partial scrape data; any increase proves the path).

- [ ] **Step 0.4: Memoize `getOnThisDay` by calendar day**

In `src/lib/on-this-day.ts`, add above `getOnThisDay`:
```ts
let memo: { key: string; value: OnThisDayPayload } | null = null;
export function _clearOnThisDayMemoForTests() { memo = null; }
```
and inside `getOnThisDay(now = new Date())`, first line:
```ts
  const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
  if (memo && memo.key === key) return memo.value;
```
and before `return { match, birthdays };`:
```ts
  const value = { match, birthdays };
  memo = { key, value };
  return value;
```
Update `src/lib/__tests__/on-this-day.test.ts`: call `_clearOnThisDayMemoForTests()` in a `beforeEach`, and add one test asserting the second call with the same date does NOT hit prisma again (`p.$queryRaw.mock.calls.length` unchanged after second call).

- [ ] **Step 0.5: Link the seasons spine from the web standings page**

In `src/app/standings/page.tsx`, near the page heading (find the `<h1>` block), add a small link:
```tsx
<Link href="/history/seasons" className="text-sm font-bold text-[var(--accent)]">🏆 כל העונות — אלופות ומלכי שערים</Link>
```
(Import `Link` from `next/link` if absent; place it where the page's header actions/filters live — match the surrounding layout.)

- [ ] **Step 0.6: Verify + commit**

Run: `npx jest src/lib/__tests__/on-this-day.test.ts` (7 tests), full `npm test`, `npx tsc --noEmit`.
```bash
git add scripts/merge-rsssf.js scripts/merge-walla-leaderboards.js src/lib/on-this-day.ts src/lib/__tests__/on-this-day.test.ts src/app/standings/page.tsx
git commit -m "fix(history): phase-1 follow-ups — scorer merges, on-this-day memo, spine link"
```

---

### Task 1: Club-identity service

**Files:**
- Create: `src/lib/history/club-identity.ts`
- Test: `src/lib/__tests__/club-identity.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/lib/__tests__/club-identity.test.ts`:

```ts
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { team: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { getClubFamilies, getClubFamilyByTeamId, _clearClubCacheForTests } from '@/lib/history/club-identity';

const findMany = (prisma as unknown as { team: { findMany: jest.Mock } }).team.findMany;

const t = (id: string, nameHe: string, seasonId: string, apiFootballId: number | null = null, over: Record<string, unknown> = {}) => ({
  id, nameHe, nameEn: nameHe, seasonId, apiFootballId, logoUrl: null,
  season: { id: seasonId, year: Number(seasonId.replace('s', '')) },
  ...over,
});

describe('club-identity', () => {
  beforeEach(() => { _clearClubCacheForTests(); findMany.mockReset(); });

  it('groups team rows across seasons by normalized Hebrew name', async () => {
    findMany.mockResolvedValue([
      t('a1', 'מכבי תל אביב', 's2023', 604),
      t('a2', 'מכבי תל-אביב', 's2024', 604),   // punctuation variant
      t('b1', 'הפועל באר שבע', 's2024', 610),
    ]);
    const fams = await getClubFamilies();
    expect(fams).toHaveLength(2);
    const mta = fams.find((f) => f.teamIds.includes('a1'))!;
    expect(mta.teamIds.sort()).toEqual(['a1', 'a2']);
    expect(mta.seasons).toHaveLength(2);
  });

  it('unions families that share an apiFootballId despite different name spellings', async () => {
    findMany.mockResolvedValue([
      t('m1', 'הפועל marmorek', 's2010', 4498),
      t('m2', 'הפועל מרמורק', 's2011', 4498),
    ]);
    const fams = await getClubFamilies();
    expect(fams).toHaveLength(1);
    expect(fams[0].teamIds.sort()).toEqual(['m1', 'm2']);
  });

  it('prefers the newest season for display name/logo and exposes a stable clubKey', async () => {
    findMany.mockResolvedValue([
      t('c1', 'הפועל ירושלים', 's2010', 700, { logoUrl: null }),
      t('c2', 'הפועל ירושלים', 's2024', 700, { logoUrl: 'new.png' }),
    ]);
    const [fam] = await getClubFamilies();
    expect(fam.clubKey).toBe('api-700');
    expect(fam.logoUrl).toBe('new.png');
    expect(fam.latestTeamId).toBe('c2');
  });

  it('resolves a family by any member teamId', async () => {
    findMany.mockResolvedValue([
      t('a1', 'מכבי חיפה', 's2023', 601),
      t('a2', 'מכבי חיפה', 's2024', 601),
    ]);
    const fam = await getClubFamilyByTeamId('a1');
    expect(fam?.teamIds).toContain('a2');
  });
});
```

- [ ] **Step 1.2: Run to verify FAIL** — `npx jest src/lib/__tests__/club-identity.test.ts` → module not found.

- [ ] **Step 1.3: Implement `src/lib/history/club-identity.ts`**

```ts
import prisma from '@/lib/prisma';

/**
 * Club identity — groups per-season Team rows into cross-season club families.
 *
 * Grouping (validated against the DB: 1798 rows → 323 families, one conflict):
 *   1. rows sharing an apiFootballId are one club (stable per club),
 *   2. rows sharing a normalized Hebrew name are one club,
 *   union-find over both signals (handles transliteration drift like Marmorek).
 *
 * clubKey (stable URL slug, matches the admin teamKey convention):
 *   `api-<apiFootballId>` when the family has one, else `name-<encodeURIComponent(nameHe of newest row)>`.
 */

export interface ClubFamily {
  clubKey: string;
  nameHe: string;
  nameEn: string;
  logoUrl: string | null;
  latestTeamId: string;
  teamIds: string[];
  seasons: Array<{ seasonId: string; year: number; teamId: string }>;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
let cache: { at: number; families: ClubFamily[]; byTeamId: Map<string, ClubFamily>; byKey: Map<string, ClubFamily> } | null = null;
export function clearClubCache() { cache = null; }
export const _clearClubCacheForTests = clearClubCache;

// Same normalization family the merge engine uses for team-name matching.
function normalizeName(name: string): string {
  return (name || '')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/['"״׳\-\.`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

type TeamRow = {
  id: string; nameHe: string; nameEn: string; logoUrl: string | null;
  apiFootballId: number | null; seasonId: string;
  season: { id: string; year: number };
};

async function build() {
  const rows = (await prisma.team.findMany({
    select: {
      id: true, nameHe: true, nameEn: true, logoUrl: true, apiFootballId: true, seasonId: true,
      season: { select: { id: true, year: true } },
    },
  })) as TeamRow[];

  // Union-find over two signals: apiFootballId and normalized nameHe.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    // path compression
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

  for (const row of rows) parent.set(row.id, row.id);
  const byApi = new Map<number, string>();
  const byName = new Map<string, string>();
  for (const row of rows) {
    if (typeof row.apiFootballId === 'number') {
      const seen = byApi.get(row.apiFootballId);
      if (seen) union(seen, row.id); else byApi.set(row.apiFootballId, row.id);
    }
    const key = normalizeName(row.nameHe);
    if (key) {
      const seen = byName.get(key);
      if (seen) union(seen, row.id); else byName.set(key, row.id);
    }
  }

  const groups = new Map<string, TeamRow[]>();
  for (const row of rows) {
    const root = find(row.id);
    const arr = groups.get(root) || [];
    arr.push(row);
    groups.set(root, arr);
  }

  const families: ClubFamily[] = [];
  for (const members of groups.values()) {
    const newest = [...members].sort((a, b) => b.season.year - a.season.year)[0];
    const apiId = members.map((m) => m.apiFootballId).find((x): x is number => typeof x === 'number');
    families.push({
      clubKey: apiId != null ? `api-${apiId}` : `name-${encodeURIComponent(newest.nameHe)}`,
      nameHe: newest.nameHe,
      nameEn: newest.nameEn,
      logoUrl: members.map((m) => m.logoUrl).find((l) => l) ?? null,
      latestTeamId: newest.id,
      teamIds: members.map((m) => m.id),
      seasons: [...members]
        .sort((a, b) => b.season.year - a.season.year)
        .map((m) => ({ seasonId: m.seasonId, year: m.season.year, teamId: m.id })),
    });
  }
  families.sort((a, b) => b.seasons.length - a.seasons.length);

  const byTeamId = new Map<string, ClubFamily>();
  const byKey = new Map<string, ClubFamily>();
  for (const f of families) {
    byKey.set(f.clubKey, f);
    for (const id of f.teamIds) byTeamId.set(id, f);
  }
  cache = { at: Date.now(), families, byTeamId, byKey };
  return cache;
}

async function ensure() {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
  return build();
}

export async function getClubFamilies(): Promise<ClubFamily[]> {
  return (await ensure()).families;
}
export async function getClubFamily(clubKey: string): Promise<ClubFamily | null> {
  return (await ensure()).byKey.get(clubKey) ?? null;
}
export async function getClubFamilyByTeamId(teamId: string): Promise<ClubFamily | null> {
  return (await ensure()).byTeamId.get(teamId) ?? null;
}
```

Note the family logoUrl pick: `members.map(...).find(...)` iterates in insertion order, NOT newest-first — fix it to prefer the newest row's logo: sort members desc by year first (`const sorted = [...members].sort((a,b) => b.season.year - a.season.year)` then use `sorted` for newest, logo pick, and seasons). Make the test's logo expectation pass honestly.

- [ ] **Step 1.4: Run tests** — 4 passed; `npx tsc --noEmit` clean.

- [ ] **Step 1.5: Commit**
```bash
git add src/lib/history/club-identity.ts src/lib/__tests__/club-identity.test.ts
git commit -m "feat(history): club-identity service — union-find team families with stable clubKey"
```

---

### Task 2: All-time club table

**Files:**
- Create: `src/lib/history/all-time-table.ts`
- Test: `src/lib/__tests__/all-time-table.test.ts`
- Create: `src/app/history/all-time/page.tsx`
- Create: `src/app/api/mobile/v1/history/all-time/route.ts`
- Create: `mobile/app/history/all-time.tsx` + `mobile/hooks/useAllTimeTable.ts`
- Modify: `shared/types/mobile-api.ts`
- Modify: `mobile/app/history/seasons.tsx` (cross-link) — optional nav affordance

- [ ] **Step 2.1: Failing test** — create `src/lib/__tests__/all-time-table.test.ts`:

```ts
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { team: { findMany: jest.fn() }, standing: { findMany: jest.fn() }, game: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { buildAllTimeTable, _clearAllTimeCacheForTests } from '@/lib/history/all-time-table';

const p = prisma as unknown as {
  team: { findMany: jest.Mock };
  standing: { findMany: jest.Mock };
  game: { findMany: jest.Mock };
};

const team = (id: string, nameHe: string, seasonId: string, api: number | null = null) => ({
  id, nameHe, nameEn: nameHe, seasonId, apiFootballId: api, logoUrl: null,
  season: { id: seasonId, year: Number(seasonId.replace('s', '')) },
});
const st = (teamId: string, seasonId: string, over: Record<string, unknown> = {}) => ({
  teamId, seasonId, played: 30, wins: 15, draws: 10, losses: 5, goalsFor: 50, goalsAgainst: 30, points: 55, ...over,
});

describe('buildAllTimeTable', () => {
  beforeEach(() => {
    _clearAllTimeCacheForTests();
    p.team.findMany.mockReset(); p.standing.findMany.mockReset(); p.game.findMany.mockReset();
  });

  it('aggregates standings per club family across seasons (scope=all)', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2023', 1), team('a2', 'מכבי', 's2024', 1), team('b1', 'הפועל', 's2024', 2)]);
    p.standing.findMany.mockResolvedValue([st('a1', 's2023'), st('a2', 's2024'), st('b1', 's2024', { points: 70, wins: 22, draws: 4, losses: 4 })]);
    const rows = await buildAllTimeTable({});
    expect(rows).toHaveLength(2);
    const maccabi = rows.find((r) => r.nameHe === 'מכבי')!;
    expect(maccabi.seasons).toBe(2);
    expect(maccabi.played).toBe(60);
    expect(maccabi.points).toBe(110);
    expect(rows[0].nameHe).toBe('מכבי'); // sorted by points desc: 110 > 70
  });

  it('applies a season-year range filter', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2023', 1), team('a2', 'מכבי', 's2024', 1)]);
    p.standing.findMany.mockResolvedValue([st('a1', 's2023'), st('a2', 's2024')]);
    const rows = await buildAllTimeTable({ fromYear: 2024, toYear: 2024 });
    expect(rows[0].seasons).toBe(1);
    expect(rows[0].played).toBe(30);
  });

  it('home scope aggregates games (one leg only)', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2024', 1), team('b1', 'הפועל', 's2024', 2)]);
    p.standing.findMany.mockResolvedValue([]);
    p.game.findMany.mockResolvedValue([
      { homeTeamId: 'a1', awayTeamId: 'b1', homeScore: 2, awayScore: 0, season: { year: 2024 } },
      { homeTeamId: 'b1', awayTeamId: 'a1', homeScore: 1, awayScore: 1, season: { year: 2024 } },
    ]);
    const rows = await buildAllTimeTable({ scope: 'home' });
    const maccabi = rows.find((r) => r.nameHe === 'מכבי')!;
    expect(maccabi.played).toBe(1);
    expect(maccabi.wins).toBe(1);
    expect(maccabi.points).toBe(3);
  });
});
```
- [ ] **Step 2.2: Run → FAIL** (module not found).

- [ ] **Step 2.3: Implement `src/lib/history/all-time-table.ts`**

```ts
import prisma from '@/lib/prisma';
import { getClubFamilies, type ClubFamily } from '@/lib/history/club-identity';

/**
 * All-time club table ("טבלת כל הזמנים"), Transfermarkt-style.
 *
 * scope='all'  → aggregates STORED Standing rows (covers every season with a
 *                table, 1949+; W/D/L/GF/GA/Pts summed per club family).
 * scope='home'/'away' → aggregates completed GAMES one leg per club (game rows
 *                exist 2000+ only — callers should show a coverage note).
 * Filters: fromYear/toYear (season start year), scope. League (comp_liga_haal) only.
 * Points are as stored (3-pt era throughout the games range).
 */

const LIGAT_HAAL_ID = 'comp_liga_haal';
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface AllTimeRow {
  clubKey: string;
  nameHe: string;
  logoUrl: string | null;
  latestTeamId: string;
  seasons: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
}

export interface AllTimeFilters {
  fromYear?: number;
  toYear?: number;
  scope?: 'all' | 'home' | 'away';
}

const cache = new Map<string, { at: number; rows: AllTimeRow[] }>();
export function clearAllTimeCache() { cache.clear(); }
export const _clearAllTimeCacheForTests = clearAllTimeCache;

function blank(f: ClubFamily): AllTimeRow {
  return {
    clubKey: f.clubKey, nameHe: f.nameHe, logoUrl: f.logoUrl, latestTeamId: f.latestTeamId,
    seasons: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0,
  };
}

export async function buildAllTimeTable(filters: AllTimeFilters): Promise<AllTimeRow[]> {
  const scope = filters.scope ?? 'all';
  const key = `${filters.fromYear ?? ''}|${filters.toYear ?? ''}|${scope}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  const families = await getClubFamilies();
  const familyByTeamId = new Map<string, ClubFamily>();
  for (const f of families) for (const id of f.teamIds) familyByTeamId.set(id, f);
  const rowByClub = new Map<string, AllTimeRow>();
  const seasonSets = new Map<string, Set<number>>();
  const rowFor = (teamId: string): { row: AllTimeRow; fam: ClubFamily } | null => {
    const fam = familyByTeamId.get(teamId);
    if (!fam) return null;
    let row = rowByClub.get(fam.clubKey);
    if (!row) { row = blank(fam); rowByClub.set(fam.clubKey, row); seasonSets.set(fam.clubKey, new Set()); }
    return { row, fam };
  };
  const inRange = (year: number) =>
    (filters.fromYear == null || year >= filters.fromYear) && (filters.toYear == null || year <= filters.toYear);

  if (scope === 'all') {
    const standings = await prisma.standing.findMany({
      where: { competitionId: LIGAT_HAAL_ID },
      select: {
        teamId: true, seasonId: true, played: true, wins: true, draws: true, losses: true,
        goalsFor: true, goalsAgainst: true, points: true,
      },
    });
    // season years come from the family season list (avoids a join per row)
    const yearBySeason = new Map<string, number>();
    for (const f of families) for (const s of f.seasons) yearBySeason.set(s.seasonId, s.year);
    for (const s of standings) {
      const year = yearBySeason.get(s.seasonId);
      if (year == null || !inRange(year)) continue;
      const r = rowFor(s.teamId);
      if (!r) continue;
      r.row.played += s.played; r.row.wins += s.wins; r.row.draws += s.draws; r.row.losses += s.losses;
      r.row.goalsFor += s.goalsFor; r.row.goalsAgainst += s.goalsAgainst; r.row.points += s.points;
      seasonSets.get(r.fam.clubKey)!.add(year);
    }
  } else {
    const games = await prisma.game.findMany({
      where: { competitionId: LIGAT_HAAL_ID, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, season: { select: { year: true } } },
    });
    for (const g of games) {
      if (!inRange(g.season.year)) continue;
      const teamId = scope === 'home' ? g.homeTeamId : g.awayTeamId;
      const r = rowFor(teamId);
      if (!r) continue;
      const gf = scope === 'home' ? g.homeScore! : g.awayScore!;
      const ga = scope === 'home' ? g.awayScore! : g.homeScore!;
      r.row.played += 1; r.row.goalsFor += gf; r.row.goalsAgainst += ga;
      if (gf > ga) { r.row.wins += 1; r.row.points += 3; }
      else if (gf < ga) { r.row.losses += 1; }
      else { r.row.draws += 1; r.row.points += 1; }
      seasonSets.get(r.fam.clubKey)!.add(g.season.year);
    }
  }

  const rows = [...rowByClub.values()]
    .map((r) => ({ ...r, seasons: seasonSets.get(r.clubKey)!.size, goalsDiff: r.goalsFor - r.goalsAgainst }))
    .filter((r) => r.played > 0)
    .sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor);

  cache.set(key, { at: Date.now(), rows });
  return rows;
}
```

- [ ] **Step 2.4: Tests pass (3) + tsc clean.**

- [ ] **Step 2.5: Commit**
```bash
git add src/lib/history/all-time-table.ts src/lib/__tests__/all-time-table.test.ts
git commit -m "feat(history): all-time club table service — family aggregation with era/scope filters"
```

- [ ] **Step 2.6: Web page** — create `src/app/history/all-time/page.tsx`:

Server component, `force-dynamic`, Hebrew metadata (title `טבלת כל הזמנים — ליגת העל | StatsAI`). Reads `searchParams` `{ from?: string; to?: string; scope?: string }`, validates with `Number.isFinite`, calls `buildAllTimeTable`. Layout mirrors `/history/seasons` (same `<h1>` convention). Filter bar: three `<Link>` pill groups — scope (הכל/בית/חוץ) and era presets (הכל, שנות ה-2000, שנות ה-2010, מ-2020) each preserving the other params; a coverage note `<p className="text-xs text-stone-400">בית/חוץ מחושב ממשחקים — זמין מ-2000 ואילך</p>` when scope≠all. Table columns: `# | קבוצה (logo+link to /teams/{latestTeamId}) | עונות | מש׳ | נ | ת | ה | שערים (GF:GA) | הפרש | נק׳`. Rows numbered 1..N. Every club name links.

- [ ] **Step 2.7: Mobile** — shared types append:
```ts
export interface AllTimeApiRow {
  clubKey: string; nameHe: string; logoUrl: string | null; latestTeamId: string;
  seasons: number; played: number; wins: number; draws: number; losses: number;
  goalsFor: number; goalsAgainst: number; goalsDiff: number; points: number;
}
export interface AllTimeTablePayload { scope: 'all' | 'home' | 'away'; rows: AllTimeApiRow[]; }
```
Route `src/app/api/mobile/v1/history/all-time/route.ts`: GET, force-dynamic, parses `scope`/`from`/`to` (Number.isFinite guards), returns `{ scope, rows }`.
Hook `mobile/hooks/useAllTimeTable.ts` (pattern: useStandings; key `['history','all-time',scope]`, staleTime 1h).
Screen `mobile/app/history/all-time.tsx`: Header (`onBack`+`showBack`, title `טבלת כל הזמנים`, subtitle `ליגת העל`), TabBar scope toggle (הכל/בית/חוץ), rows as compact table rows (rank, TeamCrest, name flexShrink, seasons, played, points bold) each Pressable → `/teams/{latestTeamId}`, coverage note when scoped, empty/error states inside ScrollView+RefreshControl, `<BottomNav />` at the end.
Entry point: in `mobile/app/history/seasons.tsx` add a small link-button under the Header to `/history/all-time` (and vice-versa) so the two history screens cross-link.

- [ ] **Step 2.8: Verify + commit**

`npx tsc --noEmit` root + mobile clean; full `npm test` green. If dev server runs: `curl "http://localhost:8011/api/mobile/v1/history/all-time?scope=home" | head -c 300`.
```bash
git add src/app/history/all-time src/app/api/mobile/v1/history/all-time shared/types/mobile-api.ts mobile/app/history mobile/hooks/useAllTimeTable.ts
git commit -m "feat(history): טבלת כל הזמנים — web page + mobile screen with era/scope filters"
```

---

### Task 3: Rivalry (H2H) pages

**Files:**
- Modify: `src/lib/h2h.ts` (add `buildFullH2H`)
- Test: `src/lib/__tests__/h2h-full.test.ts`
- Create: `src/app/history/h2h/page.tsx` (index) + `src/app/history/h2h/[keys]/page.tsx` (pair page, `keys = clubKeyA__clubKeyB`)
- Create: `src/app/api/mobile/v1/history/h2h/route.ts`
- Create: `mobile/app/history/h2h.tsx` (picker + result view) + `mobile/hooks/useH2H.ts`
- Modify: `shared/types/mobile-api.ts`

- [ ] **Step 3.1: Failing test** — create `src/lib/__tests__/h2h-full.test.ts`:

```ts
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { team: { findMany: jest.fn() }, game: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { buildFullH2H } from '@/lib/h2h';

const p = prisma as unknown as { team: { findMany: jest.Mock }; game: { findMany: jest.Mock } };

const game = (id: string, homeTeamId: string, awayTeamId: string, hs: number, as: number, comp: string, year: number) => ({
  id, homeTeamId, awayTeamId, homeScore: hs, awayScore: as,
  dateTime: new Date(`${year}-03-01T18:00:00Z`), status: 'COMPLETED',
  competition: { id: comp, nameHe: comp, apiFootballId: comp === 'league' ? 383 : 384 },
  homeTeam: { nameHe: homeTeamId }, awayTeam: { nameHe: awayTeamId },
});

describe('buildFullH2H', () => {
  beforeEach(() => { p.team.findMany.mockReset(); p.game.findMany.mockReset(); });

  it('aggregates totals, per-competition split, venue split and biggest wins', async () => {
    // family resolution: A = rows a1,a2 · B = rows b1
    p.team.findMany
      .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
      .mockResolvedValueOnce([{ id: 'b1' }]);
    p.game.findMany.mockResolvedValue([
      game('g1', 'a1', 'b1', 5, 0, 'league', 2014),  // biggest A win, A home
      game('g2', 'b1', 'a2', 2, 1, 'league', 2018),  // B win, A away
      game('g3', 'a2', 'b1', 1, 1, 'cup', 2020),     // draw, cup
    ]);
    const res = await buildFullH2H('a1', 'b1');
    expect(res).not.toBeNull();
    expect(res!.totals).toMatchObject({ games: 3, winsA: 1, draws: 1, winsB: 1, goalsA: 7, goalsB: 3 });
    expect(res!.byCompetition.find((c) => c.competitionNameHe === 'league')!.games).toBe(2);
    expect(res!.atAHome).toMatchObject({ games: 2, winsA: 1, draws: 1, winsB: 0 });
    expect(res!.atBHome).toMatchObject({ games: 1, winsB: 1 });
    expect(res!.biggestAWin!.gameId).toBe('g1');
    expect(res!.meetings).toHaveLength(3);
    expect(res!.meetings[0].gameId).toBe('g3'); // newest first
  });
});
```

- [ ] **Step 3.2: Run → FAIL.**

- [ ] **Step 3.3: Implement** — append to `src/lib/h2h.ts` (READ the file first; reuse its family-resolution helper if one is extractable, else mirror its `nameHe`-grouping queries exactly):

```ts
export interface H2HCompetitionSplit {
  competitionNameHe: string;
  games: number; winsA: number; draws: number; winsB: number;
}
export interface H2HVenueSplit { games: number; winsA: number; draws: number; winsB: number }
export interface FullH2H {
  teamAName: string;
  teamBName: string;
  totals: { games: number; winsA: number; draws: number; winsB: number; goalsA: number; goalsB: number };
  byCompetition: H2HCompetitionSplit[];
  atAHome: H2HVenueSplit;
  atBHome: H2HVenueSplit;
  biggestAWin: { gameId: string; label: string; year: number } | null;
  biggestBWin: { gameId: string; label: string; year: number } | null;
  meetings: H2HMeeting[]; // FULL list, newest first (reuse the existing H2HMeeting type)
}

export async function buildFullH2H(teamAId: string, teamBId: string): Promise<FullH2H | null> {
  // Resolve both club families exactly like buildH2H does (nameHe grouping),
  // then fetch ALL completed games between the two id-sets, include competition.
  // Aggregate: totals; byCompetition keyed on competition.nameHe; venue split by
  // whether the A-side team was home; biggest wins by goal margin (ties → more
  // goals, then earlier year for "historic" flavor); meetings mapped like
  // buildH2H but WITHOUT a cap, sorted newest first.
  // ... implement with the same style/queries as buildH2H above this function.
}
```
The implementer writes the body mirroring `buildH2H`'s resolution + mapping (that code is directly above in the same file; the test defines exact expected shapes). Ordering: `meetings` newest→oldest. `biggest*Win.label` = `"5–0 (2014)"` format built from scores+year.

- [ ] **Step 3.4: Tests pass + tsc clean; commit**
```bash
git add src/lib/h2h.ts src/lib/__tests__/h2h-full.test.ts
git commit -m "feat(history): buildFullH2H — full rivalry aggregation (competition/venue splits, biggest wins)"
```

- [ ] **Step 3.5: Web pages**

`src/app/history/h2h/page.tsx` (index): server component; loads `getClubFamilies()`; renders a "בחרו יריבות" picker — two `<select>`s in a small `<form method="get" action="/history/h2h/redirect">`? NO — simpler, no client JS: render a curated grid of the TOP rivalries (compute meeting counts: for the ~20 families with most seasons, count games between each pair — or simpler and cheap: hardcode the derby list from `on-this-day.ts`'s `DERBY_PAIRS` + top clubs) as cards linking to `/history/h2h/{keyA}__{keyB}`. Plus a plain list of all clubs (each links to the club's team page). Keep index simple; full pair-picker UX can come later.

`src/app/history/h2h/[keys]/page.tsx`: parse `params.keys.split('__')` → two clubKeys → `getClubFamily` each (404 via `notFound()` when missing) → `buildFullH2H(famA.latestTeamId, famB.latestTeamId)`. Render: header `{A} 🆚 {B}`; totals strip (winsA/draws/winsB big numbers + goals); competition-split chips; venue-split two-column block; biggest-win chips (linking to the game pages); full meetings table (date, result, competition — every row links to `/games/{gameId}`). Hebrew metadata: `title: '{A} נגד {B} — כל המפגשים | StatsAI'`.

- [ ] **Step 3.6: Mobile**

Shared types: `FullH2HPayload` mirroring `FullH2H` (+ `clubs: Array<{clubKey; nameHe}>` for the picker payload).
Route `src/app/api/mobile/v1/history/h2h/route.ts`: GET — no params → `{ clubs }` (from getClubFamilies, top ~40 by season count: clubKey+nameHe); with `?a=<clubKey>&b=<clubKey>` → resolve + `buildFullH2H` → payload (400 on unknown keys).
Hook `mobile/hooks/useH2H.ts`: `useH2HClubs()` + `useH2H(a, b)` (enabled when both set).
Screen `mobile/app/history/h2h.tsx`: Header (`onBack`+`showBack`, title `יריבויות`), two horizontal club-chip pickers (or two simple modal-less dropdown lists — use the existing `TeamChip`-style Pressable chips pattern from preferences), result view below once both picked: totals strip, splits, biggest wins, meetings list (Pressable rows → `/games/{id}`), `<BottomNav />`. Entry: link-button from `/history/seasons` screen alongside the all-time link.

- [ ] **Step 3.7: Verify + commit**

`npx tsc --noEmit` root+mobile clean; `npm test` green; if server up, curl the h2h route both modes.
```bash
git add src/app/history/h2h src/app/api/mobile/v1/history/h2h shared/types/mobile-api.ts mobile/app/history/h2h.tsx mobile/hooks/useH2H.ts mobile/app/history/seasons.tsx
git commit -m "feat(history): rivalry pages — web index+pair page, mobile picker screen"
```

---

### Task 4: Release 2A

- [ ] **Step 4.1: Full sweep** — `npm test && npx tsc --noEmit && cd mobile && npm test && npx tsc --noEmit && cd ..` → all green.
- [ ] **Step 4.2: Version bump** — `0.18.0` in `src/lib/version.ts` + `package.json`; commit `chore(release): v0.18.0 — history foundations (club identity, all-time table, rivalries, follow-ups)`.
- [ ] **Step 4.3: Deploy** — push (gh account `egoziyaniv`); server: `git pull && npm install && npm run build && pm2 restart hbstats` (**no schema change in 2A — skip prisma step**).
- [ ] **Step 4.4: Prod data ops (owner-authorized script runs)** — `node scripts/merge-rsssf.js --mode topscorers` (now fixed) then `node scripts/merge-walla-leaderboards.js`; verify rank-1 TOP_SCORERS count for comp_liga_haal rises (expect ~70+); spot-check `/history/seasons` shows top scorers.
- [ ] **Step 4.5: Smoke** — `/history/all-time` (rows ≥ 40 clubs, filters work), `/history/h2h/api-…__api-…` for מכבי ת"א נגד הפועל ת"א (totals > 100 meetings across eras), mobile endpoints return JSON.
- [ ] **Step 4.6: OTA** — `cd mobile && eas update --branch production --platform ios --message "v0.18.0: all-time table + rivalries + history hub screens"` with the production env vars.
