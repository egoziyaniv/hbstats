# Match Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every official Hapoel Beer Sheva game, draft a numbered Hebrew analysis of that game and a preview of the next one from deterministic facts; the owner approves; published pieces show on the game page (web + mobile) and as a home teaser.

**Architecture:** Pure detector functions (`src/lib/match-analysis/detectors/*`) run over an in-memory club history and the complete-era top-flight games, each emitting `Fact`s with a rarity score. A ranker keeps the best 4–6; an AI call turns them into prose; a checker flags any number the prose invents. A job stores DRAFT `MatchAnalysis` rows (POST for the finished game, PRE for the next) and pushes admins. A cron route triggers the job ~2.5h after kickoff.

**Tech Stack:** Next.js (App Router), Prisma 5 / PostgreSQL, Jest + @swc/jest, OpenAI/Claude via `src/lib/ai-providers.ts`, Expo push via `src/lib/push.ts`, Expo mobile app (OTA).

Spec: `docs/superpowers/specs/2026-11-02-match-analysis-design.md`.

## Data facts the code relies on (verified on prod 2026-11-02)

- `GameEvent.team` is either `'home'`/`'away'` or the team's **English name**; `teamId` is sometimes set. Resolve side via `teamId` first, then `'home'/'away'`, then name match.
- `OWN_GOAL` events are attributed to the side that **benefits** (verified: 2:5 game, away = G,G,PG,G,OG).
- A scorer who came off the bench has a `GameLineupEntry` with `role: SUBSTITUTE` for that game (lineups exist ~2010+).
- `Season.year` is the start year (2026 = 2026/27).
- League competitions: `comp_liga_haal` (top flight in every era), `comp_liga_leumit`, `comp_hist_liga_alef|bet|gimel|artzit`, `comp_hist_regional`. Not official: `comp_friendlies`.
- HBS = club family `api-563` (`getClubFamily` in `src/lib/history/club-identity.ts`).

## File structure

| File | Responsibility |
|---|---|
| `src/lib/match-analysis/types.ts` | `ClubGame`, `ClubGoal`, `LeagueGame`, `Fact`, `DetectorInput`, `Detector` |
| `src/lib/match-analysis/util.ts` | score/season formatting, HT state, team sequences, coverage helpers |
| `src/lib/match-analysis/detectors/*.ts` | 9 detectors (form already lives in the preview block) |
| `src/lib/match-analysis/detectors/index.ts` | `DETECTORS` list + `runDetectors` |
| `src/lib/match-analysis/rank.ts` | `rankFacts` |
| `src/lib/match-analysis/check.ts` | `unknownNumbers` (numbers in prose not backed by facts) |
| `src/lib/match-analysis/write.ts` | prompt + AI call |
| `src/lib/match-analysis/history.ts` | DB loader: club games, league era, league games |
| `src/lib/match-analysis/job.ts` | `buildAnalyses`, `rewriteAnalysis`, admin push |
| `src/lib/match-analysis/public.ts` | `getPublishedAnalyses`, `getLatestPublishedAnalysis` |
| `src/app/api/cron/match-analysis/route.ts` | cron trigger |
| `src/app/api/admin/games/[id]/analysis/route.ts` (+`generate/route.ts`) | admin API |
| `src/app/admin/games/[id]/analysis/page.tsx` + `src/components/admin/MatchAnalysisClient.tsx` | admin editor |
| `src/components/MatchAnalysisBlock.tsx`, `src/components/HomeAnalysisTeaser.tsx` | web display |
| mobile: `shared/types/mobile-api.ts`, games route, home payload, `mobile/design-system/MatchAnalysisBlock.tsx` | mobile display |
| `src/lib/__tests__/match-analysis-*.test.ts` | tests |

---

### Task 1: Schema

**Files:** Modify `prisma/schema.prisma`

- [ ] Add after `GameEditorial`:

```prisma
enum MatchAnalysisKind {
  POST
  PRE
}

enum MatchAnalysisStatus {
  DRAFT
  PUBLISHED
}

model MatchAnalysis {
  id           String              @id @default(cuid())
  gameId       String
  kind         MatchAnalysisKind
  status       MatchAnalysisStatus @default(DRAFT)
  facts        Json
  titleHe      String?
  bodyHe       String?
  scoreAtBuild String?
  sourceGameId String?
  aiGenerated  Boolean             @default(true)
  publishedAt  DateTime?
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt
  game         Game                @relation(fields: [gameId], references: [id], onDelete: Cascade)

  @@unique([gameId, kind])
  @@index([status, publishedAt])
  @@map("match_analyses")
}
```

