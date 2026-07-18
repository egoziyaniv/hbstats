# Stat-Answer Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Hebrew "ask the data" surface (`/history/ask` web + mobile) where fans tap a question chip and get an accurate answer card backed by the Phase-2 history aggregates, with a cached AI narrative line.

**Architecture:** A question **registry** (`src/lib/stats-qa/`) of entries whose **resolvers** read existing materialized data (`RecordEntry`, `CompetitionLeaderboardEntry`) and existing services (`club-honors`, `seasons-spine`, `all-time-table`, `h2h`, `club-identity`). Numbers are always deterministic; a one-line Hebrew narrative is generated via `chatWithClaude` and cached in a new `StatNarrative` table keyed by `(questionKey, dataVersion)`, refreshed only when the nightly `rebuild-records` bumps `dataVersion`.

**Tech Stack:** Next.js 14 App Router (Server Components), Prisma/PostgreSQL, TypeScript, Jest (`@swc/jest`), Expo/React Native + TanStack Query (mobile), `@anthropic-ai/sdk` (via `src/lib/ai-providers.ts`).

**Spec:** `docs/superpowers/specs/2026-07-18-stat-answer-cards-design.md`.

**Catalog refinement discovered during planning (vs spec):** event-based records (`youngest_scorer`, `most_goals_player_game`) exist only at **league** scope in `RecordEntry`, so they move from the club section to the league section. Club section uses game-based records (biggest win, streaks) + top scorer (new aggregation) + honors + best season + H2H. This keeps every answer backed by real data.

---

## File Structure

**Create:**
- `src/lib/stats-qa/types.ts` — `StatAnswer`, `StatQuestion`, `ResolveCtx`.
- `src/lib/stats-qa/resolvers.ts` — all resolver functions (pure; read DB/services).
- `src/lib/stats-qa/aggregations.ts` — two new helpers: `clubAllTimeTopScorers`, `clubTopOpponents`, `topRivalries`, `leagueAllTimeTopScorers`.
- `src/lib/stats-qa/registry.ts` — the `StatQuestion[]` catalog wiring titles→resolvers→cardType.
- `src/lib/stats-qa/narrative.ts` — `getNarrative()` (cache read → generate via chatWithClaude → cache write; failure → null) + `getDataVersion()`.
- `src/lib/stats-qa/index.ts` — `answerQuestion(ctx)` orchestrator (resolve + narrative).
- `src/app/api/history/ask/route.ts` — web JSON API.
- `src/app/history/ask/page.tsx` — web page (Server Component shell) .
- `src/components/StatAskClient.tsx` — client component: chips, club/rival selectors, fetch + render.
- `src/components/StatAnswerCard.tsx` — hero/bar/leaderboard renderer (web).
- `src/components/HomeStatTeaser.tsx` — rotating home teaser card.
- `src/app/api/mobile/v1/history/ask/route.ts` — mobile API.
- `mobile/hooks/useStatQuestions.ts`, `mobile/hooks/useStatAnswer.ts` — mobile data hooks.
- `mobile/app/history/ask.tsx` — mobile screen.
- `mobile/design-system/StatAnswerCard.tsx` — mobile card renderer.
- Tests: `src/lib/stats-qa/__tests__/resolvers.test.ts`, `registry.test.ts`, `narrative.test.ts`, `aggregations.test.ts`; `mobile/hooks/__tests__/useStatAnswer.test.ts`.

**Modify:**
- `prisma/schema.prisma` — add `StatNarrative` model.
- `shared/types/mobile-api.ts` — add `StatAnswerApi`, `StatQuestionApi`, `StatQuestionsPayload`, `StatAnswerPayload`.
- `scripts/rebuild-records.ts` — bump `dataVersion` SiteSetting + pre-warm HBS/league narratives after rebuild.
- The History nav component (see Task 15) — add "שיאים ותשובות" link.
- `src/app/page.tsx` — mount `HomeStatTeaser`.
- `src/lib/version.ts` + `package.json` — version bump.

---

## Task 1: StatNarrative table + data-version helper

**Files:**
- Modify: `prisma/schema.prisma` (add model)
- Create: `src/lib/stats-qa/narrative.ts` (partial — `getDataVersion` only here; generation added in Task 11)
- Test: `src/lib/stats-qa/__tests__/narrative.test.ts`

- [ ] **Step 1: Add the Prisma model.** Append to `prisma/schema.prisma`:

```prisma
model StatNarrative {
  id          String   @id @default(cuid())
  questionKey String   // "<id>[:<clubKey>][:<rivalKey>]"
  dataVersion String   // stamp from rebuild-records; narratives regenerate when it changes
  text        String
  createdAt   DateTime @default(now())

  @@unique([questionKey, dataVersion])
  @@map("stat_narratives")
}
```

- [ ] **Step 2: Push schema + regenerate client.**

Run: `npx prisma db push --accept-data-loss && npx prisma generate`
Expected: `stat_narratives` table created; client regenerated, no errors.

- [ ] **Step 3: Write failing test for `getDataVersion`.** Create `src/lib/stats-qa/__tests__/narrative.test.ts`:

```ts
import { getDataVersion } from '@/lib/stats-qa/narrative';

jest.mock('@/lib/prisma', () => ({
  prisma: { siteSetting: { findUnique: jest.fn() } },
}));
import { prisma } from '@/lib/prisma';

describe('getDataVersion', () => {
  it('returns the stored stat_data_version value', async () => {
    (prisma.siteSetting.findUnique as jest.Mock).mockResolvedValue({ value: 'v-123' });
    expect(await getDataVersion()).toBe('v-123');
  });
  it('falls back to "0" when unset', async () => {
    (prisma.siteSetting.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await getDataVersion()).toBe('0');
  });
});
```

> Note: confirm the prisma singleton path is `@/lib/prisma` (grep `export const prisma`); if it differs, adjust the mock path here and in later tasks.

- [ ] **Step 4: Run test — expect FAIL** (module not found).

Run: `npm test -- src/lib/stats-qa/__tests__/narrative.test.ts`
Expected: FAIL — cannot find `@/lib/stats-qa/narrative`.

- [ ] **Step 5: Implement `getDataVersion`.** Create `src/lib/stats-qa/narrative.ts`:

```ts
import { prisma } from '@/lib/prisma';

export const STAT_DATA_VERSION_KEY = 'stat_data_version';

export async function getDataVersion(): Promise<string> {
  const row = await prisma.siteSetting.findUnique({ where: { key: STAT_DATA_VERSION_KEY } });
  return row?.value ?? '0';
}
```

> Confirm `SiteSetting` unique field is `key` (grep model in schema). Adjust if named differently.

- [ ] **Step 6: Run test — expect PASS.**

Run: `npm test -- src/lib/stats-qa/__tests__/narrative.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit.**

```bash
git add prisma/schema.prisma src/lib/stats-qa/narrative.ts src/lib/stats-qa/__tests__/narrative.test.ts
git commit -m "feat(stats-qa): StatNarrative table + getDataVersion"
```

---

## Task 2: Core types

**Files:**
- Create: `src/lib/stats-qa/types.ts`

- [ ] **Step 1: Write the types.** Create `src/lib/stats-qa/types.ts`:

```ts
export type CardType = 'hero' | 'bar' | 'leaderboard';

