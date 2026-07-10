# Phase 1 Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Phase 1 quick wins from the approved roadmap spec ([2026-07-10-product-roadmap-records-history-design.md](../specs/2026-07-10-product-roadmap-records-history-design.md)): home/away standings scope, "On This Day" (card + daily push), the "כל העונות" season spine page, and mobile search.

**Architecture:** All backend work is Next.js 14 App Router API routes + `src/lib` services over Prisma/PostgreSQL. Mobile work is Expo/React Native screens fetching via `apiClient` (TanStack Query) — ships via OTA, no App Store review. One additive schema change (`User.notifyOnThisDay`).

**Tech Stack:** TypeScript 5, Prisma 5, Jest (backend tests in `src/lib/__tests__/`), Expo SDK 54 + expo-router, NativeWind.

**Reality check vs spec (verified against code before planning):**
- Spec §4.1 form chips, zone coloring, legend — **already live** on mobile (`FormRow`, `zoneColor`, `ZoneLegend` in `mobile/app/(tabs)/standings.tsx`). Only the **scope toggle** remains → Task 1.
- Spec §4.4 mobile game completion — **already fully built** (events tab renders all events; lineups tab renders actual XI/bench/coach/ratings). **Dropped.**
- Spec §4.5 web search — **already built** (`/api/search` + Navbar UI). Only **mobile search** remains → Task 4.
- Spec §4.2 on-this-day "title-decider" heuristic — **deferred** (clinch detection is complex; finals/derby/goal-count cover v1). Noted as approved deviation.

**Conventions that bite (read before starting):**
- Backend tests mock the Prisma singleton BEFORE importing the module under test (see `src/lib/__tests__/ai-tools-standings.test.ts`).
- Mobile is native-RTL (`isRTL=true`, `swapLeftAndRightInRTL(false)`): rows use `rtlRow()` from `@/lib/rtl`, never hardcoded `row-reverse`; to anchor content visual-RIGHT use `alignItems:'flex-start'`; **never put `flex:1` on a `Text` inside an RTL row** (collapses to blank) — use `flexShrink:1` in a grouped View.
- Raw SQL table names are the `@@map` names: `games`, `players`, `seasons`, `teams`, `standings`. Quoted camelCase columns: `"dateTime"`, `"birthDate"`.
- Version bump `src/lib/version.ts` + `package.json` together before push (0.X.0 for this feature batch).
- Run `npx tsc --noEmit` at repo root (web) and `cd mobile && npx tsc --noEmit` after each task.

---

### Task 1: Standings scope toggle (הכל / בית / חוץ)

**Files:**
- Modify: `src/lib/standings-from-games.ts` (add `buildScopedTable`)
- Test: `src/lib/__tests__/standings-scoped.test.ts` (create)
- Modify: `src/app/api/mobile/v1/standings/route.ts`
- Modify: `shared/types/mobile-api.ts:132-136` (StandingsPayload)
- Modify: `mobile/hooks/useStandings.ts`
- Modify: `mobile/app/(tabs)/standings.tsx`

- [ ] **Step 1.1: Write the failing test**

Create `src/lib/__tests__/standings-scoped.test.ts`:

```ts
import { buildScopedTable } from '@/lib/standings-from-games';

const team = (id: string, nameHe: string) => ({ id, nameHe, nameEn: nameHe, logoUrl: null });
const game = (homeTeamId: string, awayTeamId: string, homeScore: number, awayScore: number) => ({
  homeTeamId, awayTeamId, homeScore, awayScore, roundNameEn: null,
});

describe('buildScopedTable', () => {
  const teams = [team('a', 'מכבי'), team('b', 'הפועל'), team('c', 'בית"ר')];
  // a beat b 3-0 at home; b beat a 2-1 at home; c drew both its home games
  const games = [
    game('a', 'b', 3, 0),
    game('b', 'a', 2, 1),
    game('c', 'a', 1, 1),
    game('c', 'b', 0, 0),
  ];

  it('home scope counts only home legs', () => {
    const rows = buildScopedTable(teams, games, 'home');
    const a = rows.find((r) => r.teamId === 'a')!;
    expect(a.played).toBe(1);           // only the a-b home game
    expect(a.wins).toBe(1);
    expect(a.points).toBe(3);
    expect(a.goalsFor).toBe(3);
    const c = rows.find((r) => r.teamId === 'c')!;
    expect(c.played).toBe(2);           // both c home games
    expect(c.draws).toBe(2);
    expect(c.points).toBe(2);
  });

  it('away scope counts only away legs', () => {
    const rows = buildScopedTable(teams, games, 'away');
    const b = rows.find((r) => r.teamId === 'b')!;
    expect(b.played).toBe(2);           // away at a (0-3 L) and at c (0-0 D)
    expect(b.losses).toBe(1);
    expect(b.draws).toBe(1);
    expect(b.points).toBe(1);
  });

  it('renumbers positions 1..N by points then goal difference', () => {
    const rows = buildScopedTable(teams, games, 'home');
    expect(rows.map((r) => r.position)).toEqual([1, 2, 3]);
    expect(rows[0].teamId).toBe('a');   // 3 pts, +3
  });

  it('skips games without scores', () => {
    const rows = buildScopedTable(teams, [{ homeTeamId: 'a', awayTeamId: 'b', homeScore: null, awayScore: null, roundNameEn: null }], 'home');
    expect(rows.find((r) => r.teamId === 'a')!.played).toBe(0);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/standings-scoped.test.ts`
Expected: FAIL — `buildScopedTable` is not exported.

- [ ] **Step 1.3: Implement `buildScopedTable`**

Append to `src/lib/standings-from-games.ts` (after `buildStandingsFromGames`):

```ts
export type StandingsScope = 'home' | 'away';

/**
 * Build a single flat table counting only each team's home legs (scope='home')
 * or away legs (scope='away'). Used by the mobile standings בית/חוץ toggle.
 * Point deductions deliberately NOT applied — they belong to the overall table
 * (Transfermarkt convention). No playoff-group splitting in scoped views.
 */
export function buildScopedTable(
  teams: TeamName[],
  games: GameForStandings[],
  scope: StandingsScope,
) {
  const rows = new Map<string, DerivedStandingRow>();
  for (const team of teams) {
    rows.set(team.id, {
      id: `scoped-${team.id}`,
      position: 999,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
      pointsAdjustment: 0, pointsAdjustmentNoteHe: null,
      teamId: team.id, team,
    });
  }

  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) continue;
    const teamId = scope === 'home' ? game.homeTeamId : game.awayTeamId;
    const row = rows.get(teamId);
    if (!row) continue;
    const gf = scope === 'home' ? game.homeScore : game.awayScore;
    const ga = scope === 'home' ? game.awayScore : game.homeScore;
    row.played += 1;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    if (gf > ga) { row.wins += 1; row.points += 3; }
    else if (gf < ga) { row.losses += 1; }
    else { row.draws += 1; row.points += 1; }
  }

  let pos = 1;
  return sortStandings([...rows.values()]).map((r) => {
    const p = pos++;
    return { ...r, position: p, displayPosition: p };
  });
}
```