and `matchAnalyses MatchAnalysis[]` on `Game`.

- [ ] `npx prisma generate` (local DB push too if a local DB is running). Commit: `feat(analysis): MatchAnalysis model`.

### Task 2: Types + util (TDD)

**Files:** Create `src/lib/match-analysis/types.ts`, `util.ts`; Test `src/lib/__tests__/match-analysis-util.test.ts`

- [ ] types.ts:

```ts
export type AnalysisKind = 'POST' | 'PRE';

export interface ClubGoal {
  minute: number;
  forClub: boolean;
  ownGoal: boolean;
  scorerKey: string | null; // canonical player id
  scorerHe: string | null;
  bySub: boolean | null;    // null when the game has no lineups
}

export interface ClubGame {
  id: string;
  date: Date;
  seasonYear: number;
  competitionId: string | null;
  isLeague: boolean;
  atHome: boolean;
  opponentKey: string;
  opponentHe: string;
  venueKey: string | null;
  venueHe: string | null;
  gf: number | null; // null when not played yet
  ga: number | null;
  goals: ClubGoal[] | null; // null = goal minutes incomplete
  hasLineups: boolean;
}

export interface LeagueGame {
  id: string;
  date: Date;
  seasonYear: number;
  homeKey: string;
  awayKey: string;
  homeHe: string;
  awayHe: string;
  hs: number;
  as: number;
}

export interface Fact {
  key: string;
  kind: AnalysisKind;
  scope: 'club' | 'league';
  coverageHe: string;
  rarity: number;
  textHe: string;
  numbers: Record<string, number | string>;
  evidenceGameIds: string[];
  removed?: boolean;
}

export interface DetectorInput {
  kind: AnalysisKind;
  target: ClubGame;
  history: ClubGame[]; // completed official games before target, oldest first
  league: LeagueGame[]; // top-flight games of the complete era, oldest first
  leagueFrom: number | null;
  clubHe: string;
}

export type Detector = (input: DetectorInput) => Fact[];
```

- [ ] util.ts:

```ts
import type { ClubGame, LeagueGame } from './types';

/** Hebrew sports convention: the subject's goals on the right → "2:5" for a 5-2 win. */
export const scoreHe = (forGoals: number, againstGoals: number) => `${againstGoals}:${forGoals}`;
export const seasonHe = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
export const resultOf = (g: { gf: number | null; ga: number | null }) =>
  g.gf == null || g.ga == null ? null : g.gf > g.ga ? 'W' : g.gf === g.ga ? 'D' : 'L';

export function halfTime(g: ClubGame): { f: number; a: number } | null {
  if (!g.goals) return null;
  const first = g.goals.filter((x) => x.minute <= 45);
  return { f: first.filter((x) => x.forClub).length, a: first.filter((x) => !x.forClub).length };
}
export function htState(g: ClubGame): 'lead' | 'level' | 'trail' | null {
  const ht = halfTime(g);
  if (!ht) return null;
  return ht.f > ht.a ? 'lead' : ht.f === ht.a ? 'level' : 'trail';
}

export const seasonLeagueGames = (games: ClubGame[], year: number) =>
  games.filter((g) => g.isLeague && g.seasonYear === year && g.gf != null);

/** Share of games carrying goal minutes (or lineups) — detectors skip below 0.8. */
export const coverage = (games: ClubGame[], pick: (g: ClubGame) => boolean) =>
  games.length ? games.filter(pick).length / games.length : 0;

export interface TeamGame { game: LeagueGame; home: boolean; gf: number; ga: number }
/** Per-club league sequences, oldest first. */
export function teamSequences(league: LeagueGame[]): Map<string, TeamGame[]> {
  const m = new Map<string, TeamGame[]>();
  const add = (k: string, t: TeamGame) => { const a = m.get(k); if (a) a.push(t); else m.set(k, [t]); };
  for (const g of league) {
    add(g.homeKey, { game: g, home: true, gf: g.hs, ga: g.as });
    add(g.awayKey, { game: g, home: false, gf: g.as, ga: g.hs });
  }
  return m;
}
export const teamHe = (t: TeamGame) => (t.home ? t.game.homeHe : t.game.awayHe);
```

