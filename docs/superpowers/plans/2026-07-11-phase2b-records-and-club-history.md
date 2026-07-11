# Phase 2B — Records, Honors & Club History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the second half of the Records & History flagship: the materialized record books, club honors (league titles + cup wins back to 1945), the club "היסטוריה" tab (web + mobile), cup honor rolls, and the `/history` hub.

**Architecture:** One new schema model (`RecordEntry`, materialized nightly by a script + admin trigger — pages read instantly); honors computed live in `src/lib/history/club-honors.ts` (1h cache, invalidated with the siblings); club History tab = new query-param tab on the web team page reusing already-computed data (`TeamPositionHistory`, coach-timeline) + new honors/records/squads blocks; mobile gets the same via `useTeamExtras` additions. **Deploy requires `prisma db push`** (RecordEntry) and a nightly cron (owner-authorized).

**Tech Stack:** unchanged (TS5, Prisma 5, Jest under `src/**/__tests__`, Next 14, Expo OTA).

**Verified recon facts this plan relies on:**
- Web team page (`src/app/teams/[id]/page.tsx`, 1405 lines): tabs are query-param driven, `TeamPremierTab` union at line ~24, normalizer at ~1394, tab-link array at ~530, sections gated by `{displayMode !== 'premier' || selectedTab === 'X' ? … : null}`. Already computes `allTimeTeamIds` (~239), `positionRows` + `<TeamPositionHistory>` (~265/553), coach chart. Competition consts `comp_liga_haal`/`comp_liga_leumit` at top.
- Mobile team screen: NO tabs — stacked `<Section>`s fed by `useTeam`/`useTeamExtras` hooks; history content = more sections in `extras`.
- Cup finals in `games`: strict finals detection MUST use `/^finals?$/i` on `TRIM(roundNameEn)` (loose `contains 'Final'` matches Semi-finals/8th Finals/5th Place Final — verified ~124 false positives). Post-merge coverage: State Cup finals 1945+ (46), Toto finals 2019+ (7), Super Cup 2015+ (8). Games table: league games since 1951; events/lineups 2006+ (event-based records get the "מ-2006" footnote).
- League champions per season: **reuse `getSeasonsSpine()`** (`src/lib/history/seasons-spine.ts`) — playoff-aware, honors stored positions pre-2000; do NOT re-derive champions.
- Club families: `getClubFamilies()/getClubFamily()/getClubFamilyByTeamId()/getClubTeamIndex()` from `src/lib/history/club-identity.ts`; clubKey stable (`api-<id>`/`name-<enc>`). **Next App Router passes dynamic params RAW (percent-encoded) — never `decodeURIComponent` them.**
- `GameEvent`: `{minute, extraMinute?, type (GOAL|PENALTY_GOAL|OWN_GOAL|…), playerId?, gameId, teamId?}`, indexes on gameId/playerId. `Player.birthDate DateTime?`. `Game`: `homeTeamId/awayTeamId/homeScore/awayScore/dateTime/competitionId/status/roundNameEn`; penalty shootout fields — CHECK the Game model for `penalty*` fields before deriving final winners; if a final's 90-min score is a draw and no penalty fields exist, exclude it from honors with a counted log (never guess a winner).
- Cache-invalidation convention: merge-engine execute/rollback exits call `clearSpineCache/clearAllTimeCache/clearClubCache/clearH2HCache` — new honors cache joins that list.
- Player-career layered totals (spec §5.4) are **explicitly deferred** to a polish batch — not in 2B.

---

### Task 1: RecordEntry schema + records engine + rebuild script

**Files:**
- Modify: `prisma/schema.prisma` (add model)
- Create: `src/lib/history/records-engine.ts` (pure computation, testable)
- Create: `scripts/rebuild-records.js` (thin runner)
- Create: `src/app/api/admin/rebuild-records/route.ts` (admin trigger)
- Test: `src/lib/__tests__/records-engine.test.ts`

- [ ] **Step 1.1: Schema**

Append to `prisma/schema.prisma`:

```prisma
model RecordEntry {
  id         String   @id @default(cuid())
  category   String   // e.g. "biggest_win", "fastest_goal" — see records-engine CATEGORIES
  scope      String   // "league" | "club:<clubKey>"
  rank       Int
  valueNum   Float?   // sortable magnitude (margin, minute, count…)
  labelHe    String   // display line, superlative-framed
  detailHe   String?  // secondary line (date · competition · opponent)
  clubKey    String?
  playerId   String?
  gameId     String?
  seasonYear Int?
  computedAt DateTime @default(now())

  @@unique([category, scope, rank])
  @@index([scope, category])
  @@map("record_entries")
}
```

Run `npx prisma db push && npx prisma generate` (dev DB). Commit schema alone: `feat(records): RecordEntry model`.

- [ ] **Step 1.2: Failing tests for the pure engine**

The engine separates **computation** (pure functions over plain rows — unit-testable) from **loading** (prisma queries) and **writing** (delete+createMany per category/scope). Create `src/lib/__tests__/records-engine.test.ts` testing the pure parts:

```ts
import {
  computeBiggestWins,
  computeStreaks,
  computeFastestGoals,
  computePlayerGameGoals,
  computeAgeExtremes,
  type EngineGame,
  type EngineGoalEvent,
} from '@/lib/history/records-engine';

const g = (id: string, home: string, away: string, hs: number, as: number, iso: string): EngineGame => ({
  id, homeClubKey: home, awayClubKey: away, homeScore: hs, awayScore: as,
  dateTime: new Date(iso), homeName: home, awayName: away, competitionNameHe: 'ליגת העל',
});

describe('computeBiggestWins', () => {
  it('ranks by margin, tie-break more total goals then earlier date', () => {
    const rows = computeBiggestWins([
      g('g1', 'A', 'B', 5, 0, '2010-01-01'),  // margin 5, total 5
      g('g2', 'C', 'D', 6, 1, '2005-01-01'),  // margin 5, total 7 → above g1
      g('g3', 'A', 'C', 3, 0, '2015-01-01'),
    ], 10);
    expect(rows.map((r) => r.gameId)).toEqual(['g2', 'g1', 'g3']);
    expect(rows[0].valueNum).toBe(5);
    expect(rows[0].labelHe).toContain('6–1');
    expect(rows[0].winnerClubKey).toBe('C');
  });
});

describe('computeStreaks', () => {
  // A: W W W L W W → longest win streak 3, unbeaten 3
  const games = [
    g('s1', 'A', 'B', 2, 0, '2010-01-01'),
    g('s2', 'B', 'A', 0, 1, '2010-02-01'),
    g('s3', 'A', 'C', 1, 0, '2010-03-01'),
    g('s4', 'C', 'A', 2, 0, '2010-04-01'),
    g('s5', 'A', 'B', 1, 0, '2010-05-01'),
    g('s6', 'A', 'C', 2, 2, '2010-06-01'),
  ];
  it('computes longest win streak per club', () => {
    const wins = computeStreaks(games, 'win', 10);
    const a = wins.find((r) => r.clubKey === 'A')!;
    expect(a.valueNum).toBe(3);
    expect(a.startISO).toBe('2010-01-01');
  });
  it('computes unbeaten streak (draws extend it)', () => {
    const unbeaten = computeStreaks(games, 'unbeaten', 10);
    const a = unbeaten.find((r) => r.clubKey === 'A')!;
    expect(a.valueNum).toBe(3); // s5 W, s6 D continue after the s4 loss → streak s5..s6 = 2; earlier s1..s3 = 3
  });
});

describe('computeFastestGoals', () => {
  const ev = (id: string, minute: number, extra: number | null, player: string): EngineGoalEvent => ({
    eventId: id, gameId: 'g1', minute, extraMinute: extra, playerId: player, playerNameHe: player,
    playerBirthDate: null, gameDateISO: '2015-05-01', homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל',
  });
  it('ranks ascending by minute, ignores extra-time markers', () => {
    const rows = computeFastestGoals([ev('e1', 3, null, 'p1'), ev('e2', 1, null, 'p2'), ev('e3', 45, 2, 'p3')], 5);
    expect(rows[0].playerId).toBe('p2');
    expect(rows[0].valueNum).toBe(1);
  });
});

describe('computePlayerGameGoals', () => {
  it('finds most goals by one player in one game (hat-trick+)', () => {
    const mk = (p: string, n: number, game: string) =>
      Array.from({ length: n }, (_, i) => ({
        eventId: `${p}-${game}-${i}`, gameId: game, minute: 10 + i, extraMinute: null,
        playerId: p, playerNameHe: p, playerBirthDate: null, gameDateISO: '2018-03-03',
        homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל',
      }));
    const rows = computePlayerGameGoals([...mk('p1', 4, 'g1'), ...mk('p2', 3, 'g2'), ...mk('p1', 2, 'g3')], 5);
    expect(rows[0]).toMatchObject({ playerId: 'p1', gameId: 'g1', valueNum: 4 });
    expect(rows).toHaveLength(2); // only 3+ (hat-trick threshold)
  });
});

describe('computeAgeExtremes', () => {
  it('youngest scorer computed from birthDate vs game date', () => {
    const rows = computeAgeExtremes([
      { eventId: 'e1', gameId: 'g1', minute: 10, extraMinute: null, playerId: 'p1', playerNameHe: 'צעיר',
        playerBirthDate: new Date('2008-01-01'), gameDateISO: '2024-06-01', homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל' },
      { eventId: 'e2', gameId: 'g2', minute: 10, extraMinute: null, playerId: 'p2', playerNameHe: 'מבוגר',
        playerBirthDate: new Date('1990-01-01'), gameDateISO: '2024-06-01', homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל' },
    ], 'youngest', 5);
    expect(rows[0].playerId).toBe('p1');
    expect(rows[0].labelHe).toContain('צעיר');
  });
});
```