- [ ] **Step 1.4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/standings-scoped.test.ts`
Expected: 4 passed. Also run `npx tsc --noEmit` — clean.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/standings-from-games.ts src/lib/__tests__/standings-scoped.test.ts
git commit -m "feat(standings): buildScopedTable — home/away-only league table"
```

- [ ] **Step 1.6: Add `scope` to the mobile standings route**

In `src/app/api/mobile/v1/standings/route.ts`:

1. Extend the import:
```ts
import { buildStandingsFromGames, shouldDeriveStandings, buildScopedTable } from '@/lib/standings-from-games';
```

2. After `const yearParam = searchParams.get('year');` add:
```ts
  const scopeParam = searchParams.get('scope');
  const scope: 'all' | 'home' | 'away' =
    scopeParam === 'home' || scopeParam === 'away' ? scopeParam : 'all';
```

3. Replace the `const sorted = shouldDeriveStandings(...)` expression with:
```ts
  const sorted =
    scope !== 'all'
      ? buildScopedTable(teams.map((t) => ({ ...t })), games, scope)
      : shouldDeriveStandings(
          rawStandings.map((r) => ({ played: r.played, groupNameEn: r.groupNameEn ?? null })),
          games,
        )
        ? buildStandingsFromGames(teams.map((t) => ({ ...t })), games, adjustments)
        : sortStandings(rawStandings);
```

4. Make the form string scope-aware — replace the body of `lastFiveFor` with:
```ts
  function lastFiveFor(teamId: string): string {
    return games
      .filter((g) => {
        if (g.homeScore == null || g.awayScore == null) return false;
        if (scope === 'home') return g.homeTeamId === teamId;
        if (scope === 'away') return g.awayTeamId === teamId;
        return g.homeTeamId === teamId || g.awayTeamId === teamId;
      })
      .sort((a, b) => (b.dateTime?.getTime() ?? 0) - (a.dateTime?.getTime() ?? 0))
      .slice(0, 5)
      .map((g) => {
        const isHome = g.homeTeamId === teamId;
        const teamGoals = isHome ? g.homeScore! : g.awayScore!;
        const oppGoals = isHome ? g.awayScore! : g.homeScore!;
        if (teamGoals > oppGoals) return 'נ';
        if (teamGoals < oppGoals) return 'ה';
        return 'ת';
      })
      .join('');
  }
```

5. Scoped views are one flat table — replace the `const groups = ...` expression with:
```ts
  const groups =
    scope !== 'all'
      ? [{ label: scope === 'home' ? 'טבלת בית' : 'טבלת חוץ', rows }]
      : championship.length > 0 && relegation.length > 0
        ? [
            { label: 'פלייאוף עליון', rows: championship },
            { label: 'פלייאוף תחתון', rows: relegation },
          ]
        : [{ label: 'ליגת העל', rows }];
```

6. Add `scope` to the response JSON:
```ts
  return NextResponse.json({
    season: { id: season.id, year: season.year, name: season.name },
    scope,
    groups,
  });
```

- [ ] **Step 1.7: Extend the shared type**

In `shared/types/mobile-api.ts`, `StandingsPayload` (line ~132) becomes:

```ts
export interface StandingsPayload {
  season: { id: string; year: number; name: string } | null;
  scope?: 'all' | 'home' | 'away'; // optional: older clients ignore it
  groups: StandingsGroup[];
}
```

- [ ] **Step 1.8: Typecheck web**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 1.9: Manual API check**

Run (dev server on :8011): `curl -s "http://localhost:8011/api/mobile/v1/standings?scope=home" | head -c 600`
Expected: JSON with `"scope":"home"`, one group labeled `"טבלת בית"`, per-row `played` roughly half the overall table.

- [ ] **Step 1.10: Commit**

```bash
git add src/app/api/mobile/v1/standings/route.ts shared/types/mobile-api.ts
git commit -m "feat(standings-api): scope=home|away param — scoped table, form and label"
```

- [ ] **Step 1.11: Mobile — pass scope through the hook**

Replace `mobile/hooks/useStandings.ts` with:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StandingsPayload } from '@shared/types/mobile-api';

export type StandingsScope = 'all' | 'home' | 'away';

export function useStandings(year?: number | null, scope: StandingsScope = 'all') {
  const params = new URLSearchParams();
  if (year != null) params.set('year', String(year));
  if (scope !== 'all') params.set('scope', scope);
  const qs = params.toString();
  return useQuery<StandingsPayload>({
    queryKey: ['standings', year ?? 'latest', scope],
    queryFn: () => apiClient.get<StandingsPayload>(`/standings${qs ? `?${qs}` : ''}`),
    staleTime: 60_000,
  });
}
```

- [ ] **Step 1.12: Mobile — scope toggle UI + hide zone strips when scoped**

In `mobile/app/(tabs)/standings.tsx`:

1. Add imports/state:
```ts
import { useState } from 'react';
import { TabBar } from '@/design-system/TabBar';
import { useStandings, type StandingsScope } from '@/hooks/useStandings';
```
```ts
  const [scope, setScope] = useState<StandingsScope>('all');
  const { data, isLoading, refetch, isRefetching } = useStandings(selectedYear, scope);
```

2. Directly under `<Header ... />` in the main return (before `<ScrollView>`), add the toggle:
```tsx
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TabBar
          items={[
            { id: 'all',  label: 'הכל' },
            { id: 'home', label: 'בית' },
            { id: 'away', label: 'חוץ' },
          ]}
          value={scope}
          onChange={(id) => setScope(id as StandingsScope)}
        />
      </View>
```

3. Zone strips/legend describe the OVERALL table only — in `StandingsRowView` add a `scoped: boolean` prop and compute `const zc = scoped ? null : zoneColor(...)`; at the call site pass `scoped={scope !== 'all'}`; wrap the `<ZoneLegend .../>` block with `{scope === 'all' ? (...) : null}`.

- [ ] **Step 1.13: Typecheck mobile + verify on simulator**

Run: `cd mobile && npx tsc --noEmit`
Expected: clean.
Then with backend on :8011: `cd mobile && EXPO_PUBLIC_API_BASE_URL=http://localhost:8011 npx expo start --ios` → standings tab → tap בית → table shrinks to home legs, no zone strips, form chips reflect home games only.

- [ ] **Step 1.14: Commit**

```bash
git add mobile/hooks/useStandings.ts "mobile/app/(tabs)/standings.tsx"
git commit -m "feat(mobile-standings): scope toggle הכל/בית/חוץ"
```

---

### Task 2: "היום לפני X שנים" — service, card (web+mobile), daily push

**Files:**
- Create: `src/lib/on-this-day.ts`
- Test: `src/lib/__tests__/on-this-day.test.ts` (create)
- Modify: `prisma/schema.prisma:30` (add `notifyOnThisDay` after `notifyNews`)
- Modify: `src/lib/push-settings.ts` (new category)
- Modify: `src/lib/push-notify.ts` (targeting)
- Modify: `src/components/AdminPushSettingsClient.tsx:5-12`
- Create: `src/app/api/cron/on-this-day/route.ts`
- Create: `src/components/OnThisDayCard.tsx`
- Modify: `src/app/page.tsx:712` area
- Modify: `src/lib/mobile-api.ts` (home payload) + `shared/types/mobile-api.ts` (HomePayload)
- Modify: `mobile/app/(tabs)/index.tsx`