- [ ] Tests: `scoreHe(5,2)==='2:5'`, `seasonHe(1999)==='1999/00'`, `htState` on goals [{minute:30, forClub:false},{minute:70, forClub:true}x2] → 'trail', `teamSequences` gives each team its games with gf/ga from its view. Run `npx jest match-analysis-util` → PASS. Commit.

### Task 3: Test fixture builder

**Files:** Create `src/lib/__tests__/match-analysis-fixtures.ts`

- [ ] Helper `g(partial)` building a `ClubGame` with defaults (`isLeague:true, atHome:true, opponentKey:'opp', opponentHe:'יריב', goals:null, hasLineups:false, seasonYear:2020`), auto ids and dates increasing by a week; `goals(spec)` from strings like `'f30 a40 f70s'` (f/a = for/against, `s` = by sub, `o` = own goal, optional `@key`); `lg(home, away, hs, as, year)` for `LeagueGame`. `input(target, history, extra)` returns a `DetectorInput` with `clubHe:'הפועל באר שבע'`, `league:[]`, `leagueFrom:null`.

### Task 4–12: Detectors (TDD, one commit each)

Each detector file exports a `Detector`. For each: write the tests listed, see them fail, implement, see them pass, commit `feat(analysis): <name> detector`.

**4. `scoreline.ts` — scoreline first**
- POST only. Club: no earlier game with same gf/ga → rarity 1, text `"{scoreHe} — תוצאה ראשונה אי-פעם בתולדות {club}"`, coverage `בתולדות המועדון`. Else if last occurrence ≥10 seasons ago → rarity `min(0.9, gap/40)`, text `"{scoreHe} — לראשונה מאז {seasonHe(last)} ({n} פעמים בסך הכל)"`.
- League (target league game in era): no earlier league game with same home/away score → rarity 1, scope league, text `"{hs}-{as} לקבוצה המארחת — תוצאה שלא נרשמה בליגה הבכירה מאז {seasonHe(leagueFrom)}"`.
- Tests: first ever; repeated 12 seasons later → "לראשונה מאז"; repeated 3 seasons later → nothing; league scorigami only when `leagueFrom` set.

**5. `same-score.ts` — same score in a row**
- POST; previous club game has identical gf/ga. Club text `"{scoreHe} פעמיים ברצף — {לראשונה בתולדות המועדון | בפעם ה-{n+1} בתולדות המועדון}"`, rarity `0.6 + 0.4/(n+1)`.
- League: both games league; count all earlier adjacent pairs in any team's league sequence with that team-view score; text `"בליגה הבכירה מאז {from} קבוצה סיימה פעמיים ברצף ב-{scoreHe} רק {count} פעמים; האחרונה: {team} ב-{season}"` (or `"לא קרה אף פעם"`), rarity `0.6 + 0.4/(count+1)`.
- Tests: pair found with counts; no fact when previous differs.

**6. `goal-flood.ts` — 5+ in consecutive home/away games**
- POST, target gf ≥ 5. Previous club game at the same venue side with gf ≥ 5 → fact. `adjacent` = that game is the last history game.
- Club text `"{n}+ שערים בשני משחקי {חוץ|בית} רצופים{ — וללא משחק ביניהם}"`; league scope: count earlier pairs (same team, consecutive same-side league games, both ≥5) and how many were also adjacent in the team's league sequence: text `"פעם ה-{count+1} בליגה הבכירה מאז {from} שקבוצה כובשת 5+ בשני משחקי {side} רצופים; {adjacentCount===0 ? 'הראשונה' : `רק הפעם ה-${adjacentCount+1}`} שהם גם משחקי ליגה רצופים"` (adjacent part only when the club's two games are adjacent league games), rarity `0.7 + 0.3/(count+1)`.
- Tests: two away 5-2s with a home game between → no "ללא משחק ביניהם"; adjacent → yes; league counts.