export interface StatAnswer {
  headline: { label: string; value: string; unit?: string } | null; // null → empty state
  secondary?: string;
  series?: { label: string; value: number }[];          // bar card
  top?: { name: string; value: string; href?: string }[]; // leaderboard card
  href?: string;
  coverageNote?: string;
}

export interface ResolveCtx {
  clubKey?: string;
  rivalKey?: string;
}

export interface StatQuestion {
  id: string;
  scope: 'club' | 'league';
  titleHe: (ctx: ResolveCtx & { clubNameHe?: string; rivalNameHe?: string }) => string;
  needsClub: boolean;
  needsRival?: boolean;
  cardType: CardType;
  resolve: (ctx: ResolveCtx) => Promise<StatAnswer>;
}
```

- [ ] **Step 2: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no new errors from this file.

- [ ] **Step 3: Commit.**

```bash
git add src/lib/stats-qa/types.ts
git commit -m "feat(stats-qa): core StatAnswer/StatQuestion types"
```

---

## Task 3: Records-backed resolvers (read `RecordEntry`)

Covers: club `biggest_win`, `longest_win_streak`, `longest_unbeaten_streak`; league `biggest_win`, `longest_unbeaten_streak`, `youngest_scorer`, `most_goals_player_game`.

**Files:**
- Create: `src/lib/stats-qa/resolvers.ts`
- Test: `src/lib/stats-qa/__tests__/resolvers.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/stats-qa/__tests__/resolvers.test.ts`:

```ts
jest.mock('@/lib/prisma', () => ({ prisma: { recordEntry: { findMany: jest.fn() } } }));
import { prisma } from '@/lib/prisma';
import { recordResolver } from '@/lib/stats-qa/resolvers';