- [ ] **Step 2.1: Write the failing service test**

Create `src/lib/__tests__/on-this-day.test.ts`:

```ts
// Mock the prisma singleton BEFORE importing the module under test.
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    game: { findMany: jest.fn() },
    player: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { pickAnniversaryMatch, getOnThisDay } from '@/lib/on-this-day';

const p = prisma as unknown as {
  $queryRaw: jest.Mock;
  game: { findMany: jest.Mock };
  player: { findMany: jest.Mock };
};

const mkGame = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  dateTime: new Date('2012-07-10T18:00:00Z'),
  homeScore: 1, awayScore: 0,
  roundNameEn: 'Round 12',
  homeTeam: { id: 'a', nameHe: 'מכבי חיפה' },
  awayTeam: { id: 'b', nameHe: 'הפועל תל אביב' },
  competition: { nameHe: 'ליגת העל' },
  ...over,
});

describe('pickAnniversaryMatch scoring', () => {
  const now = new Date('2026-07-10T09:00:00Z');

  it('prefers a cup final over a high-scoring league game', () => {
    const final = mkGame({ id: 'final', roundNameEn: 'Final', homeScore: 1, awayScore: 0 });
    const goalfest = mkGame({ id: 'goals', homeScore: 4, awayScore: 3 });
    expect(pickAnniversaryMatch([goalfest, final], now)!.id).toBe('final');
  });

  it('prefers a derby over an ordinary game with equal goals', () => {
    const derby = mkGame({
      id: 'derby',
      homeTeam: { id: 'a', nameHe: 'מכבי תל אביב' },
      awayTeam: { id: 'b', nameHe: 'הפועל תל אביב' },
    });
    const plain = mkGame({ id: 'plain' });
    expect(pickAnniversaryMatch([plain, derby], now)!.id).toBe('derby');
  });

  it('falls back to the highest-scoring game', () => {
    const g1 = mkGame({ id: 'g1', homeScore: 2, awayScore: 1 });
    const g2 = mkGame({ id: 'g2', homeScore: 3, awayScore: 3 });
    expect(pickAnniversaryMatch([g1, g2], now)!.id).toBe('g2');
  });

  it('returns null on empty input', () => {
    expect(pickAnniversaryMatch([], now)).toBeNull();
  });
});

describe('getOnThisDay', () => {
  it('assembles match + birthdays payload', async () => {
    p.$queryRaw.mockResolvedValueOnce([{ id: 'g1' }]);   // game ids for the day
    p.game.findMany.mockResolvedValue([mkGame()]);
    p.$queryRaw.mockResolvedValueOnce([{ id: 'p1' }]);   // birthday player ids
    p.player.findMany.mockResolvedValue([
      { id: 'p1', canonicalPlayerId: null, nameHe: 'יוסי בניון', birthDate: new Date('1980-07-10'), photoUrl: null, _count: { lineupEntries: 300 } },
    ]);
    const res = await getOnThisDay(new Date('2026-07-10T09:00:00Z'));
    expect(res.match).not.toBeNull();
    expect(res.match!.yearsAgo).toBe(14);
    expect(res.match!.headline).toContain('מכבי חיפה');
    expect(res.birthdays[0].nameHe).toBe('יוסי בניון');
    expect(res.birthdays[0].age).toBe(46);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/on-this-day.test.ts`
Expected: FAIL — module `@/lib/on-this-day` not found.

- [ ] **Step 2.3: Implement the service**

Create `src/lib/on-this-day.ts`:

```ts
import prisma from '@/lib/prisma';

/**
 * "היום לפני X שנים" — pick the day's best anniversary match + birthdays.
 * Scoring (spec §4.2; title-decider heuristic deferred): cup final > derby >
 * goal count, with a bonus for round anniversaries (10/20/25 years).
 */

export interface OnThisDayMatch {
  gameId: string;
  yearsAgo: number;
  dateISO: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  competitionName: string | null;
  headline: string;
}

export interface OnThisDayBirthday {
  playerId: string;
  nameHe: string;
  age: number;
  photoUrl: string | null;
}

export interface OnThisDayPayload {
  match: OnThisDayMatch | null;
  birthdays: OnThisDayBirthday[];
}

// Big-club pairs whose meetings are derbies. Hebrew names as stored in Team.nameHe.
const DERBY_PAIRS: Array<[string, string]> = [
  ['מכבי תל אביב', 'הפועל תל אביב'],
  ['מכבי חיפה', 'הפועל חיפה'],
  ['בית"ר ירושלים', 'הפועל ירושלים'],
  ['מכבי תל אביב', 'מכבי חיפה'],
  ['בית"ר ירושלים', 'הפועל תל אביב'],
];

type CandidateGame = {
  id: string;
  dateTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  roundNameEn: string | null;
  homeTeam: { id: string; nameHe: string };
  awayTeam: { id: string; nameHe: string };
  competition: { nameHe: string | null } | null;
};

function isDerby(a: string, b: string): boolean {
  return DERBY_PAIRS.some(
    ([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)),
  );
}

export function pickAnniversaryMatch(games: CandidateGame[], now: Date): CandidateGame | null {
  let best: CandidateGame | null = null;
  let bestScore = -1;
  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) continue;
    const goals = g.homeScore + g.awayScore;
    const yearsAgo = now.getFullYear() - g.dateTime.getFullYear();
    if (yearsAgo < 1) continue;
    let score = goals * 5;
    if (/final/i.test(g.roundNameEn || '')) score += 100;
    if (isDerby(g.homeTeam.nameHe, g.awayTeam.nameHe)) score += 50;
    if (yearsAgo % 10 === 0 || yearsAgo === 25) score += 20;
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

export async function getOnThisDay(now = new Date()): Promise<OnThisDayPayload> {
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Games played on this calendar day in past years (raw SQL: Prisma cannot
  // filter by month/day). Table/column names per @@map: games."dateTime".
  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM games
    WHERE status = 'COMPLETED'
      AND "homeScore" IS NOT NULL
      AND EXTRACT(MONTH FROM "dateTime") = ${month}
      AND EXTRACT(DAY FROM "dateTime") = ${day}
      AND EXTRACT(YEAR FROM "dateTime") < ${now.getFullYear()}
  `;
  let match: OnThisDayMatch | null = null;
  if (idRows.length) {
    const candidates = (await prisma.game.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      select: {
        id: true, dateTime: true, homeScore: true, awayScore: true, roundNameEn: true,
        homeTeam: { select: { id: true, nameHe: true } },
        awayTeam: { select: { id: true, nameHe: true } },
        competition: { select: { nameHe: true } },
      },
    })) as CandidateGame[];
    const picked = pickAnniversaryMatch(candidates, now);
    if (picked) {
      const yearsAgo = now.getFullYear() - picked.dateTime.getFullYear();
      match = {
        gameId: picked.id,
        yearsAgo,
        dateISO: picked.dateTime.toISOString(),
        homeName: picked.homeTeam.nameHe,
        awayName: picked.awayTeam.nameHe,
        homeScore: picked.homeScore!,
        awayScore: picked.awayScore!,
        competitionName: picked.competition?.nameHe ?? null,
        headline: `היום לפני ${yearsAgo} שנים: ${picked.homeTeam.nameHe} ${picked.homeScore}–${picked.awayScore} ${picked.awayTeam.nameHe}`,
      };
    }
  }

  // Birthdays: players born on this day, most-capped first, deduped by canonical id.
  const bdayIdRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM players
    WHERE "birthDate" IS NOT NULL
      AND EXTRACT(MONTH FROM "birthDate") = ${month}
      AND EXTRACT(DAY FROM "birthDate") = ${day}
  `;
  let birthdays: OnThisDayBirthday[] = [];
  if (bdayIdRows.length) {
    const players = await prisma.player.findMany({
      where: { id: { in: bdayIdRows.map((r) => r.id) } },
      select: {
        id: true, canonicalPlayerId: true, nameHe: true, birthDate: true, photoUrl: true,
        _count: { select: { lineupEntries: true } },
      },
    });
    const seen = new Set<string>();
    birthdays = players
      .sort((a, b) => b._count.lineupEntries - a._count.lineupEntries)
      .filter((pl) => {
        const key = pl.canonicalPlayerId || pl.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((pl) => ({
        playerId: pl.canonicalPlayerId || pl.id,
        nameHe: pl.nameHe,
        age: now.getFullYear() - pl.birthDate!.getFullYear(),
        photoUrl: pl.photoUrl,
      }));
  }

  return { match, birthdays };
}
```