**7. `half-time.ts` — HT state vs result**
- POST, target league, won, HT state level/trail. Season league games up to target with goal coverage ≥0.8. `n` = games not leading at HT, `w` = wins among them; previous season same (full). Text `"ניצחה אחרי {פיגור|תיקו} במחצית. העונה: {w} ניצחונות ב-{n} משחקי ליגה שבהם לא הובילה בהפסקה (בעונה שעברה: {pw} מתוך {pn})"`, rarity `0.5` (+0.2 if w/n − pw/pn ≥ 0.2).
- Tests: comeback win fact; leading-at-HT win → nothing; coverage < 0.8 → nothing.

**8. `second-half.ts` — share of goals after the break**
- POST, target league. Season so far: club goals (forClub) with coverage ≥0.8 and total ≥ 8; share = minute > 45. Compare to each earlier season with coverage ≥0.8 and ≥20 goals. Emit if share ≥ 0.6: record → `"{s} מתוך {t} שערי הליגה העונה הובקעו במחצית השנייה ({pct}%) — השיעור הגבוה ביותר מאז שיש לנו דקות שערים ({seasonHe(first)})"` rarity 0.85; else last season with higher share ≥5 seasons ago → `"… — הגבוה ביותר מאז {seasonHe}"` rarity 0.6; else nothing.
- Tests: record; not record but gap; below 0.6 → nothing.

**9. `sub-goals.ts` — goals by substitutes**
- POST. Seasons with lineup coverage ≥0.8 among league games. Count club non-own goals with `bySub != null`; this season (to target) vs previous season. Emit when target contains a sub goal or share rose ≥5 points, and this-season sub goals ≥ 2. Text `"{n} מתוך {t} שערי השחקנים העונה הובקעו על ידי מחליפים ({pct}%), לעומת {pn} מתוך {pt} ({ppct}%) בעונה שעברה"`, coverage `"מאז {seasonHe(first lineup season)}"`, rarity 0.55.
- Tests: rise detected; no lineups → nothing.

**10. `streaks.ts` — win / unbeaten streaks**
- Sequences: league-only when target is league, else all official. POST: current run ending at target. PRE: run ending at the last history game.
- Win run c ≥ 3 (POST): max earlier run M (year). c > M → `"{c} ניצחונות {ליגה }ברצף — שיא מועדון"` rarity 0.95; c == M → `"משווה את שיא המועדון ({seasonHe})"` 0.85; else last earlier run ≥ c → `"הרצף הארוך ביותר מאז {seasonHe}"` rarity `min(0.8, gap/30)`, only if gap ≥ 3.
- PRE (c ≥ 3): `"ניצחון ישלים {c+1} ברצף"` + `" וישבור את שיא המועדון ({M}, {season})"` / `" וישווה את שיא המועדון"`; rarity 0.6–0.9.
- Same for unbeaten (c ≥ 6) only when no win fact emitted.
- Tests: record, equal, since-gap, PRE lookahead.

**11. `opponent.ts` — opponent and venue**
- POST win: no earlier win vs opponent with ≥3 meetings → `"ניצחון ראשון אי-פעם על {opp} ({meetings} מפגשים)"` 0.9; last win ≥5 seasons ago → `"ניצחון ראשון על {opp} מאז {season}"` 0.6. Away win with venueKey: last win at venue ≥5 seasons ago or never (≥3 visits) → `"ניצחון ראשון ב{venue} מאז {season}"`. Margin greater than every earlier win vs opponent (≥5 meetings) → `"הניצחון הגדול ביותר אי-פעם על {opp}"` 0.8.
- PRE: meetings ≥1 → `"מאזן מול {opp}: {w} ניצחונות, {d} תיקו, {l} הפסדים ב-{n} מפגשים; האחרון: {scoreHe} ב-{season}"` rarity 0.5 (0.65 if first ever meeting → `"מפגש ראשון אי-פעם מול {opp}"`).
- Tests for each branch.