Run → FAIL (module not found).

- [ ] **Step 1.3: Implement `src/lib/history/records-engine.ts`**

Structure (implementer writes bodies to make the tests pass; keep every compute function pure):

```ts
// Types
export interface EngineGame {
  id: string; homeClubKey: string; awayClubKey: string;
  homeScore: number; awayScore: number; dateTime: Date;
  homeName: string; awayName: string; competitionNameHe: string;
}
export interface EngineGoalEvent {
  eventId: string; gameId: string; minute: number; extraMinute: number | null;
  playerId: string; playerNameHe: string; playerBirthDate: Date | null;
  gameDateISO: string; homeName: string; awayName: string; competitionNameHe: string;
}
export interface ComputedRecord {
  valueNum: number; labelHe: string; detailHe: string | null;
  clubKey?: string | null; winnerClubKey?: string | null; playerId?: string | null;
  gameId?: string | null; seasonYear?: number | null; startISO?: string;
}

// Pure computations (unit-tested):
export function computeBiggestWins(games: EngineGame[], top: number): ComputedRecord[]
export function computeStreaks(games: EngineGame[], kind: 'win' | 'unbeaten' | 'scoring', top: number): ComputedRecord[]
export function computeFastestGoals(events: EngineGoalEvent[], top: number): ComputedRecord[]
export function computePlayerGameGoals(events: EngineGoalEvent[], top: number): ComputedRecord[]  // 3+ only
export function computeAgeExtremes(events: EngineGoalEvent[], kind: 'youngest' | 'oldest', top: number): ComputedRecord[]

// Orchestrator (prisma-facing; NOT unit-tested — validated by the dev-DB probe):
export const RECORD_CATEGORIES: Array<{ key: string; titleHe: string; eventBased: boolean }>
export async function rebuildAllRecords(): Promise<{ written: number; byCategory: Record<string, number> }>
```

Category set v1 (league scope top-10 + per-club top-5 where marked):
| key | source | scopes |
|---|---|---|
| `biggest_win` | games | league + club |
| `highest_scoring_game` | games | league |
| `longest_win_streak` | games (league only, chronological per club) | league + club |
| `longest_unbeaten_streak` | games | league + club |
| `longest_scoring_streak` | games | league + club |
| `fastest_goal` | events (GOAL/PENALTY_GOAL, not OWN_GOAL) | league |
| `most_goals_player_game` | events, 3+ threshold | league |
| `youngest_scorer` / `oldest_scorer` | events × birthDate | league |