(Field names verified against the schema: `Player.birthDate`, `Player.photoUrl`, `Player.canonicalPlayerId`, relation `lineupEntries` all exist as written.)

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/on-this-day.test.ts`
Expected: 5 passed. Run `npx tsc --noEmit` — clean.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/on-this-day.ts src/lib/__tests__/on-this-day.test.ts
git commit -m "feat(on-this-day): anniversary-match + birthdays service"
```

- [ ] **Step 2.6: Schema — `notifyOnThisDay` column**

In `prisma/schema.prisma`, after `notifyNews Boolean @default(true)` (line 30) add:

```prisma
  notifyOnThisDay           Boolean          @default(true)
```

Run: `npx prisma db push && npx prisma generate`
Expected: "Your database is now in sync". (On the prod deploy this requires the manual `npx prisma db push --accept-data-loss && npx prisma generate` step per CLAUDE.md.)

- [ ] **Step 2.7: Push category plumbing**

1. `src/lib/push-settings.ts`:
```ts
export type PushCategory = 'goals' | 'results' | 'reminders' | 'news' | 'onThisDay';
// ...
export const PUSH_CATEGORIES: PushCategory[] = ['goals', 'results', 'reminders', 'news', 'onThisDay'];

export const PUSH_CATEGORY_LABELS_HE: Record<PushCategory, string> = {
  goals: 'גולים',
  results: 'תוצאות סיום',
  reminders: 'תזכורות משחק',
  news: 'חדשות',
  onThisDay: 'היום לפני X שנים',
};

const DEFAULT_FLAGS: PushCategoryFlags = { goals: true, results: true, reminders: true, news: true, onThisDay: true };
```

2. `src/lib/push-notify.ts` — extend the pref map and add a targeting helper:
```ts
const USER_PREF_COLUMN: Record<PushCategory, 'notifyGoals' | 'notifyResults' | 'notifyReminders' | 'notifyNews' | 'notifyOnThisDay'> = {
  goals: 'notifyGoals',
  results: 'notifyResults',
  reminders: 'notifyReminders',
  news: 'notifyNews',
  onThisDay: 'notifyOnThisDay',
};
```
```ts
/** Tokens for all users opted into the daily on-this-day push (no team filter). */
export async function tokensForOnThisDay(): Promise<string[]> {
  if (!(await isCategoryEnabled('onThisDay'))) return [];
  const users = await prisma.user.findMany({
    where: { isActive: true, notifyOnThisDay: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}
```

3. `src/components/AdminPushSettingsClient.tsx` — extend the hardcoded type + rows:
```ts
type Flags = { goals: boolean; results: boolean; reminders: boolean; news: boolean; onThisDay: boolean };

const ROWS: Array<{ key: keyof Flags; title: string; desc: string }> = [
  { key: 'goals', title: '⚽ גולים', desc: 'התראה בזמן אמת על כל גול במשחק של קבוצה שעוקבים אחריה.' },
  { key: 'results', title: '🏁 תוצאות סיום', desc: 'התראה על התוצאה הסופית בתום המשחק.' },
  { key: 'reminders', title: '⏰ תזכורות משחק', desc: 'תזכורת כשעה לפני פתיחת משחק של קבוצה שעוקבים אחריה.' },
  { key: 'news', title: '📰 חדשות', desc: 'התראה על ידיעה חדשה מערוצי הטלגרם המוגדרים.' },
  { key: 'onThisDay', title: '📅 היום לפני X שנים', desc: 'התראה יומית אחת עם משחק היסטורי שנערך בתאריך של היום.' },
];
```

Run: `npx tsc --noEmit` — clean (the admin PUT route uses `setPushCategoryFlags`/`coerce`, which now accepts the new key automatically).

- [ ] **Step 2.8: Commit**

```bash
git add prisma/schema.prisma src/lib/push-settings.ts src/lib/push-notify.ts src/components/AdminPushSettingsClient.tsx
git commit -m "feat(push): onThisDay category — schema column, flags, targeting, admin toggle"
```

- [ ] **Step 2.9: Daily cron route**

Create `src/app/api/cron/on-this-day/route.ts` (mirrors notify-news: header-secret only, once-per-day idempotency via SiteSetting):

```ts
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOnThisDay } from '@/lib/on-this-day';
import { tokensForOnThisDay, sendIfAny } from '@/lib/push-notify';

export const dynamic = 'force-dynamic';

const LAST_SENT_KEY = 'on_this_day_last_sent';

/**
 * Daily "היום לפני X שנים" push. Guarded by CRON_SECRET via the `x-cron-secret`
 * HEADER only (a query-string secret leaks into access logs). Idempotent per
 * calendar day via SiteSetting — safe to retry. `?dry=1` previews without
 * sending or marking. Crontab: daily 09:00, curl -H "x-cron-secret: ...".
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1';

  const today = new Date().toISOString().slice(0, 10);
  const lastSent = await prisma.siteSetting.findUnique({ where: { key: LAST_SENT_KEY } });
  if (!dry && lastSent?.valueJson === today) {
    return NextResponse.json({ ok: true, skipped: 'already sent today' });
  }

  const payload = await getOnThisDay();
  if (!payload.match) {
    return NextResponse.json({ ok: true, skipped: 'no anniversary match today' });
  }

  const tokens = await tokensForOnThisDay();
  const title = `📅 היום לפני ${payload.match.yearsAgo} שנים`;
  const body = `${payload.match.homeName} ${payload.match.homeScore}–${payload.match.awayScore} ${payload.match.awayName}. זוכרים?`;

  let sent = 0;
  if (!dry && tokens.length) {
    const r = await sendIfAny(tokens, { title, body, data: { type: 'onThisDay', gameId: payload.match.gameId } });
    sent = r.sent;
  }
  if (!dry) {
    await prisma.siteSetting.upsert({
      where: { key: LAST_SENT_KEY },
      update: { valueJson: today },
      create: { key: LAST_SENT_KEY, valueJson: today },
    });
  }
  return NextResponse.json({ ok: true, dry, devices: tokens.length, sent, headline: payload.match.headline });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
```