**12. `milestones.ts` — player milestones**
- Totals from every history goal with `forClub && !ownGoal && scorerKey`. POST, per scorer in target: before/after totals; crossing a multiple of 25 → `"השער ה-{m} של {name} במדי {club}"` 0.8 (100+ → 0.9); before==0 → `"שער ראשון של {name} במדי {club}"` 0.4; ≥3 in target and never before → `"שלושער ראשון של {name}"` 0.7; overtaking someone in the club top 20 → `"{name} עקף את {other} ({n}) ועלה למקום {rank} בכובשי המועדון"` 0.75. Coverage `"לפי השערים הרשומים אצלנו"`.
- PRE: scorers with a goal in the last 2 seasons whose total is 1 short of a multiple of 25 → `"{name} במרחק שער מהשער ה-{m} במדי {club}"` 0.6.
- Tests: crossing 50, first goal, overtake, PRE near-milestone.

**13. `pace.ts` — season pace**
- POST league. N = league games this season up to target (N ≥ 5). Points with 3/1 for this season's first N vs every earlier season with ≥ N league games. Best ever → `"{p} נקודות אחרי {N} משחקי ליגה — הפתיחה הטובה בתולדות המועדון (לפי 3 נקודות לניצחון)"` 0.9; else last season with ≥ p is ≥5 seasons ago → `"… — הפתיחה הטובה ביותר מאז {season}"` 0.65.
- Tests.

### Task 14: Registry, ranker, number checker (TDD)

- [ ] `detectors/index.ts`: `DETECTORS = [scoreline, sameScore, goalFlood, halfTimeDetector, secondHalf, subGoals, streaks, opponent, milestones, pace]`; `runDetectors(input)` = flatMap with try/catch per detector (a throwing detector logs and yields []).
- [ ] `rank.ts`:

```ts
import type { Fact } from './types';
export function rankFacts(facts: Fact[], max = 6, min = 0.3): Fact[] {
  const score = (f: Fact) => f.rarity + (f.scope === 'league' ? 0.05 : 0);
  return facts.filter((f) => !f.removed && f.rarity >= min).sort((a, b) => score(b) - score(a)).slice(0, max);
}
```

- [ ] `check.ts`:

```ts
import type { Fact } from './types';
const NUM = /\d+(?:[.,]\d+)?/g;
export function unknownNumbers(text: string, facts: Fact[], extra: string[] = []): string[] {
  const allowed = new Set<string>();
  for (const s of [...facts.flatMap((f) => [f.textHe, f.coverageHe, ...Object.values(f.numbers).map(String)]), ...extra])
    for (const n of s.match(NUM) || []) allowed.add(n);
  return Array.from(new Set((text.match(NUM) || []).filter((n) => !allowed.has(n) && !/^[1-9]$/.test(n))));
}
```

(single digits 1–9 are allowed — they are list numbering and small counts usually already in facts.)
- Tests: ranking order/league bonus/removed; `unknownNumbers('ניצחו 7 פעמים ב-1968', facts)` flags `1968` when absent.

### Task 15: Writer

**Files:** `src/lib/match-analysis/write.ts`

```ts
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithClaude, chatWithOpenAI } from '@/lib/ai-providers';
import type { AnalysisKind, Fact } from './types';

export interface AnalysisText { titleHe: string; bodyHe: string }

export function buildPrompt(kind: AnalysisKind, headline: string, facts: Fact[]): string {
  const what = kind === 'POST' ? `ניתוח אחרי המשחק ${headline}` : `טור "לקראת" המשחק ${headline}`;
  return [
    `אתה כותב טור סטטיסטי בעברית על הפועל באר שבע, בסגנון של כתב שאוהב מספרים: חד, עם הקשר, בלי קלישאות.`,
    `כתוב ${what}. השתמש אך ורק בעובדות שלמטה — אסור להוסיף מספר, שנה, שם או טענה שלא מופיעים בהן.`,
    `שמור על טווח הנתונים של כל עובדה (למשל "בליגה הבכירה מאז 1991/92") כשאתה מצטט אותה.`,
    `מבנה: סעיפים ממוספרים (1. 2. 3.), כל סעיף פסקה של 2-4 משפטים, סעיף לכל עובדה או לשתיים קשורות.`,
    `החזר JSON תקין בלבד: {"title":"כותרת קצרה","body":"הסעיפים, מופרדים בשורה ריקה"}.`,
    `עובדות: ${JSON.stringify(facts.map((f) => ({ fact: f.textHe, coverage: f.coverageHe })))}`,
  ].join('\n');
}

export async function writeAnalysis(kind: AnalysisKind, headline: string, facts: Fact[]): Promise<AnalysisText | null> {
  if (!facts.length) return null;
  try {
    const settings = await getAiSettings();
    const apiKey = await getActiveApiKey(settings);
    if (!apiKey) return null;
    const messages = [{ role: 'user' as const, content: buildPrompt(kind, headline, facts) }];
    const raw = (settings.provider === 'openai'
      ? await chatWithOpenAI(apiKey, messages, 'gpt-5.6-luna')
      : await chatWithClaude(apiKey, messages)).trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]);
    const bodyHe = String(parsed.body || '').trim();
    return bodyHe ? { titleHe: String(parsed.title || '').trim(), bodyHe } : null;
  } catch {
    return null;
  }
}
```