describe('recordResolver', () => {
  it('maps the rank-1 RecordEntry into a hero StatAnswer', async () => {
    (prisma.recordEntry.findMany as jest.Mock).mockResolvedValue([
      { rank: 1, valueNum: 8, labelHe: 'הפועל ב"ש 8-0 בני יהודה', detailHe: '2015', gameId: 'g1', playerId: null, seasonYear: 2015 },
    ]);
    const r = await recordResolver('biggest_win', 'hero', 'game')({ clubKey: 'api-563' });
    expect(prisma.recordEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'biggest_win', scope: 'club:api-563' } })
    );
    expect(r.headline).toEqual({ label: 'הפועל ב"ש 8-0 בני יהודה', value: '2015' });
    expect(r.href).toBe('/games/g1');
  });

  it('returns empty-state headline:null when no rows', async () => {
    (prisma.recordEntry.findMany as jest.Mock).mockResolvedValue([]);
    const r = await recordResolver('biggest_win', 'hero', 'game')({ clubKey: 'api-563' });
    expect(r.headline).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`recordResolver` not exported).

Run: `npm test -- src/lib/stats-qa/__tests__/resolvers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `recordResolver`.** Create `src/lib/stats-qa/resolvers.ts`:

```ts
import { prisma } from '@/lib/prisma';
import type { StatAnswer, ResolveCtx } from './types';

type LinkKind = 'game' | 'player' | 'none';

function linkFor(kind: LinkKind, row: { gameId?: string | null; playerId?: string | null }): string | undefined {
  if (kind === 'game' && row.gameId) return `/games/${row.gameId}`;
  if (kind === 'player' && row.playerId) return `/players/${row.playerId}`;
  return undefined;
}

/** Reads a materialized RecordEntry (rank 1) for the given category/scope. */
export function recordResolver(category: string, _cardType: 'hero', link: LinkKind) {
  return async (ctx: ResolveCtx): Promise<StatAnswer> => {
    const scope = ctx.clubKey ? `club:${ctx.clubKey}` : 'league';
    const rows = await prisma.recordEntry.findMany({
      where: { category, scope },
      orderBy: { rank: 'asc' },
      take: 1,
    });
    const row = rows[0];
    if (!row) return { headline: null };
    return {
      headline: { label: row.labelHe, value: row.detailHe ?? String(row.valueNum ?? '') },
      href: linkFor(link, row),
    };
  };
}

/** Leaderboard variant: top-N RecordEntry rows (e.g. league most_goals_player_game). */
export function recordLeaderboardResolver(category: string, link: LinkKind, take = 5) {
  return async (ctx: ResolveCtx): Promise<StatAnswer> => {
    const scope = ctx.clubKey ? `club:${ctx.clubKey}` : 'league';
    const rows = await prisma.recordEntry.findMany({ where: { category, scope }, orderBy: { rank: 'asc' }, take });
    if (!rows.length) return { headline: null };
    return {
      headline: { label: rows[0].labelHe, value: rows[0].detailHe ?? String(rows[0].valueNum ?? '') },
      top: rows.map((r) => ({ name: r.labelHe, value: r.detailHe ?? String(r.valueNum ?? ''), href: linkFor(link, r) })),
    };
  };
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- src/lib/stats-qa/__tests__/resolvers.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/stats-qa/resolvers.ts src/lib/stats-qa/__tests__/resolvers.test.ts
git commit -m "feat(stats-qa): RecordEntry-backed resolvers (hero + leaderboard)"
```

---

## Task 4: Aggregation helpers (top scorers, opponents, rivalries)

**Files:**
- Create: `src/lib/stats-qa/aggregations.ts`
- Test: `src/lib/stats-qa/__tests__/aggregations.test.ts`

- [ ] **Step 1: Write failing test** for `clubAllTimeTopScorers`. Create `src/lib/stats-qa/__tests__/aggregations.test.ts`:

```ts
jest.mock('@/lib/prisma', () => ({
  prisma: { competitionLeaderboardEntry: { groupBy: jest.fn() } },
}));
jest.mock('@/lib/history/club-identity', () => ({ getClubFamily: jest.fn() }));
import { prisma } from '@/lib/prisma';
import { getClubFamily } from '@/lib/history/club-identity';
import { clubAllTimeTopScorers } from '@/lib/stats-qa/aggregations';

it('sums TOP_SCORERS by player across the club teams, desc', async () => {
  (getClubFamily as jest.Mock).mockResolvedValue({ teamIds: ['t1', 't2'], nameHe: 'הפועל ב"ש' });
  (prisma.competitionLeaderboardEntry.groupBy as jest.Mock).mockResolvedValue([
    { playerId: 'p1', playerNameHe: 'ברדה', _sum: { value: 94 } },
    { playerId: 'p2', playerNameHe: 'אוחיון', _sum: { value: 71 } },
  ]);
  const rows = await clubAllTimeTopScorers('api-563', 6);
  expect(prisma.competitionLeaderboardEntry.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ by: ['playerId', 'playerNameHe'], where: { category: 'TOP_SCORERS', teamId: { in: ['t1', 't2'] } } })
  );
  expect(rows[0]).toEqual({ playerId: 'p1', nameHe: 'ברדה', goals: 94 });
  expect(rows).toHaveLength(2);
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- src/lib/stats-qa/__tests__/aggregations.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement aggregations.** Create `src/lib/stats-qa/aggregations.ts`:

```ts
import { prisma } from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';

export interface ScorerRow { playerId: string | null; nameHe: string; goals: number }

export async function clubAllTimeTopScorers(clubKey: string, take: number): Promise<ScorerRow[]> {
  const fam = await getClubFamily(clubKey);
  if (!fam) return [];
  const grouped = await prisma.competitionLeaderboardEntry.groupBy({
    by: ['playerId', 'playerNameHe'],
    where: { category: 'TOP_SCORERS', teamId: { in: fam.teamIds } },
    _sum: { value: true },
  });
  return grouped
    .map((g) => ({ playerId: g.playerId, nameHe: g.playerNameHe ?? 'לא ידוע', goals: g._sum.value ?? 0 }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, take);
}

export async function leagueAllTimeTopScorers(take: number): Promise<ScorerRow[]> {
  const grouped = await prisma.competitionLeaderboardEntry.groupBy({
    by: ['playerId', 'playerNameHe'],
    where: { category: 'TOP_SCORERS' },
    _sum: { value: true },
  });
  return grouped
    .map((g) => ({ playerId: g.playerId, nameHe: g.playerNameHe ?? 'לא ידוע', goals: g._sum.value ?? 0 }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, take);
}

export interface OpponentRow { clubKey: string; nameHe: string; games: number; wins: number; draws: number; losses: number }

/** Tally a club's opponents across completed games (2000+), grouped by opponent club family. */
export async function clubTopOpponents(clubKey: string, take: number): Promise<OpponentRow[]> {
  const fam = await getClubFamily(clubKey);
  if (!fam) return [];
  const index = await getClubTeamIndex();
  const games = await prisma.game.findMany({
    where: {
      status: 'COMPLETED',
      OR: [{ homeTeamId: { in: fam.teamIds } }, { awayTeamId: { in: fam.teamIds } }],
      homeScore: { not: null }, awayScore: { not: null },
    },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });
  const tally = new Map<string, OpponentRow>();
  for (const g of games) {
    const weAreHome = fam.teamIds.includes(g.homeTeamId);
    const oppId = weAreHome ? g.awayTeamId : g.homeTeamId;
    const oppFam = index.get(oppId);
    if (!oppFam || oppFam.clubKey === clubKey) continue;
    const us = weAreHome ? g.homeScore! : g.awayScore!;
    const them = weAreHome ? g.awayScore! : g.homeScore!;
    const row = tally.get(oppFam.clubKey) ?? { clubKey: oppFam.clubKey, nameHe: oppFam.nameHe, games: 0, wins: 0, draws: 0, losses: 0 };
    row.games++;
    if (us > them) row.wins++; else if (us === them) row.draws++; else row.losses++;
    tally.set(oppFam.clubKey, row);
  }
  return [...tally.values()].sort((a, b) => b.games - a.games).slice(0, take);
}

export interface RivalryRow { label: string; games: number; aKey: string; bKey: string }

/** Most-met club pairs across all completed games (2000+). */
export async function topRivalries(take: number): Promise<RivalryRow[]> {
  const index = await getClubTeamIndex();
  const games = await prisma.game.findMany({
    where: { status: 'COMPLETED' },
    select: { homeTeamId: true, awayTeamId: true },
  });
  const tally = new Map<string, RivalryRow>();
  for (const g of games) {
    const a = index.get(g.homeTeamId); const b = index.get(g.awayTeamId);
    if (!a || !b || a.clubKey === b.clubKey) continue;
    const [x, y] = [a, b].sort((m, n) => (m.clubKey < n.clubKey ? -1 : 1));
    const key = `${x.clubKey}|${y.clubKey}`;
    const row = tally.get(key) ?? { label: `${x.nameHe} — ${y.nameHe}`, games: 0, aKey: x.clubKey, bKey: y.clubKey };
    row.games++;
    tally.set(key, row);
  }
  return [...tally.values()].sort((a, b) => b.games - a.games).slice(0, take);
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- src/lib/stats-qa/__tests__/aggregations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/stats-qa/aggregations.ts src/lib/stats-qa/__tests__/aggregations.test.ts
git commit -m "feat(stats-qa): top-scorer/opponent/rivalry aggregation helpers"
```

---

## Task 5: Service-backed resolvers (scorers, honors, best season, all-time, H2H)

**Files:**
- Modify: `src/lib/stats-qa/resolvers.ts`
- Modify: `src/lib/stats-qa/__tests__/resolvers.test.ts`

- [ ] **Step 1: Add failing test** for `clubTopScorerResolver` (bar card with season-less series → falls back to a top-3 leaderboard-in-hero). Append to `resolvers.test.ts`:

```ts
jest.mock('@/lib/stats-qa/aggregations', () => ({
  clubAllTimeTopScorers: jest.fn(), leagueAllTimeTopScorers: jest.fn(),
  clubTopOpponents: jest.fn(), topRivalries: jest.fn(),
}));
import { clubAllTimeTopScorers } from '@/lib/stats-qa/aggregations';
import { clubTopScorerResolver } from '@/lib/stats-qa/resolvers';

it('clubTopScorerResolver → hero + top list', async () => {
  (clubAllTimeTopScorers as jest.Mock).mockResolvedValue([
    { playerId: 'p1', nameHe: 'ברדה', goals: 94 }, { playerId: 'p2', nameHe: 'אוחיון', goals: 71 },
  ]);
  const r = await clubTopScorerResolver({ clubKey: 'api-563' });
  expect(r.headline).toEqual({ label: 'ברדה', value: '94', unit: 'שערים' });
  expect(r.top?.[0]).toEqual({ name: 'ברדה', value: '94', href: '/players/p1' });
  expect(r.href).toBe('/players/p1');
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- src/lib/stats-qa/__tests__/resolvers.test.ts -t clubTopScorerResolver`
Expected: FAIL.

- [ ] **Step 3: Implement the service-backed resolvers.** Append to `src/lib/stats-qa/resolvers.ts`:

```ts
import { clubAllTimeTopScorers, leagueAllTimeTopScorers, clubTopOpponents, topRivalries } from './aggregations';
import { getClubHonors, getAllHonors } from '@/lib/history/club-honors';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';
import { buildAllTimeTable } from '@/lib/history/all-time-table';
import { buildFullH2H } from '@/lib/h2h';
import { getClubFamily } from '@/lib/history/club-identity';

const scorerCard = (rows: { playerId: string | null; nameHe: string; goals: number }[]): StatAnswer => {
  if (!rows.length) return { headline: null };
  const top = rows[0];
  return {
    headline: { label: top.nameHe, value: String(top.goals), unit: 'שערים' },
    top: rows.map((s) => ({ name: s.nameHe, value: String(s.goals), href: s.playerId ? `/players/${s.playerId}` : undefined })),
    href: top.playerId ? `/players/${top.playerId}` : undefined,
    coverageNote: 'מבוסס לוחות מובילים עונתיים',
  };
};

export const clubTopScorerResolver = async (ctx: ResolveCtx): Promise<StatAnswer> =>
  scorerCard(await clubAllTimeTopScorers(ctx.clubKey!, 6));

export const leagueTopScorerResolver = async (): Promise<StatAnswer> =>
  scorerCard(await leagueAllTimeTopScorers(6));

export const clubTopOpponentResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  const rows = await clubTopOpponents(ctx.clubKey!, 6);
  if (!rows.length) return { headline: null };
  const t = rows[0];
  return {
    headline: { label: t.nameHe, value: `${t.games}`, unit: 'משחקים' },
    secondary: `מאזן: ${t.wins} נצחונות · ${t.draws} תיקו · ${t.losses} הפסדים`,
    top: rows.map((o) => ({ name: o.nameHe, value: `${o.games} (${o.wins}-${o.draws}-${o.losses})`, href: `/history/h2h/${ctx.clubKey}--${o.clubKey}` })),
  };
};

export const clubHonorsResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  const h = await getClubHonors(ctx.clubKey!);
  if (!h) return { headline: null };
  const total = h.leagueTitles.count + h.stateCup.count + h.totoCup.count + h.superCup.count;
  return {
    headline: { label: 'סה"כ תארים', value: String(total) },
    top: [
      { name: 'אליפויות', value: String(h.leagueTitles.count) },
      { name: 'גביע המדינה', value: String(h.stateCup.count) },
      { name: 'גביע הטוטו', value: String(h.totoCup.count) },
      { name: 'סופרקאפ', value: String(h.superCup.count) },
    ],
  };
};

export const mostTitlesResolver = async (): Promise<StatAnswer> => {
  const all = (await getAllHonors()).slice().sort((a, b) => b.leagueTitles.count - a.leagueTitles.count).slice(0, 6);
  if (!all.length) return { headline: null };
  return {
    headline: { label: all[0].nameHe, value: String(all[0].leagueTitles.count), unit: 'אליפויות' },
    top: all.map((h) => ({ name: h.nameHe, value: String(h.leagueTitles.count) })),
  };
};

export const mostStateCupsResolver = async (): Promise<StatAnswer> => {
  const all = (await getAllHonors()).slice().sort((a, b) => b.stateCup.count - a.stateCup.count).slice(0, 6);
  if (!all.length) return { headline: null };
  return {
    headline: { label: all[0].nameHe, value: String(all[0].stateCup.count), unit: 'גביעי מדינה' },
    top: all.map((h) => ({ name: h.nameHe, value: String(h.stateCup.count) })),
  };
};

export const clubBestSeasonResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  const fam = await getClubFamily(ctx.clubKey!);
  if (!fam) return { headline: null };
  const spine = await getSeasonsSpine();
  const champ = spine.find((s) => s.champion && fam.teamIds.includes(s.champion.teamId));
  if (champ) return { headline: { label: 'אלופה', value: champ.name }, secondary: 'העונה הטובה ביותר: זכייה באליפות' };
  const runner = spine.find((s) => s.runnerUp && fam.teamIds.includes(s.runnerUp.teamId));
  if (runner) return { headline: { label: 'סגנית אלופה', value: runner.name } };
  return { headline: null };
};

export const allTimeLeaderResolver = async (): Promise<StatAnswer> => {
  const rows = await buildAllTimeTable({ scope: 'all' });
  if (!rows.length) return { headline: null };
  return {
    headline: { label: rows[0].nameHe, value: String(rows[0].points), unit: 'נק׳' },
    top: rows.slice(0, 6).map((r) => ({ name: r.nameHe, value: `${r.points}` })),
    href: '/history/all-time',
  };
};

export const biggestRivalriesResolver = async (): Promise<StatAnswer> => {
  const rows = await topRivalries(6);
  if (!rows.length) return { headline: null };
  return {
    headline: { label: rows[0].label, value: String(rows[0].games), unit: 'מפגשים' },
    top: rows.map((r) => ({ name: r.label, value: String(r.games), href: `/history/h2h/${r.aKey}--${r.bKey}` })),
    href: '/history/h2h',
  };
};

export const h2hRivalResolver = async (ctx: ResolveCtx): Promise<StatAnswer> => {
  if (!ctx.clubKey || !ctx.rivalKey) return { headline: null };
  const a = await getClubFamily(ctx.clubKey); const b = await getClubFamily(ctx.rivalKey);
  if (!a || !b) return { headline: null };
  const h = await buildFullH2H(a.latestTeamId, b.latestTeamId);
  if (!h || h.totals.games === 0) return { headline: null };
  return {
    headline: { label: `${h.teamAName} מול ${h.teamBName}`, value: `${h.totals.winsA}-${h.totals.draws}-${h.totals.winsB}` },
    secondary: `${h.totals.games} מפגשים · שערים ${h.totals.goalsA}:${h.totals.goalsB}`,
    href: `/history/h2h/${ctx.clubKey}--${ctx.rivalKey}`,
  };
};
```

> Verify the H2H route path format. The Explore report shows web page `src/app/history/h2h/[keys]/page.tsx`; open it to confirm the `keys` separator (this plan assumes `<aKey>--<bKey>`). If it differs (e.g. `%2C`), fix the `href` builders here and in Task 4.

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- src/lib/stats-qa/__tests__/resolvers.test.ts`
Expected: PASS (all resolver tests).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/stats-qa/resolvers.ts src/lib/stats-qa/__tests__/resolvers.test.ts
git commit -m "feat(stats-qa): service-backed resolvers (scorers, honors, seasons, all-time, h2h)"
```

---

## Task 6: The registry

**Files:**
- Create: `src/lib/stats-qa/registry.ts`
- Test: `src/lib/stats-qa/__tests__/registry.test.ts`

- [ ] **Step 1: Write failing test.** Create `src/lib/stats-qa/__tests__/registry.test.ts`:

```ts
import { REGISTRY, getQuestion } from '@/lib/stats-qa/registry';

it('has unique ids and valid cardTypes', () => {
  const ids = REGISTRY.map((q) => q.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const q of REGISTRY) expect(['hero', 'bar', 'leaderboard']).toContain(q.cardType);
});
it('club questions set needsClub=true', () => {
  for (const q of REGISTRY.filter((x) => x.scope === 'club')) expect(q.needsClub).toBe(true);
});
it('getQuestion returns by id', () => {
  expect(getQuestion('league_most_titles')?.scope).toBe('league');
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- src/lib/stats-qa/__tests__/registry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the registry.** Create `src/lib/stats-qa/registry.ts`:

```ts
import type { StatQuestion } from './types';
import {
  recordResolver, recordLeaderboardResolver, clubTopScorerResolver, leagueTopScorerResolver,
  clubTopOpponentResolver, clubHonorsResolver, mostTitlesResolver, mostStateCupsResolver,
  clubBestSeasonResolver, allTimeLeaderResolver, biggestRivalriesResolver, h2hRivalResolver,
} from './resolvers';

const club = (id: string, titleHe: string, cardType: StatQuestion['cardType'], resolve: StatQuestion['resolve'], extra: Partial<StatQuestion> = {}): StatQuestion =>
  ({ id, scope: 'club', needsClub: true, cardType, titleHe: () => titleHe, resolve, ...extra });
const league = (id: string, titleHe: string, cardType: StatQuestion['cardType'], resolve: StatQuestion['resolve']): StatQuestion =>
  ({ id, scope: 'league', needsClub: false, cardType, titleHe: () => titleHe, resolve });

export const REGISTRY: StatQuestion[] = [
  // club
  club('club_top_scorer', 'מלך השערים בכל הזמנים', 'leaderboard', clubTopScorerResolver),
  club('club_unbeaten', 'הרצף הארוך ביותר בלי הפסד', 'hero', recordResolver('longest_unbeaten_streak', 'hero', 'none')),
  club('club_win_streak', 'רצף הניצחונות הארוך ביותר', 'hero', recordResolver('longest_win_streak', 'hero', 'none')),
  club('club_biggest_win', 'הניצחון הכי גדול', 'hero', recordResolver('biggest_win', 'hero', 'game')),
  club('club_top_opponent', 'היריבה הכי תכופה + מאזן', 'leaderboard', clubTopOpponentResolver),
  club('club_h2h_rival', 'מאזן מול יריבה', 'leaderboard', h2hRivalResolver, { needsRival: true }),
  club('club_honors', 'תארים והישגים', 'leaderboard', clubHonorsResolver),
  club('club_best_season', 'העונה הכי טובה', 'hero', clubBestSeasonResolver),
  // league
  league('league_most_titles', 'הכי הרבה אליפויות', 'leaderboard', mostTitlesResolver),
  league('league_top_scorer', 'מלך השערים ההיסטורי', 'leaderboard', leagueTopScorerResolver),
  league('league_biggest_win', 'הניצחון הכי גדול אי פעם', 'hero', recordResolver('biggest_win', 'hero', 'game')),
  league('league_unbeaten', 'הרצף הכי ארוך בלי הפסד', 'hero', recordResolver('longest_unbeaten_streak', 'hero', 'none')),
  league('league_most_state_cups', 'הכי הרבה גביעי מדינה', 'leaderboard', mostStateCupsResolver),
  league('league_all_time_leader', 'מובילת טבלת כל-הזמנים', 'leaderboard', allTimeLeaderResolver),
  league('league_biggest_rivalries', 'היריבויות הגדולות', 'leaderboard', biggestRivalriesResolver),
  league('league_youngest_scorer', 'המבקיע הצעיר ביותר (מ-2006)', 'hero', recordResolver('youngest_scorer', 'hero', 'player')),
  league('league_most_goals_game', 'הכי הרבה שערים למשחק (שחקן)', 'leaderboard', recordLeaderboardResolver('most_goals_player_game', 'player')),
];

export function getQuestion(id: string): StatQuestion | undefined {
  return REGISTRY.find((q) => q.id === id);
}
```

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- src/lib/stats-qa/__tests__/registry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/lib/stats-qa/registry.ts src/lib/stats-qa/__tests__/registry.test.ts
git commit -m "feat(stats-qa): question registry"
```

---

## Task 7: Narrative generation + cache

**Files:**
- Modify: `src/lib/stats-qa/narrative.ts`
- Modify: `src/lib/stats-qa/__tests__/narrative.test.ts`

- [ ] **Step 1: Add failing tests** for `getNarrative` (cache hit, generate-on-miss, failure→null). Append to `narrative.test.ts` and extend the prisma mock at top to include `statNarrative`:

```ts
// extend the jest.mock('@/lib/prisma', ...) at the top of the file to:
//   prisma: { siteSetting: { findUnique: jest.fn() },
//             statNarrative: { findUnique: jest.fn(), create: jest.fn() } }
jest.mock('@/lib/ai-settings', () => ({ getAiSettings: jest.fn(), getActiveApiKey: jest.fn() }));
jest.mock('@/lib/ai-providers', () => ({ chatWithClaude: jest.fn() }));
import { getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude } from '@/lib/ai-providers';
import { getNarrative } from '@/lib/stats-qa/narrative';

describe('getNarrative', () => {
  const answer = { headline: { label: 'ברדה', value: '94', unit: 'שערים' } } as any;
  beforeEach(() => jest.clearAllMocks());

  it('returns cached text without calling the LLM', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue({ text: 'משפט שמור' });
    const t = await getNarrative('club_top_scorer:api-563', 'v1', 'שאלה', answer);
    expect(t).toBe('משפט שמור');
    expect(chatWithClaude).not.toHaveBeenCalled();
  });

  it('generates + caches on miss', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue(null);
    (getActiveApiKey as jest.Mock).mockReturnValue('sk-x');
    (chatWithClaude as jest.Mock).mockResolvedValue('משפט חדש');
    const t = await getNarrative('club_top_scorer:api-563', 'v1', 'שאלה', answer);
    expect(t).toBe('משפט חדש');
    expect(prisma.statNarrative.create).toHaveBeenCalled();
  });

  it('returns null (never throws) when generation fails', async () => {
    (prisma.statNarrative.findUnique as jest.Mock).mockResolvedValue(null);
    (getActiveApiKey as jest.Mock).mockReturnValue('sk-x');
    (chatWithClaude as jest.Mock).mockRejectedValue(new Error('LLM down'));
    expect(await getNarrative('k', 'v1', 'שאלה', answer)).toBeNull();
  });

  it('returns null when no headline (empty-state answers get no narrative)', async () => {
    expect(await getNarrative('k', 'v1', 'שאלה', { headline: null } as any)).toBeNull();
    expect(prisma.statNarrative.findUnique).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

Run: `npm test -- src/lib/stats-qa/__tests__/narrative.test.ts`
Expected: FAIL (`getNarrative` not exported).

- [ ] **Step 3: Implement `getNarrative`.** Append to `src/lib/stats-qa/narrative.ts`:

```ts
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude } from '@/lib/ai-providers';
import type { StatAnswer } from './types';

export async function getNarrative(questionKey: string, dataVersion: string, titleHe: string, answer: StatAnswer): Promise<string | null> {
  if (!answer.headline) return null;
  const cached = await prisma.statNarrative.findUnique({ where: { questionKey_dataVersion: { questionKey, dataVersion } } });
  if (cached) return cached.text;
  try {
    const settings = await getAiSettings();
    const apiKey = getActiveApiKey(settings);
    if (!apiKey) return null;
    const facts = JSON.stringify({ headline: answer.headline, secondary: answer.secondary, top: answer.top?.slice(0, 3) });
    const prompt =
      `אתה עורך סטטיסטיקות כדורגל ישראלי. נתון לך נתון אמת. כתוב משפט הקשר אחד בעברית (עד 18 מילים), ` +
      `בלי להמציא מספרים שאינם בנתון, בלי לחזור על המספר. שאלה: "${titleHe}". נתון: ${facts}`;
    const text = (await chatWithClaude(apiKey, [{ role: 'user', content: prompt }])).trim();
    if (!text) return null;
    await prisma.statNarrative.create({ data: { questionKey, dataVersion, text } }).catch(() => {});
    return text;
  } catch {
    return null; // never block the answer on the LLM
  }
}
```

> `chatWithClaude` runs a tool-use loop; that's fine (no tools will be called for this prompt). Confirm `getActiveApiKey` is synchronous (Explore report shows it takes the settings object) — if it's async, `await` it.

- [ ] **Step 4: Run — expect PASS.**

Run: `npm test -- src/lib/stats-qa/__tests__/narrative.test.ts`
Expected: PASS (6 tests total).

- [ ] **Step 5: Commit.**

```bash
git add src/lib/stats-qa/narrative.ts src/lib/stats-qa/__tests__/narrative.test.ts
git commit -m "feat(stats-qa): cached AI narrative (fail-safe)"
```

---

## Task 8: Orchestrator + web API route

**Files:**
- Create: `src/lib/stats-qa/index.ts`
- Create: `src/app/api/history/ask/route.ts`

- [ ] **Step 1: Write the orchestrator.** Create `src/lib/stats-qa/index.ts`:

```ts
import { getQuestion, REGISTRY } from './registry';
import { getNarrative, getDataVersion } from './narrative';
import type { ResolveCtx, StatAnswer } from './types';

export { REGISTRY };
export type { StatAnswer };

export interface AnsweredCard extends StatAnswer { id: string; titleHe: string; cardType: string; narrative: string | null }

export async function answerQuestion(id: string, ctx: ResolveCtx): Promise<AnsweredCard | null> {
  const q = getQuestion(id);
  if (!q) return null;
  const answer = await q.resolve(ctx);
  const questionKey = [id, ctx.clubKey, ctx.rivalKey].filter(Boolean).join(':');
  const dataVersion = await getDataVersion();
  const titleHe = q.titleHe(ctx);
  const narrative = await getNarrative(questionKey, dataVersion, titleHe, answer);
  return { ...answer, id, titleHe, cardType: q.cardType, narrative };
}

/** Registry metadata for building the chip UI (no resolution). */
export function listQuestions() {
  return REGISTRY.map((q) => ({ id: q.id, scope: q.scope, cardType: q.cardType, needsClub: q.needsClub, needsRival: !!q.needsRival, titleHe: q.titleHe({}) }));
}
```

- [ ] **Step 2: Write the API route.** Create `src/app/api/history/ask/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion, listQuestions } from '@/lib/stats-qa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get('q');
  if (!id) return NextResponse.json({ questions: listQuestions() });
  const clubKey = sp.get('club') ?? undefined;
  const rivalKey = sp.get('rival') ?? undefined;
  const card = await answerQuestion(id, { clubKey, rivalKey });
  if (!card) return NextResponse.json({ error: 'unknown question' }, { status: 404 });
  return NextResponse.json({ card });
}
```

- [ ] **Step 3: Smoke-test the route locally.**

Run: `npm run dev -- --port 8011` then in another shell:
`curl -s 'http://localhost:8011/api/history/ask' | head -c 300`
`curl -s 'http://localhost:8011/api/history/ask?q=league_most_titles' | head -c 300`
Expected: first returns a `questions` array; second returns a `card` with a `headline` (or `headline:null` if records not built locally).

- [ ] **Step 4: Commit.**

```bash
git add src/lib/stats-qa/index.ts src/app/api/history/ask/route.ts
git commit -m "feat(stats-qa): orchestrator + web /api/history/ask route"
```

---

## Task 9: Web card component + page + client

**Files:**
- Create: `src/components/StatAnswerCard.tsx`
- Create: `src/components/StatAskClient.tsx`
- Create: `src/app/history/ask/page.tsx`

- [ ] **Step 1: Build `StatAnswerCard`.** Create `src/components/StatAnswerCard.tsx`:

```tsx
import Link from 'next/link';
import type { AnsweredCard } from '@/lib/stats-qa';