Check `PushMessage` in `src/lib/push.ts` — if its `data` field type differs (e.g. requires `Record<string, string>`), coerce `gameId` accordingly.

Verify: `npx tsc --noEmit`, then `curl -s -H "x-cron-secret: $CRON_SECRET" "http://localhost:8011/api/cron/on-this-day?dry=1"`
Expected: `{"ok":true,"dry":true,...,"headline":"היום לפני ..."}` (or `skipped: no anniversary match today`).

**Deploy note (manual, requires owner authorization):** server crontab entry `0 9 * * * curl -s -H "x-cron-secret: $SECRET" http://localhost:3100/api/cron/on-this-day`.

- [ ] **Step 2.10: Web card**

Create `src/components/OnThisDayCard.tsx` (server component):

```tsx
import Link from 'next/link';
import { getOnThisDay } from '@/lib/on-this-day';

export default async function OnThisDayCard() {
  const data = await getOnThisDay().catch(() => null);
  if (!data || (!data.match && data.birthdays.length === 0)) return null;
  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">📅 היום לפני X שנים</p>
      {data.match ? (
        <Link href={`/games/${data.match.gameId}`} className="mt-2 block rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
          <p className="text-base font-black text-stone-900">
            {data.match.homeName} {data.match.homeScore}–{data.match.awayScore} {data.match.awayName}
          </p>
          <p className="mt-1 text-xs text-stone-500">
            לפני {data.match.yearsAgo} שנים
            {data.match.competitionName ? ` · ${data.match.competitionName}` : ''}
            {' · '}
            {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(data.match.dateISO))}
          </p>
        </Link>
      ) : null}
      {data.birthdays.length ? (
        <p className="mt-3 text-sm text-stone-700">
          🎂 {data.birthdays.map((b) => `${b.nameHe} (${b.age})`).join(' · ')}
        </p>
      ) : null}
    </section>
  );
}
```

In `src/app/page.tsx`: `import OnThisDayCard from '@/components/OnThisDayCard';` and render `<OnThisDayCard />` directly below the `<HomeLivePanel ... />` block (line ~712), inside the same column container.