Test: `buildPrompt` contains each fact text + coverage. Commit.

### Task 16: History loader

**Files:** `src/lib/match-analysis/history.ts`

- `LEAGUE_IDS`, `TOP_FLIGHT = 'comp_liga_haal'`, `NOT_OFFICIAL = ['comp_friendlies']`.
- `loadClubHistory(clubKey = 'api-563')`:
  1. `family = await getClubFamily(clubKey)`; teamIds = family.teamIds ∪ teams with `nameHe === family.nameHe`.
  2. `index = await getClubTeamIndex()`; `keyOf(teamId) = index.get(teamId)?.clubKey ?? 'team-' + teamId`.
  3. Games: `status in [COMPLETED, SCHEDULED]`, club on either side, `NOT competitionId in NOT_OFFICIAL` (null allowed), completed need scores; select ids, dateTime, scores, competitionId, venueId, venueNameHe, venue{nameHe}, season{year}, homeTeam/awayTeam {nameHe,nameEn}, events (GOAL, PENALTY_GOAL, OWN_GOAL: minute, team, teamId, playerId, player{canonicalPlayerId,nameHe,nameEn}), lineupEntries where teamId in club ids (playerId, role, player{canonicalPlayerId}).
  4. Side of an event: `teamId` → home/away; else `'home'|'away'`; else equals homeTeam.nameEn/awayTeam.nameEn; else null.
  5. `goals` valid only when every goal event has a side and minute, and per-side counts equal the score; otherwise `null`.
  6. `bySub` = hasLineups ? scorer (canonical) appears with role SUBSTITUTE : null. `scorerKey` = canonicalPlayerId ?? playerId.
  7. Sort by date.
- `leagueEra()`: for each `Season.year` of `comp_liga_haal`, held = completed games count, expected = Σ standings.played / 2 (rows of that competition+season); complete if expected > 0 and held ≥ expected. Exclude the current (max) year. `leagueFrom` = earliest Y with every year Y..last complete (and ≥ 5 consecutive seasons), else null.
- `loadLeagueGames(from)`: completed `comp_liga_haal` games with year ≥ from (plus the current season) → `LeagueGame` with family keys.
- Export `loadAnalysisContext()` returning `{ clubHe, games, leagueFrom, league }`.
- Verify on prod with a one-off `npx tsx -e` printing leagueFrom and counts. Commit.

### Task 17: Job

**Files:** `src/lib/match-analysis/job.ts`

- `buildAnalyses(gameId, { force = false, dry = false })`:
  - ctx = loadAnalysisContext(); target = ctx.games.find(id, completed); throws if not a club game.
  - history = completed games with date < target.date.
  - postFacts = runDetectors({kind:'POST', target, history, ...}); next = first scheduled club game with date > target.date; preFacts with history = completed games with date < next.date (includes target).
  - For each piece: ranked = rankFacts(facts); text = await writeAnalysis(...); headline = `"{home} {hs}-{as} {away}"` / `"{club} נגד {opp}"`.
  - dry → return facts/text. Otherwise: existing row (gameId, kind) and !force → skip; else upsert with `facts` = all facts (ranked first, others appended with `removed: true`), status DRAFT, scoreAtBuild (POST), sourceGameId (= target.id).
  - Created any (non-force) → push to admins: users `role: ADMIN, isActive`, enabled push tokens → `sendIfAny(tokens, { title: 'ניתוח מוכן לאישור', body, data: { type: 'matchAnalysis', gameId: target.id } })`.