export function StatAnswerCard({ card }: { card: AnsweredCard }) {
  if (!card.headline) {
    return <div className="rounded-xl border border-stone-200 bg-white p-4 text-center text-sm text-stone-400">אין מספיק נתונים לשאלה זו</div>;
  }
  const max = Math.max(1, ...(card.series ?? []).map((s) => s.value));
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" dir="rtl">
      <div className="text-xs text-stone-400">{card.titleHe}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-black text-stone-900">{card.headline.label}</span>
        <span className="text-2xl font-black text-red-800">{card.headline.value}</span>
        {card.headline.unit && <span className="text-xs text-stone-500">{card.headline.unit}</span>}
      </div>
      {card.secondary && <div className="mt-1 text-xs text-stone-600">{card.secondary}</div>}
      {card.cardType === 'bar' && card.series && (
        <div className="mt-2 flex h-10 items-end gap-1">
          {card.series.map((s, i) => <div key={i} title={`${s.label}: ${s.value}`} className="flex-1 rounded-t bg-red-700" style={{ height: `${Math.round((s.value / max) * 100)}%` }} />)}
        </div>
      )}
      {card.cardType === 'leaderboard' && card.top && (
        <ol className="mt-2 space-y-1 text-sm">
          {card.top.map((t, i) => (
            <li key={i} className="flex justify-between">
              <span className="text-stone-700">{i + 1}. {t.href ? <Link href={t.href} className="hover:text-red-800">{t.name}</Link> : t.name}</span>
              <span className="font-bold text-stone-900">{t.value}</span>
            </li>
          ))}
        </ol>
      )}
      {card.narrative && <div className="mt-2 text-[11.5px] italic text-stone-600">"{card.narrative}"</div>}
      {card.coverageNote && <div className="mt-1 text-[10px] text-stone-400">{card.coverageNote}</div>}
      {card.href && <Link href={card.href} className="mt-2 inline-block text-xs font-bold text-red-800">לפרטים ←</Link>}
    </div>
  );
}
```

- [ ] **Step 2: Build the client** (chips + club/rival selectors + fetch). Create `src/components/StatAskClient.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { StatAnswerCard } from './StatAnswerCard';
import type { AnsweredCard } from '@/lib/stats-qa';