Verify: `npx tsc --noEmit`, then open `http://localhost:8011/` — card appears (given the DB has a past game on today's date).

- [ ] **Step 2.11: Mobile — payload + card**

1. `shared/types/mobile-api.ts` — extend `HomePayload` (line ~186):
```ts
export interface OnThisDayHome {
  gameId: string;
  yearsAgo: number;
  headline: string;
  competitionName: string | null;
  birthdays: Array<{ playerId: string; nameHe: string; age: number }>;
}

export interface HomePayload {
  user: { id: string; name: string; avatarUrl: string | null } | null;
  favoriteTeam: TeamSummary | null;
  nextMatch: MatchCard | null;
  lastMatch: MatchCard | null;
  compactStandings: CompactStandingRow[];
  liveStrip: LiveMatchCompact[];
  newsStrip: NewsCard[];
  onThisDay?: OnThisDayHome | null;
}
```

2. `src/lib/mobile-api.ts` — in `getMobileHomePayload`, add `getOnThisDay().catch(() => null)` as another `Promise.all` entry (import from `@/lib/on-this-day`), and in the returned home object add:
```ts
      onThisDay: onThisDayData?.match
        ? {
            gameId: onThisDayData.match.gameId,
            yearsAgo: onThisDayData.match.yearsAgo,
            headline: onThisDayData.match.headline,
            competitionName: onThisDayData.match.competitionName,
            birthdays: onThisDayData.birthdays.map((b) => ({ playerId: b.playerId, nameHe: b.nameHe, age: b.age })),
          }
        : null,
```
(Match the exact insertion points to the existing `Promise.all` destructure — add `onThisDayData` LAST in both the destructure array and the promise list, after `israeliTeamApiIds`.)

3. `mobile/app/(tabs)/index.tsx` — after the favourite-team `Section` block (the `{fav ? (...) : null}` ending near line 77), add:
```tsx
        {data.onThisDay ? (
          <Section title="היום לפני X שנים">
            <Pressable onPress={() => router.push(`/games/${data.onThisDay!.gameId}` as any)}>
              <Card>
                <Text style={{ color: theme.ink[900], fontSize: 15, fontWeight: '800', textAlign: 'right', writingDirection: 'rtl' }}>
                  {data.onThisDay.headline}
                </Text>
                {data.onThisDay.birthdays.length ? (
                  <Text style={{ color: theme.ink[500], fontSize: 12, marginTop: 6, textAlign: 'right', writingDirection: 'rtl' }}>
                    🎂 {data.onThisDay.birthdays.map((b) => `${b.nameHe} (${b.age})`).join(' · ')}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          </Section>
        ) : null}
```
(`Section`, `Card`, `Pressable`, `router`, `theme` are already imported in this file.)

- [ ] **Step 2.12: Typecheck both + verify**

Run: `npx tsc --noEmit && cd mobile && npx tsc --noEmit && cd ..`
Expected: both clean. Simulator home screen shows the card; tapping opens the game page.

- [ ] **Step 2.13: Commit**

```bash
git add src/app/api/cron/on-this-day src/components/OnThisDayCard.tsx src/app/page.tsx src/lib/mobile-api.ts shared/types/mobile-api.ts "mobile/app/(tabs)/index.tsx"
git commit -m "feat(on-this-day): daily cron push + home cards (web + mobile)"
```

---

### Task 3: "כל העונות" season spine page

**Files:**
- Create: `src/lib/history/seasons-spine.ts`
- Test: `src/lib/__tests__/seasons-spine.test.ts` (create)
- Create: `src/app/history/seasons/page.tsx`
- Create: `src/app/api/mobile/v1/history/seasons/route.ts`
- Create: `mobile/app/history/seasons.tsx`
- Modify: `shared/types/mobile-api.ts` (payload type)
- Modify: `mobile/app/(tabs)/standings.tsx` (entry link)

- [ ] **Step 3.1: Write the failing test**

Create `src/lib/__tests__/seasons-spine.test.ts`:

```ts
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    season: { findMany: jest.fn() },
    standing: { findMany: jest.fn() },
    competitionLeaderboardEntry: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { getSeasonsSpine, _clearSpineCacheForTests } from '@/lib/history/seasons-spine';

const p = prisma as unknown as {
  season: { findMany: jest.Mock };
  standing: { findMany: jest.Mock };
  competitionLeaderboardEntry: { findMany: jest.Mock };
};

describe('getSeasonsSpine', () => {
  beforeEach(() => {
    _clearSpineCacheForTests();
    p.season.findMany.mockReset();
    p.standing.findMany.mockReset();
    p.competitionLeaderboardEntry.findMany.mockReset();
  });

  it('builds one row per season with champion, runner-up, top scorer, relegated', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's24', year: 2024, name: '2024/25' }]);
    p.standing.findMany.mockResolvedValue([
      { seasonId: 's24', position: 1, teamId: 't1', statusHe: null, descriptionHe: null, team: { id: 't1', nameHe: 'מכבי תל אביב', logoUrl: null } },
      { seasonId: 's24', position: 2, teamId: 't2', statusHe: null, descriptionHe: null, team: { id: 't2', nameHe: 'הפועל באר שבע', logoUrl: null } },
      { seasonId: 's24', position: 13, teamId: 't3', statusHe: null, descriptionHe: null, team: { id: 't3', nameHe: 'קריית שמונה', logoUrl: null } },
      { seasonId: 's24', position: 14, teamId: 't4', statusHe: null, descriptionHe: null, team: { id: 't4', nameHe: 'הפועל פ"ת', logoUrl: null } },
    ]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([
      { seasonId: 's24', rank: 1, playerId: 'pl1', playerNameHe: 'דור תורג\'מן', value: 18 },
    ]);

    const rows = await getSeasonsSpine();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      year: 2024,
      name: '2024/25',
      champion: { teamId: 't1', nameHe: 'מכבי תל אביב' },
      runnerUp: { teamId: 't2', nameHe: 'הפועל באר שבע' },
      topScorer: { playerId: 'pl1', nameHe: 'דור תורג\'מן', goals: 18 },
    });
    expect(rows[0].relegated.map((r) => r.nameHe)).toEqual(['קריית שמונה', 'הפועל פ"ת']);
  });

  it('omits seasons with no league standings', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's26', year: 2026, name: '2026/27' }]);
    p.standing.findMany.mockResolvedValue([]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);
    expect(await getSeasonsSpine()).toHaveLength(0);
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npx jest src/lib/__tests__/seasons-spine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement the service**

Create `src/lib/history/seasons-spine.ts`:

```ts
import prisma from '@/lib/prisma';

/**
 * "כל העונות" — one row per season: champion, runner-up, top scorer, relegated.
 * The FBref-style spine that makes 26 seasons browsable. Premier league only
 * (comp_liga_haal). Cached in-memory for 1h — history changes once a season.
 */

const LIGAT_HAAL_ID = 'comp_liga_haal';
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface SpineTeamRef { teamId: string; nameHe: string; logoUrl: string | null }
export interface SeasonSpineRow {
  seasonId: string;
  year: number;
  name: string;
  champion: SpineTeamRef | null;
  runnerUp: SpineTeamRef | null;
  topScorer: { playerId: string | null; nameHe: string; goals: number } | null;
  relegated: SpineTeamRef[];
}

let cache: { at: number; rows: SeasonSpineRow[] } | null = null;
export function _clearSpineCacheForTests() { cache = null; }

export async function getSeasonsSpine(): Promise<SeasonSpineRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const [seasons, standings, scorers] = await Promise.all([
    prisma.season.findMany({ orderBy: { year: 'desc' }, select: { id: true, year: true, name: true } }),
    prisma.standing.findMany({
      where: { competitionId: LIGAT_HAAL_ID },
      select: {
        seasonId: true, position: true, teamId: true, statusHe: true, descriptionHe: true,
        team: { select: { id: true, nameHe: true, logoUrl: true } },
      },
    }),
    prisma.competitionLeaderboardEntry.findMany({
      where: { competitionId: LIGAT_HAAL_ID, category: 'TOP_SCORERS', rank: 1 },
      select: { seasonId: true, rank: true, playerId: true, playerNameHe: true, value: true },
    }),
  ]);

  const standingsBySeason = new Map<string, typeof standings>();
  for (const s of standings) {
    const arr = standingsBySeason.get(s.seasonId) || [];
    arr.push(s);
    standingsBySeason.set(s.seasonId, arr);
  }
  const scorerBySeason = new Map(scorers.map((s) => [s.seasonId, s]));

  const ref = (s: (typeof standings)[number] | undefined): SpineTeamRef | null =>
    s ? { teamId: s.team.id, nameHe: s.team.nameHe, logoUrl: s.team.logoUrl } : null;

  const rows: SeasonSpineRow[] = [];
  for (const season of seasons) {
    const rowsForSeason = (standingsBySeason.get(season.id) || []).sort((a, b) => a.position - b.position);
    if (!rowsForSeason.length) continue; // pre-import or empty upcoming season

    // Relegated: rows explicitly marked ירידה; fallback bottom-2 by position.
    const marked = rowsForSeason.filter(
      (r) => (r.statusHe || '').includes('ירידה') || (r.descriptionHe || '').includes('ירידה'),
    );
    const relegated = (marked.length ? marked : rowsForSeason.slice(-2)).map((r) => ref(r)!) as SpineTeamRef[];

    const scorer = scorerBySeason.get(season.id);
    rows.push({
      seasonId: season.id,
      year: season.year,
      name: season.name,
      champion: ref(rowsForSeason.find((r) => r.position === 1)),
      runnerUp: ref(rowsForSeason.find((r) => r.position === 2)),
      topScorer: scorer ? { playerId: scorer.playerId, nameHe: scorer.playerNameHe || '', goals: scorer.value } : null,
      relegated,
    });
  }

  cache = { at: Date.now(), rows };
  return rows;
}
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `npx jest src/lib/__tests__/seasons-spine.test.ts`
Expected: 2 passed. `npx tsc --noEmit` — clean.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/history/seasons-spine.ts src/lib/__tests__/seasons-spine.test.ts
git commit -m "feat(history): seasons-spine service — champion/top-scorer/relegated per season"
```

- [ ] **Step 3.6: Web page**

Create `src/app/history/seasons/page.tsx`:

```tsx
import Link from 'next/link';
import type { Metadata } from 'next';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'כל העונות — ליגת העל | StatsAI',
  description: 'אלופות, מלכי שערים ויורדות בכל עונה של ליגת העל הישראלית מאז 2000.',
};