- `rewriteAnalysis(id)`: reload row, take non-removed facts, writeAnalysis, update text (status DRAFT).
- Unit test with jest mocks of `./history`, `./write`, `@/lib/prisma`, `@/lib/push-notify`: creates two rows, second run skips, force updates. Commit.

### Task 18: Cron route + crontab

- `src/app/api/cron/match-analysis/route.ts`: same secret guard as `on-this-day`; find club's latest completed official game with `kickoff < now − 150 min` and `kickoff > now − 7 days`; if POST or PRE row missing → `buildAnalyses`; `?dry=1` → dry. GET + POST exported.
- `ops/crontab`: `*/10 * * * * cd /home/hbs/hbstats && /usr/bin/node scripts/call-cron.js match-analysis >> /home/hbs/logs/match-analysis.log 2>&1`. Commit.

### Task 19: Admin API + editor

- `GET /api/admin/games/[id]/analysis` → rows where `sourceGameId = id OR gameId = id`, with game headline + current score.
- `PUT` body `{ id, titleHe?, bodyHe?, facts?, status? }`; status PUBLISHED sets `publishedAt`, DRAFT clears it.
- `POST /api/admin/games/[id]/analysis/generate` body `{ mode: 'rebuild' | 'rewrite', id? }` → `buildAnalyses(id,{force:true})` or `rewriteAnalysis(id)`.
- Page `/admin/games/[id]/analysis` (server: admin guard, loads rows) + `MatchAnalysisClient` (tabs POST/PRE; title input; body textarea; facts list with checkbox "הסר", coverage, evidence links `/games/{id}`; warnings: unknownNumbers(body, facts) and score changed vs scoreAtBuild; buttons שמור / אשר ופרסם / בטל פרסום / כתוב מחדש / חשב מחדש).
- Link "ניתוח" next to "ערוך תוכן משחק" on the game page for admins. Pending-drafts count on `/admin`. Commit.

### Task 20: Web display

- `public.ts`: `getPublishedAnalyses(gameId)` → `{ post, pre }` (published only); `getLatestPublishedAnalysis()` → PRE whose game is scheduled within 7 days, else newest POST.
- `MatchAnalysisBlock` (server-friendly): title, paragraphs = `bodyHe.split(/\n\s*\n/)`, credit `"נכתב בעזרת AI ונבדק בידי העורך"`.
- Game page overview: POST block above `GameEditorialBlock`; pass `pre` into `MatchPreviewSection` as `analysis` prop — when set, render it instead of `aiSummary`.
- Home: `HomeAnalysisTeaser` (title + first paragraph + "להמשך ←" link to `/games/{gameId}`) next to `HomeStatTeaser`. Commit.

### Task 21: Mobile

- `shared/types/mobile-api.ts`: `export interface MatchAnalysisPayload { kind: 'POST' | 'PRE'; gameId: string; titleHe: string | null; paragraphs: string[] }`; `MatchPayload.analysis?: { post: MatchAnalysisPayload | null; pre: MatchAnalysisPayload | null }`; home payload `analysisTeaser?: MatchAnalysisPayload | null`.
- Mobile game route + home builder fill them via `public.ts`.
- `mobile/design-system/MatchAnalysisBlock.tsx` (rtl text), used in game overview (post) and `PreMatchBlock` (pre replaces AI summary), and home teaser card linking to the game. Run `cd mobile && npm test`. Commit.

### Task 22: Verify, version, deploy

- [ ] `npm test`, `npx tsc --noEmit`, `npm run build` locally.
- [ ] Golden check on prod (dry): `curl -H "x-cron-secret: …" "localhost:3100/api/cron/match-analysis?dry=1"` for the 1.11.2026 Maccabi PT 2-5 game — expect: same score twice in a row (2:5), 5+ in two consecutive away games (adjacent), league scorigami counts within the era, win streak. Compare against the inspiration column; fix detector bugs.
- [ ] Bump `0.58.0` in `src/lib/version.ts` + `package.json`; commit; push.
- [ ] Deploy: pull, `npx prisma db push && npx prisma generate`, build, `pm2 restart hbstats`; `scripts/install-crontab.sh`; run the cron once (non-dry) to create real drafts for the 1.11 game + OFI preview; mobile `CI=1 eas update --branch production --platform ios`.