Orchestrator loading: games = COMPLETED league (comp_liga_haal) games with both scores, joined to clubKeys via `getClubTeamIndex()` (skip games whose teams resolve to no family); events = GOAL/PENALTY_GOAL with playerId, joined to player {nameHe, birthDate} and game {dateTime, names, comp} — filter league games only. Streak computation: per clubKey, sort that club's games by dateTime, walk once. Label style: superlative Hebrew — `"מכבי תל אביב 9–0 הפועל חיפה"`, detail `"ליגת העל · 12.3.1955"`; streaks `"12 נצחונות רצופים"`, detail `"מ-3.9.2011 עד 14.4.2012"`; ages `"בן 16 ו-45 ימים"` (compute Y/D from dates). Writing: for each (category, scope) `deleteMany` then `createMany` inside one `prisma.$transaction` per category (bounded transactions, not one giant one). Event-based categories set `detailHe` suffix `" · נתוני אירועים מ-2006"` — NO, cleaner: the PAGE renders the footnote per category via `eventBased` flag; don't bake it into rows.

- [ ] **Step 1.4: Tests pass** (`npx jest src/lib/__tests__/records-engine.test.ts`) + `npx tsc --noEmit` clean.

- [ ] **Step 1.5: Rebuild script + admin route**

`scripts/rebuild-records.js`: self-loads .env (copy the notify-matches.js pattern), requires the COMPILED lib? No — scripts are plain JS; instead the script calls the API route OR uses tsx. Simplest reliable pattern: make it a tsx runner — `scripts/rebuild-records.ts` executed via `npx tsx scripts/rebuild-records.ts` importing `rebuildAllRecords()` directly (tsx resolves the @/ alias? NO — tsx doesn't know the alias. Use a RELATIVE import: `import { rebuildAllRecords } from '../src/lib/history/records-engine';` — verify tsx runs it against dev). Print the byCategory summary.
`src/app/api/admin/rebuild-records/route.ts`: POST, `getRequestUser` + role==='ADMIN' guard (copy `src/app/api/players/sidelined/route.ts`'s guard style), calls `rebuildAllRecords()`, returns the summary. (The nightly cron will call the script via crontab — documented in the release task.)

- [ ] **Step 1.6: Dev-DB probe** — run `npx tsx scripts/rebuild-records.ts` against dev; report byCategory counts; spot-check: biggest league win label is a real historic thrashing; fastest goal minute sane (1'); youngest scorer age plausible (16-17). Commit: `feat(records): records engine, rebuild script, admin trigger`.

---

### Task 2: Club honors service + cup honor rolls

**Files:**
- Create: `src/lib/history/club-honors.ts`
- Test: `src/lib/__tests__/club-honors.test.ts`
- Modify: `src/lib/history/seasons-spine.ts` (add `cupWinner` column via finals map)
- Modify: `src/lib/merge-engine.ts` (invalidation: `clearHonorsCache`)
- Create: `src/app/history/cups/page.tsx`
- Modify: `src/app/history/all-time/page.tsx` (coverage note 2000→1951)
- Mobile: `src/app/api/mobile/v1/history/cups/route.ts`, `mobile/app/history/cups.tsx`, `mobile/hooks/useCupHonors.ts`, shared types, link from seasons screen

- [ ] **Step 2.1: Failing tests** — `club-honors.test.ts` (mock prisma + seasons-spine + club-identity):
Cases: (a) league titles counted per club family from spine champions (mock getSeasonsSpine → champions across seasons; assert `titles.league` counts + years list); (b) cup winner derived from a strict final (home 2-1 → home family wins; assert winner clubKey + year); (c) drawn final WITHOUT penalty data is excluded and counted in `skippedDraws`; (d) drawn final WITH penalty fields resolves by them (adapt to the real Game penalty field names found in schema — if none exist, drop case (d) and note it).

- [ ] **Step 2.2: Implement `club-honors.ts`:**

```ts
export interface ClubHonors {
  clubKey: string; nameHe: string; logoUrl: string | null;
  leagueTitles: { count: number; years: number[] };
  stateCup: { count: number; years: number[] };
  totoCup: { count: number; years: number[] };
  superCup: { count: number; years: number[] };
}
export interface CupFinalRow {
  seasonYear: number; competitionNameHe: string; gameId: string;
  winner: { clubKey: string; nameHe: string } | null;  // null = undecidable draw
  loser: { clubKey: string; nameHe: string } | null;
  scoreLabel: string; // "2–1" or "1–1 (5–4 בפנדלים)"
}
export async function getClubHonors(clubKey: string): Promise<ClubHonors | null>
export async function getAllHonors(): Promise<ClubHonors[]>          // for honor-roll aggregates
export async function getCupFinals(): Promise<CupFinalRow[]>          // newest first, all cups
export function clearHonorsCache(): void
```
League titles from `getSeasonsSpine()` champions (family-resolve each champion teamId via `getClubTeamIndex()`). Cup finals: query games `TRIM(roundNameEn) ~ '^[Ff]inals?$'` equivalent via prisma (`roundNameEn: { in: ['Final','Finals','final'] }` is brittle — use raw SQL with the regex, mirroring on-this-day's strict approach) joined to competition (apiFootballId in 384/385/659 + the toto-leumit) and teams. Winner by score; draws → penalty fields if the Game model has them, else null-winner + skip count. 1h cache + `clearHonorsCache` wired at merge-engine exits (both), beside the existing clears.

- [ ] **Step 2.3: Spine cup column** — `SeasonSpineRow` gains `cupWinner: SpineTeamRef | null` (state-cup winner that season, from getCupFinals map by seasonYear); web spine page + mobile screen get a גביע המדינה column/line. Update spine tests (mock the finals source — refactor so the spine takes finals via an injectable/mocked prisma query like the rest).

- [ ] **Step 2.4: Web `/history/cups`** — honor-roll page: top section "טבלת זוכים" (clubs ranked by state-cup count, chips with counts+years tooltip), then the full finals table (year, cup, winner bold, score, loser, → game link), footnote for excluded draws when any. Metadata Hebrew. Coverage: since 1945. Also fix the all-time page's coverage note: `בית/חוץ מחושב ממשחקים — זמין מ-1951 ואילך`.

- [ ] **Step 2.5: Mobile** — route (GET → `{ honors: ClubHonorsApi[], finals: CupFinalApi[] }`), shared types, hook, screen (honor chips + finals list, rows → game pages), link from the seasons screen row (⚔️/🏆 group).

- [ ] **Step 2.6: Verify + commit** — unit tests, full suites, both tsc; dev probe: honors for api-604 (expect ~23-25 league titles for מכבי ת"א incl. pre-2000), cup finals list spans 1945+. Commit: `feat(history): club honors + cup honor rolls (1945+)`.

---

### Task 3: Records pages + /history hub

**Files:**
- Create: `src/app/history/records/page.tsx`
- Create: `src/app/history/page.tsx` (hub)
- Mobile: `src/app/api/mobile/v1/history/records/route.ts`, `mobile/app/history/records.tsx`, `mobile/hooks/useRecords.ts`, shared types, seasons-screen link
- Modify: `src/components/Navbar.tsx` (point the history nav at `/history`)

- [ ] **Step 3.1: Web records page** — `/history/records?cat=<key>`: category pill bar from `RECORD_CATEGORIES`, reads `RecordEntry` (`scope='league'`, category, rank asc), renders rank/label/detail rows, player/game links when ids present, `eventBased` categories get the "נתוני אירועים מ-2006 ואילך" footnote, `computedAt` shown as "עודכן: …". Empty-state when the table hasn't been built (message: הרצו rebuild מהאדמין).
- [ ] **Step 3.2: Hub `/history`** — cards grid: כל העונות, טבלת כל הזמנים, יריבויות, ספר השיאים, זוכי הגביעים — each with a one-line teaser stat pulled live (cheap: spine[0] champion, all-time leader, finals count, records computedAt). Update `Navbar.tsx`: find the nav item pointing at `/statistics/all-time` labeled היסטוריה (recon: it exists) and point it to `/history` instead (keep the statistics link reachable from the hub via a small "מלכי השערים לדורותיהם" card linking to `/statistics/all-time`).
- [ ] **Step 3.3: Mobile records screen** — route mirrors the web read (param `cat`), hook, screen with category chips + rows; seasons-screen link row gains ספר השיאים. Shared types.
- [ ] **Step 3.4: Verify + commit** — suites/tsc; if dev server available smoke `/history` + `/history/records`. Commit: `feat(history): record books pages + /history hub`.

---

### Task 4: Club History tab (web) + mobile history sections

**Files:**
- Modify: `src/app/teams/[id]/page.tsx` (tab union + normalizer + tab array + history sections)
- Modify: `src/lib/mobile-details-api.ts` (extras: honors + club records + squads)
- Modify: `mobile/app/teams/[id].tsx` (new sections)
- Modify: shared types

- [ ] **Step 4.1: Web tab** — add `'history'` to `TeamPremierTab` + normalizer + tab array (`{ id: 'history', label: 'היסטוריה' }`). New gated sections (render only when `selectedTab === 'history'`, premier mode):
  1. **מיקומים לאורך השנים** — MOVE the existing `<TeamPositionHistory>` section into the history tab (it currently renders in overview; keep a compact 10-season variant in overview if it's prominent there — implementer judges from the code, do not silently delete data from overview).
  2. **ארון הגביעים** — `getClubHonors(clubKeyByTeamId)` chips (league/state/toto/super counts + year lists).
  3. **שיאי המועדון** — `RecordEntry` scope=`club:<clubKey>` grouped by category (top 3 each).
  4. **סגלים היסטוריים** — season `<select>` (the club family's seasons, from `getClubFamilyByTeamId`) posting `?tab=history&squadSeason=<seasonId>`; renders that season's roster (`prisma.player.findMany({ where: { teamId: <family teamId for that season> } })`, jersey-ordered, names → player pages).
  5. **מאמנים לאורך השנים** — reuse the existing coach-timeline data already loaded on the page (move/duplicate the coach section into the tab as appropriate).
- [ ] **Step 4.2: Mobile** — `mobile-details-api.ts` extras gain `honors` (ClubHonorsApi) + `clubRecords` (top-3 per category) — types in shared; team screen renders two new Sections (ארון גביעים chips; שיאי המועדון rows) after the coach sections. Historical squads are web-only in 2B (mobile in a later batch — note it).
- [ ] **Step 4.3: Verify + commit** — suites/tsc both; manual dev check if server available: `/teams/<maccabi-tlv-id>?view=premier&tab=history`. Commit: `feat(teams): club history tab — positions, honors, records, squads, coaches`.

---

### Task 5: Release 2B (v0.19.0)

- [ ] **Step 5.1:** Full sweep (root+mobile tests, both tsc).
- [ ] **Step 5.2:** Bump `0.19.0` both files; commit; push (`egoziyaniv`).
- [ ] **Step 5.3:** Deploy WITH schema: `git pull && npm install && npx prisma db push --accept-data-loss && npx prisma generate && npm run build && pm2 restart hbstats`.
- [ ] **Step 5.4:** Prod: run `npx tsx scripts/rebuild-records.ts` (first build), verify byCategory counts; smoke `/history`, `/history/records`, `/history/cups`, a club history tab; verify honors: מכבי ת"א league titles ≥ 20, State Cup winners list starts 1945.
- [ ] **Step 5.5:** OTA (`eas update --branch production --platform ios`).
- [ ] **Step 5.6:** **Owner authorization:** nightly records rebuild crontab line: `30 4 * * * cd /home/hbs/hbstats && npx tsx scripts/rebuild-records.ts >> /home/hbs/logs/rebuild-records.log 2>&1` — present to owner together with the still-pending on-this-day + notify-news lines.