export default async function SeasonsSpinePage() {
  const rows = await getSeasonsSpine();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">כל העונות</h1>
      <p className="mt-2 text-sm text-stone-500">ליגת העל · {rows.length} עונות · כל שם הוא קישור</p>
      <div className="mt-6 overflow-x-auto rounded-[24px] border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
              <th className="px-4 py-3">עונה</th>
              <th className="px-4 py-3">אלופה</th>
              <th className="px-4 py-3">סגנית</th>
              <th className="px-4 py-3">מלך השערים</th>
              <th className="px-4 py-3">יורדות</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.seasonId} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-3 font-black text-stone-900">{row.name}</td>
                <td className="px-4 py-3">
                  {row.champion ? (
                    <Link href={`/teams/${row.champion.teamId}`} className="font-bold text-stone-900 hover:text-[var(--accent)]">
                      🏆 {row.champion.nameHe}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  {row.runnerUp ? (
                    <Link href={`/teams/${row.runnerUp.teamId}`} className="text-stone-700 hover:text-[var(--accent)]">
                      {row.runnerUp.nameHe}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  {row.topScorer ? (
                    row.topScorer.playerId ? (
                      <Link href={`/players/${row.topScorer.playerId}`} className="text-stone-700 hover:text-[var(--accent)]">
                        {row.topScorer.nameHe} · {row.topScorer.goals}
                      </Link>
                    ) : `${row.topScorer.nameHe} · ${row.topScorer.goals}`
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-stone-500">{row.relegated.map((r) => r.nameHe).join(', ') || '—'}</td>
                <td className="px-4 py-3">
                  {/* /standings expects the season ID (standings/page.tsx:153), not the year */}
                  <Link href={`/standings?season=${row.seasonId}`} className="text-xs font-bold text-[var(--accent)]">
                    ← טבלה מלאה
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Verify: open `http://localhost:8011/history/seasons` — table renders with 26 rows; the "טבלה מלאה" link opens that season's standings.

- [ ] **Step 3.7: Mobile endpoint + shared type**

1. `shared/types/mobile-api.ts` — append:
```ts
// ---------- History: seasons spine ----------

export interface SeasonSpineApiRow {
  seasonId: string;
  year: number;
  name: string;
  champion: { teamId: string; nameHe: string; logoUrl: string | null } | null;
  runnerUp: { teamId: string; nameHe: string; logoUrl: string | null } | null;
  topScorer: { playerId: string | null; nameHe: string; goals: number } | null;
  relegated: Array<{ teamId: string; nameHe: string; logoUrl: string | null }>;
}

export interface SeasonsSpinePayload {
  rows: SeasonSpineApiRow[];
}
```

2. Create `src/app/api/mobile/v1/history/seasons/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rows = await getSeasonsSpine();
  return NextResponse.json({ rows });
}
```

- [ ] **Step 3.8: Mobile screen + entry point**

1. Create `mobile/app/history/seasons.tsx`:
```tsx
import { ScrollView, View, Text, ActivityIndicator, Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { rtlRow } from '@/lib/rtl';
import { apiClient } from '@/lib/apiClient';
import { Header } from '@/design-system/Header';
import { Card } from '@/design-system/Card';
import { TeamCrest } from '@/design-system/TeamCrest';
import { theme } from '@/design-system/theme';
import { useTheme } from '@/contexts/ThemeContext';
import type { SeasonsSpinePayload } from '@shared/types/mobile-api';

export default function SeasonsSpineScreen() {
  const router = useRouter();
  const { brand } = useTheme();
  const { data, isLoading, refetch, isRefetching } = useQuery<SeasonsSpinePayload>({
    queryKey: ['history', 'seasons'],
    queryFn: () => apiClient.get<SeasonsSpinePayload>('/history/seasons'),
    staleTime: 60 * 60_000,
  });

  return (
    <View style={{ flex: 1, backgroundColor: theme.canvas.start }}>
      {/* Header supports onBack (Header.tsx:17) — renders its own back control */}
      <Header title="כל העונות" subtitle="ליגת העל · 2000 עד היום" onBack={() => router.back()} />
      {isLoading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={brand.accent} />}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
        >
          {(data?.rows ?? []).map((row) => (
            <Card key={row.seasonId}>
              <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.ink[900] }}>{row.name}</Text>
                {row.topScorer ? (
                  <Text style={{ fontSize: 11, color: theme.ink[500] }}>
                    ⚽ {row.topScorer.nameHe} · {row.topScorer.goals}
                  </Text>
                ) : null}
              </View>
              {row.champion ? (
                <Pressable
                  onPress={() => router.push(`/teams/${row.champion!.teamId}` as any)}
                  style={{ flexDirection: rtlRow(), alignItems: 'center', gap: 8, marginTop: 8 }}
                >
                  <TeamCrest name={row.champion.nameHe} logoUrl={row.champion.logoUrl} size={22} radius={4} />
                  <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], flexShrink: 1 }} numberOfLines={1}>
                    🏆 {row.champion.nameHe}
                  </Text>
                  {row.runnerUp ? (
                    <Text style={{ fontSize: 11, color: theme.ink[500], flexShrink: 1 }} numberOfLines={1}>
                      · סגנית: {row.runnerUp.nameHe}
                    </Text>
                  ) : null}
                </Pressable>
              ) : null}
              {row.relegated.length ? (
                <Text style={{ fontSize: 11, color: theme.ink[500], marginTop: 6, textAlign: 'right', writingDirection: 'rtl' }}>
                  ⬇️ {row.relegated.map((r) => r.nameHe).join(' · ')}
                </Text>
              ) : null}
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
```
2. Entry point — in `mobile/app/(tabs)/standings.tsx`, after the `<ZoneLegend .../>` container `</View>`, add:
```tsx
            <Pressable onPress={() => router.push('/history/seasons' as any)} style={{ marginTop: 10, marginHorizontal: 16, paddingVertical: 10, borderRadius: 12, backgroundColor: brand.accentGlow, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: theme.ink[900] }}>🏆 כל העונות — אלופות ומלכי שערים</Text>
            </Pressable>
```

- [ ] **Step 3.9: Typecheck + verify**

Run: `npx tsc --noEmit && cd mobile && npx tsc --noEmit && cd ..`
Expected: clean. Simulator: standings tab → "כל העונות" button → list of seasons; tapping a champion opens its team page.

- [ ] **Step 3.10: Commit**

```bash
git add src/app/history src/app/api/mobile/v1/history shared/types/mobile-api.ts mobile/app/history "mobile/app/(tabs)/standings.tsx"
git commit -m "feat(history): כל העונות season spine — web page + mobile screen"
```

---

### Task 4: Mobile search

**Files:**
- Create: `src/lib/search.ts` (extract from web route)
- Modify: `src/app/api/search/route.ts` (delegate to lib)
- Create: `src/app/api/mobile/v1/search/route.ts`
- Modify: `shared/types/mobile-api.ts` (SearchPayload)
- Modify: `mobile/app/(tabs)/players.tsx` (search UI)

- [ ] **Step 4.1: Extract the search service**

Create `src/lib/search.ts` — move the entire query+mapping body of `src/app/api/search/route.ts` into:

```ts
import prisma from '@/lib/prisma';
import { formatPlayerName } from '@/lib/player-display';

export interface SearchResultItem {
  id: string;
  type: 'team' | 'player' | 'game' | 'venue';
  label: string;
  subtitle?: string;
  href: string;
}

/** Name search over teams/players/games/venues (Hebrew + English, 5 per type). */
export async function searchEntities(query: string): Promise<SearchResultItem[]> {
  const [teams, players, games, venues] = await Promise.all([
    prisma.team.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),
    prisma.player.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      include: { team: true, canonicalPlayer: true },
      take: 5,
    }),
    prisma.game.findMany({
      where: {
        OR: [
          { homeTeam: { nameHe: { contains: query, mode: 'insensitive' } } },
          { homeTeam: { nameEn: { contains: query, mode: 'insensitive' } } },
          { awayTeam: { nameHe: { contains: query, mode: 'insensitive' } } },
          { awayTeam: { nameEn: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: { homeTeam: true, awayTeam: true },
      take: 5,
    }),
    prisma.venue.findMany({
      where: {
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
          { cityHe: { contains: query, mode: 'insensitive' } },
          { cityEn: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 5,
    }),
  ]);

  return [
    ...teams.map((team) => ({
      id: team.id,
      type: 'team' as const,
      label: team.nameHe || team.nameEn,
      subtitle: team.nameEn,
      href: `/teams/${team.id}`,
    })),
    ...players.map((player) => ({
      id: player.id,
      type: 'player' as const,
      label: formatPlayerName(player),
      subtitle: player.team?.nameHe || player.team?.nameEn || undefined,
      href: `/players/${player.canonicalPlayerId || player.id}`,
    })),
    ...games.map((game) => ({
      id: game.id,
      type: 'game' as const,
      label: `${game.homeTeam.nameHe || game.homeTeam.nameEn} מול ${game.awayTeam.nameHe || game.awayTeam.nameEn}`,
      subtitle: new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(game.dateTime),
      href: `/games/${game.id}`,
    })),
    ...venues.map((venue) => ({
      id: venue.id,
      type: 'venue' as const,
      label: venue.nameHe || venue.nameEn,
      subtitle: venue.cityHe || venue.cityEn || undefined,
      href: `/venues?q=${encodeURIComponent(venue.nameHe || venue.nameEn)}`,
    })),
  ];
}
```

Then reduce `src/app/api/search/route.ts` to:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { searchEntities } from '@/lib/search';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchEntities(query) });
}
```

Verify web search still works: `curl -s "http://localhost:8011/api/search?q=מכבי" | head -c 400` → same results as before the refactor. `npx tsc --noEmit` clean.

- [ ] **Step 4.2: Commit the refactor**

```bash
git add src/lib/search.ts src/app/api/search/route.ts
git commit -m "refactor(search): extract searchEntities lib from web route (no behavior change)"
```

- [ ] **Step 4.3: Mobile route + shared type**

1. Create `src/app/api/mobile/v1/search/route.ts`:
```ts
import { NextRequest, NextResponse } from 'next/server';
import { searchEntities } from '@/lib/search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchEntities(query) });
}
```

2. `shared/types/mobile-api.ts` — append:
```ts
// ---------- Search ----------

export interface SearchResultApiItem {
  id: string;
  type: 'team' | 'player' | 'game' | 'venue';
  label: string;
  subtitle?: string;
  href: string;
}

export interface SearchPayload {
  results: SearchResultApiItem[];
}
```

- [ ] **Step 4.4: Players-tab search UI**

In `mobile/app/(tabs)/players.tsx`:

1. Add imports:
```ts
import { TextInput } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { SearchPayload } from '@shared/types/mobile-api';
```

2. Inside the component add state + query (200ms debounce via `staleTime`+`enabled`):
```ts
  const [search, setSearch] = useState('');
  const { data: searchData, isFetching: searching } = useQuery<SearchPayload>({
    queryKey: ['search', search],
    queryFn: () => apiClient.get<SearchPayload>(`/search?q=${encodeURIComponent(search.trim())}`),
    enabled: search.trim().length >= 2,
    staleTime: 30_000,
  });
```

3. Directly under the `<Header ... />`, add the input:
```tsx
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="חיפוש שחקן או קבוצה…"
          placeholderTextColor={theme.ink[500]}
          style={{
            backgroundColor: 'white',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.ink[100],
            paddingHorizontal: 14,
            paddingVertical: 10,
            fontSize: 14,
            textAlign: 'right',
            writingDirection: 'rtl',
            color: theme.ink[900],
          }}
        />
      </View>
```

4. When there's an active search, render results INSTEAD of the regular tab content (wrap the existing content in `{search.trim().length < 2 ? (<existing content/>) : (<results/>)}`):
```tsx
        <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
          {searching ? <ActivityIndicator color={brand.accent} /> : null}
          {(searchData?.results ?? [])
            .filter((r) => r.type === 'player' || r.type === 'team')
            .map((r) => (
              <Pressable
                key={`${r.type}-${r.id}`}
                onPress={() => router.push((r.type === 'team' ? `/teams/${r.id}` : `/players/${r.id}`) as any)}
              >
                <Card>
                  <View style={{ flexDirection: rtlRow(), alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: theme.ink[900], textAlign: 'right' }} numberOfLines={1}>
                        {r.type === 'team' ? '🛡️ ' : '👤 '}{r.label}
                      </Text>
                      {r.subtitle ? (
                        <Text style={{ fontSize: 11, color: theme.ink[500], textAlign: 'right' }} numberOfLines={1}>{r.subtitle}</Text>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: 16, color: theme.ink[300] }}>‹</Text>
                  </View>
                </Card>
              </Pressable>
            ))}
          {!searching && search.trim().length >= 2 && (searchData?.results ?? []).filter((r) => r.type === 'player' || r.type === 'team').length === 0 ? (
            <Text style={{ textAlign: 'center', color: theme.ink[500], padding: 16 }}>לא נמצאו תוצאות.</Text>
          ) : null}
        </ScrollView>
```

- [ ] **Step 4.5: Typecheck + verify**

Run: `npx tsc --noEmit && cd mobile && npx tsc --noEmit && cd ..`
Expected: clean. Simulator: players tab → type "מכבי" → team + player results appear; tapping navigates.

- [ ] **Step 4.6: Commit**

```bash
git add src/app/api/mobile/v1/search shared/types/mobile-api.ts "mobile/app/(tabs)/players.tsx"
git commit -m "feat(mobile-search): search box in players tab over shared searchEntities"
```

---

### Task 5: Release

- [ ] **Step 5.1: Full test + typecheck sweep**

Run: `npm test && npx tsc --noEmit && cd mobile && npm test && npx tsc --noEmit && cd ..`
Expected: all suites pass, both typechecks clean.

- [ ] **Step 5.2: Version bump**

Set `APP_VERSION = '0.17.0'` in `src/lib/version.ts` and `"version": "0.17.0"` in `package.json` (new-feature minor bump per project convention).

```bash
git add src/lib/version.ts package.json
git commit -m "chore(release): v0.17.0 — phase 1 quick wins (scope toggle, on-this-day, seasons spine, mobile search)"
```

- [ ] **Step 5.3: Deploy checklist (manual, owner-gated)**

1. `git push origin main` (gh account must be `egoziyaniv` — run `gh auth switch --user egoziyaniv` if push 403s).
2. Server: `git pull && npm install && npx prisma db push --accept-data-loss && npx prisma generate && npm run build && pm2 restart hbstats` (schema changed — the prisma step is REQUIRED this release).
3. **Ask the owner** to authorize the new crontab line: `0 9 * * * curl -s -H "x-cron-secret: <SECRET>" http://localhost:3100/api/cron/on-this-day`.
4. Mobile OTA: `cd mobile && eas update` (JS-only changes — no App Store review).
5. Smoke: `/history/seasons` 200; `/api/mobile/v1/standings?scope=home` returns scoped table; on-this-day card on `/`; `?dry=1` cron returns a headline.