type Q = { id: string; scope: 'club' | 'league'; needsClub: boolean; needsRival: boolean; titleHe: string };
type Club = { clubKey: string; nameHe: string };

export function StatAskClient({ questions, clubs }: { questions: Q[]; clubs: Club[] }) {
  const [clubKey, setClubKey] = useState(clubs[0]?.clubKey ?? '');
  const [card, setCard] = useState<AnsweredCard | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(q: Q) {
    setLoading(true); setCard(null);
    const params = new URLSearchParams({ q: q.id });
    if (q.needsClub) params.set('club', clubKey);
    if (q.needsRival) { const rival = clubs.find((c) => c.clubKey !== clubKey); if (rival) params.set('rival', rival.clubKey); }
    const res = await fetch(`/api/history/ask?${params}`);
    const json = await res.json();
    setCard(json.card ?? null); setLoading(false);
  }

  const chip = (q: Q) => (
    <button key={q.id} onClick={() => ask(q)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 shadow-sm hover:border-red-300">{q.titleHe}</button>
  );

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-400">שאל כל דבר על 26 שנות כדורגל… (בקרוב)</div>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-black text-stone-900">על הקבוצה</h2>
          <select value={clubKey} onChange={(e) => setClubKey(e.target.value)} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-red-800">
            {clubs.map((c) => <option key={c.clubKey} value={c.clubKey}>{c.nameHe}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">{questions.filter((q) => q.scope === 'club').map(chip)}</div>
      </section>
      <section>
        <h2 className="mb-2 text-base font-black text-stone-900">בכל הליגה</h2>
        <div className="flex flex-wrap gap-2">{questions.filter((q) => q.scope === 'league').map(chip)}</div>
      </section>
      {loading && <div className="text-sm text-stone-400">טוען…</div>}
      {card && <StatAnswerCard card={card} />}
    </div>
  );
}
```

- [ ] **Step 3: Build the page** (Server Component: load questions + current clubs). Create `src/app/history/ask/page.tsx`:

```tsx
import { listQuestions } from '@/lib/stats-qa';
import { getCurrentLeagueClubFamilies } from '@/lib/history/club-identity';
import { StatAskClient } from '@/components/StatAskClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'שיאים ותשובות | StatsAI' };

export default async function AskPage() {
  const families = await getCurrentLeagueClubFamilies();
  const hbsFirst = [...families].sort((a, b) => (a.clubKey === 'api-563' ? -1 : b.clubKey === 'api-563' ? 1 : 0));
  const clubs = hbsFirst.map((f) => ({ clubKey: f.clubKey, nameHe: f.nameHe }));
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-black text-stone-900" dir="rtl">שיאים ותשובות</h1>
      <StatAskClient questions={listQuestions()} clubs={clubs} />
    </main>
  );
}
```

> Confirm `api-563` is HBS's real clubKey (grep prior session notes / `getClubFamily`). If HBS has no apiFootballId in the family, use the actual `name-<enc>` key. Default-sort is cosmetic; safe if the key is wrong.

- [ ] **Step 4: Verify build + visit.**

Run: `npm run build` (expect success), then `npm run dev -- --port 8011` and open `http://localhost:8011/history/ask`.
Expected: chips render in two sections, club selector lists current clubs, tapping a chip shows a card (or the empty-state if records aren't built locally).

- [ ] **Step 5: Commit.**

```bash
git add src/components/StatAnswerCard.tsx src/components/StatAskClient.tsx src/app/history/ask/page.tsx
git commit -m "feat(stats-qa): web /history/ask page + answer card"
```

---

## Task 10: Nav link + home teaser

**Files:**
- Modify: the History nav component (find it: `grep -rl "/history" src/components src/app | grep -i nav`; the roadmap notes "Navbar היסטוריה → /history")
- Create: `src/components/HomeStatTeaser.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add the nav link.** In the History navigation/menu component, add an entry linking to `/history/ask` labeled `שיאים ותשובות` next to the existing היסטוריה links. (Match the surrounding link markup exactly.)

- [ ] **Step 2: Build the teaser.** Create `src/components/HomeStatTeaser.tsx`:

```tsx
import Link from 'next/link';
import { answerQuestion } from '@/lib/stats-qa';

// Server component: renders one preselected question card as a home teaser.
export async function HomeStatTeaser({ id = 'club_top_scorer', clubKey = 'api-563' }: { id?: string; clubKey?: string }) {
  const card = await answerQuestion(id, { clubKey });
  if (!card?.headline) return null;
  return (
    <Link href="/history/ask" className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:bg-stone-50" dir="rtl">
      <div className="text-xs text-stone-400">שיאים ותשובות · {card.titleHe}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-black text-stone-900">{card.headline.label}</span>
        <span className="text-xl font-black text-red-800">{card.headline.value}</span>
      </div>
      <div className="mt-1 text-xs font-bold text-red-800">שאל עוד ←</div>
    </Link>
  );
}
```

- [ ] **Step 3: Mount on home.** In `src/app/page.tsx`, import and render `<HomeStatTeaser />` in a sensible slot (near the last-game / news cards). Keep it inside the existing RTL layout.

- [ ] **Step 4: Build + visit home.**

Run: `npm run build && npm run dev -- --port 8011`; open `http://localhost:8011/`.
Expected: teaser card appears and links to `/history/ask`; nav shows the new link.

- [ ] **Step 5: Commit.**

```bash
git add src/components/HomeStatTeaser.tsx src/app/page.tsx <nav-file>
git commit -m "feat(stats-qa): history nav link + home teaser"
```

---

## Task 11: Shared payload types + mobile API route

**Files:**
- Modify: `shared/types/mobile-api.ts`
- Create: `src/app/api/mobile/v1/history/ask/route.ts`

- [ ] **Step 1: Add payload types.** Append to `shared/types/mobile-api.ts` (mirror the JSON-safe pattern of the existing history payloads):

```ts
export interface StatAnswerApi {
  id: string;
  titleHe: string;
  cardType: 'hero' | 'bar' | 'leaderboard';
  headline: { label: string; value: string; unit?: string } | null;
  secondary?: string;
  series?: { label: string; value: number }[];
  top?: { name: string; value: string; href?: string }[];
  href?: string;
  coverageNote?: string;
  narrative: string | null;
}
export interface StatQuestionApi { id: string; scope: 'club' | 'league'; cardType: 'hero' | 'bar' | 'leaderboard'; needsClub: boolean; needsRival: boolean; titleHe: string }
export interface StatQuestionsPayload { questions: StatQuestionApi[]; clubs: { clubKey: string; nameHe: string }[] }
export interface StatAnswerPayload { card: StatAnswerApi | null }
```

- [ ] **Step 2: Build the mobile route.** Create `src/app/api/mobile/v1/history/ask/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion, listQuestions } from '@/lib/stats-qa';
import { getCurrentLeagueClubFamilies } from '@/lib/history/club-identity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get('q');
  if (!id) {
    const clubs = (await getCurrentLeagueClubFamilies()).map((f) => ({ clubKey: f.clubKey, nameHe: f.nameHe }));
    return NextResponse.json({ questions: listQuestions(), clubs });
  }
  const card = await answerQuestion(id, { clubKey: sp.get('club') ?? undefined, rivalKey: sp.get('rival') ?? undefined });
  return NextResponse.json({ card });
}
```

- [ ] **Step 3: Typecheck.**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit.**

```bash
git add shared/types/mobile-api.ts src/app/api/mobile/v1/history/ask/route.ts
git commit -m "feat(stats-qa): shared payload types + mobile api route"
```

---

## Task 12: Mobile hooks + screen + card

**Files:**
- Create: `mobile/hooks/useStatQuestions.ts`, `mobile/hooks/useStatAnswer.ts`
- Create: `mobile/design-system/StatAnswerCard.tsx`
- Create: `mobile/app/history/ask.tsx`
- Test: `mobile/hooks/__tests__/useStatAnswer.test.ts`

- [ ] **Step 1: Write the hooks** (mirror `mobile/hooks/useAllTimeTable.ts`). Create `mobile/hooks/useStatQuestions.ts`:

```ts
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StatQuestionsPayload } from '@shared/types/mobile-api';

export function useStatQuestions() {
  return useQuery<StatQuestionsPayload>({
    queryKey: ['history', 'ask', 'questions'],
    queryFn: () => apiClient.get<StatQuestionsPayload>('/history/ask'),
    staleTime: 60 * 60_000, placeholderData: keepPreviousData,
  });
}
```

Create `mobile/hooks/useStatAnswer.ts`:

```ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { StatAnswerPayload } from '@shared/types/mobile-api';

export function useStatAnswer(id: string | null, clubKey?: string, rivalKey?: string) {
  return useQuery<StatAnswerPayload>({
    queryKey: ['history', 'ask', id, clubKey, rivalKey],
    enabled: !!id,
    queryFn: () => {
      const p = new URLSearchParams({ q: id! });
      if (clubKey) p.set('club', clubKey);
      if (rivalKey) p.set('rival', rivalKey);
      return apiClient.get<StatAnswerPayload>(`/history/ask?${p.toString()}`);
    },
    staleTime: 60 * 60_000,
  });
}
```

- [ ] **Step 2: Write a failing hook test.** Create `mobile/hooks/__tests__/useStatAnswer.test.ts` (follow the MSW pattern used by the existing hook tests — mock `GET /history/ask` returning `{ card: {...} }`, assert `result.current.data.card.headline.value`). Use the same `renderHook` + `QueryClientProvider` wrapper as `mobile/hooks/__tests__` siblings.

- [ ] **Step 3: Run — expect FAIL, then PASS after MSW handler added.**

Run: `cd mobile && npm test -- useStatAnswer`
Expected: PASS once the handler + wrapper are in place.

- [ ] **Step 4: Build the mobile card** (mirror `mobile/design-system/SofascoreMatchStatsPanel.tsx` styling + `useTheme`/`rtlRow`). Create `mobile/design-system/StatAnswerCard.tsx` — render headline (label + value + unit), optional `secondary`, `top` list (leaderboard), a simple bar row for `series`, `narrative` in italic, `coverageNote` small, and a Pressable "לפרטים" that routes via `expo-router` when `href` maps to an app route (`/players/:id`, `/games/:id`, `/teams/:id`, `/history/...`). Empty state (`headline===null`) → "אין מספיק נתונים".

- [ ] **Step 5: Build the screen** (mirror `mobile/app/history/all-time.tsx`). Create `mobile/app/history/ask.tsx`: `useStatQuestions()` for chips + club picker (default first club, i.e. HBS via server sort), local `selectedId`+`clubKey` state, `useStatAnswer(...)` for the card, `Header`/`BottomNav`/`ScrollView`+`RefreshControl`, RTL. Chips are `Pressable` pills; tapping sets `selectedId`.

- [ ] **Step 6: Typecheck + test.**

Run: `cd mobile && npx tsc --noEmit && npm test`
Expected: no type errors; all mobile tests pass.

- [ ] **Step 7: Commit.**

```bash
git add mobile/hooks/useStatQuestions.ts mobile/hooks/useStatAnswer.ts mobile/hooks/__tests__/useStatAnswer.test.ts mobile/design-system/StatAnswerCard.tsx mobile/app/history/ask.tsx
git commit -m "feat(stats-qa): mobile ask screen, hooks, card"
```

---

## Task 13: rebuild-records dataVersion bump + pre-warm

**Files:**
- Modify: `scripts/rebuild-records.ts`
- Create: `scripts/prewarm-stat-narratives.ts` (optional pre-warm, invoked from the same run)

- [ ] **Step 1: Bump dataVersion after rebuild.** In `scripts/rebuild-records.ts` `main()`, after `await rebuildAllRecords()`, upsert the `SiteSetting` version (use a timestamp string). Because the script runs via `tsx` (no `@/*` alias), import prisma with a RELATIVE path (mirror the existing `../src/lib/history/records-engine` import):

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
// ...after rebuildAllRecords():
const version = new Date().toISOString();
await prisma.siteSetting.upsert({
  where: { key: 'stat_data_version' },
  update: { value: version },
  create: { key: 'stat_data_version', value: version },
});
console.log('bumped stat_data_version =', version);
await prisma.$disconnect();
```

> Confirm `SiteSetting` field names (`key`/`value`) against schema; adjust if different. `new Date()` is fine here (plain node script, not a Workflow).

- [ ] **Step 2: Pre-warm HBS + league narratives (optional but recommended).** Create `scripts/prewarm-stat-narratives.ts` that loads env (mirror rebuild-records' `loadEnv`), imports `answerQuestion` + `REGISTRY` (relative paths), and calls `answerQuestion` for every league question and every club question with `clubKey='api-563'`. Each call populates the `StatNarrative` cache as a side effect. Invoke it at the end of `rebuild-records`'s `main()` via `spawnSync('npx', ['tsx', 'scripts/prewarm-stat-narratives.ts'], { stdio: 'inherit' })`, or document it as a separate cron line.

- [ ] **Step 3: Local dry run.**

Run: `npx tsx scripts/rebuild-records.ts`
Expected: logs the record counts, then `bumped stat_data_version = <iso>`. Verify: `psql`-free check via a node one-liner or Prisma Studio that `stat_narratives` gains rows after pre-warm.

- [ ] **Step 4: Commit.**

```bash
git add scripts/rebuild-records.ts scripts/prewarm-stat-narratives.ts
git commit -m "feat(stats-qa): bump data version + prewarm narratives on nightly rebuild"
```

---

## Task 14: Version bump + full verification

**Files:**
- Modify: `src/lib/version.ts`, `package.json`

- [ ] **Step 1: Bump version** (patch, e.g. `0.20.x` → next) in both `src/lib/version.ts` (`APP_VERSION`) and `package.json` (`version`) to the same value.

- [ ] **Step 2: Run the full backend + mobile suites.**

Run: `npm test` (root) and `cd mobile && npm test`
Expected: all green (including the new stats-qa tests).

- [ ] **Step 3: Production build.**

Run: `npm run build`
Expected: success (no type errors, page + routes compile).

- [ ] **Step 4: Commit + note deploy steps.**

```bash
git add src/lib/version.ts package.json
git commit -m "chore: v<version> — stat-answer cards"
```

Deploy (per CLAUDE.md): `git pull && npm install && npx prisma db push --accept-data-loss && npx prisma generate && npm run build && pm2 restart hbstats`. The `db push` is REQUIRED (new `StatNarrative` table).

---

## Self-Review (completed during authoring)

- **Spec coverage:** input=chips (Task 9 client; free-text box shown disabled) ✓; deterministic numbers (Tasks 3–6) ✓; cached AI narrative fail-safe (Task 7) ✓; club(default HBS)+league scope (Task 6 registry + Task 9 page sort) ✓; `/history/ask` web + mobile + home teaser (Tasks 9,10,12) ✓; rich card hero/bar/leaderboard (Task 9 + 12) ✓; registry architecture + StatNarrative table (Tasks 1,6) ✓; rebuild hook + pre-warm (Task 13) ✓; testing (per-resolver, registry-integrity, narrative-cache, mobile hook) ✓; edge cases (empty-state, coverageNote, narrative failure→null) ✓.
- **Catalog deviation from spec** (event-based records are league-only → youngest-scorer/most-goals-in-game moved to league) is documented at the top and reflected in Task 6.
- **Placeholders:** none — every code step has real code. Two spec-derived UI polish items are intentionally described rather than coded because they depend on reading the exact surrounding markup (nav link markup in Task 10 Step 1; mobile card/screen JSX in Task 12 Steps 4–5, which must mirror existing design-system components) — each names the exact file to mirror.
- **Type consistency:** `StatAnswer`/`AnsweredCard`/`StatAnswerApi` fields align across resolver → orchestrator → route → card; `recordResolver(category,'hero',link)` signature matches all call sites in the registry; `getNarrative(questionKey,dataVersion,titleHe,answer)` matches the orchestrator call.

## Verification-before-completion gates (per task, non-negotiable)

Before checking off any task's final commit: run that task's test command and paste the actual PASS/FAIL output; do not claim green without it. Before Task 14's "done", `npm run build` + both test suites must be observed green.
