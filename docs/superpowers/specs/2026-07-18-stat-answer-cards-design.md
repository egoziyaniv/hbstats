# Stat-Answer Cards — Design Spec

**Date:** 2026-07-18
**Status:** Approved (brainstorm) → ready for implementation plan
**Track:** Phase 3, sub-project 1 of 4 (see `2026-07-10-product-roadmap-records-history-design.md`). Later Phase-3 tracks (free-text NL, yearly recap, AI previews, native widgets/Android) are out of scope here.

## Goal

A Hebrew, casual-first "ask the data" surface: fans tap a question and get a clean answer card backed by the Phase-2 history aggregates. It's the differentiator vs Sofascore/365Scores/Flashscore (none surface Israeli all-time stats conversationally) and reuses everything Phase 2 built — no new data pipeline.

## Decisions (from brainstorm)

1. **Input model — hybrid.** Prominent tappable question chips + a free-text "ask anything" box. **Phase 1 ships the chips only**; the free-text box appears disabled ("בקרוב") and is a later phase (a thin LLM router into the same resolvers).
2. **Answer engine — deterministic numbers + cached LLM narrative flourish.** Numbers are always computed from the aggregates (never LLM-generated, never wrong). A one-line Hebrew context sentence is generated via the Anthropic SDK and cached, so cost/latency are near-zero.
3. **Scope — both.** A club-centric section (club-selectable, defaults to Hapoel Be'er Sheva) AND a league-wide superlatives section.
4. **Placement — History hub.** Dedicated page `/history/ask` (web) + a mobile screen, linked from the היסטוריה nav, plus a rotating "question card" teaser on the home page that deep-links in.
5. **Card design — rich (option B).** Answer = number + a supporting mini-visual (bar or top-3) + the one-line AI narrative + a deep link.
6. **Architecture — question registry over aggregates (option A).** A registry of question entries whose resolvers reuse Phase-2 services; a small `StatNarrative` cache table for the AI line.

## Question catalog (phase 1)

Each question maps to an existing Phase-2 aggregate/service — nothing new is computed. Club questions are club-selectable (resolver takes a `clubKey`); default club = HBS.

### Club section (club-selectable)
| id | Question (He) | Source | cardType |
|---|---|---|---|
| club_top_scorer | מלך השערים בכל הזמנים | leaderboards / player career | bar (goals by season) |
| club_unbeaten | הרצף הארוך ביותר בלי הפסד | records-engine | hero |
| club_win_streak | רצף הניצחונות הארוך ביותר | records-engine | hero |
| club_biggest_win | הניצחון הכי גדול | records-engine | hero (→ game) |
| club_top_opponent | היריבה הכי תכופה + מאזן | buildFullH2H | hero/leaderboard |
| club_h2h_rival | מאזן מול יריבה… (rival picker) | buildFullH2H | leaderboard |
| club_honors | תארים והישגים | club-honors / cup-finals / seasons-spine | leaderboard |
| club_best_season | העונה הכי טובה | seasons-spine | hero (→ season) |
| club_youngest_scorer | המבקיע הצעיר ביותר (מ-2006) | records-engine | hero (→ player) |
| club_hat_tricks | הט-טריקים של המועדון | records-engine | leaderboard |

### League section
| id | Question (He) | Source | cardType |
|---|---|---|---|
| league_most_titles | הכי הרבה אליפויות | seasons-spine | leaderboard |
| league_top_scorer | מלך השערים ההיסטורי | leaderboards | hero |
| league_biggest_win | הניצחון הכי גדול אי פעם | records-engine | hero (→ game) |
| league_unbeaten | הרצף הכי ארוך בלי הפסד | records-engine | hero |
| league_most_state_cups | הכי הרבה גביעי מדינה | cup-finals | leaderboard |
| league_all_time_leader | מובילת טבלת כל-הזמנים | all-time table | leaderboard (→ /history/all-time) |
| league_biggest_rivalries | היריבויות הגדולות | buildFullH2H | leaderboard (→ /history/h2h) |

Catalog is designed to grow: adding a question = one registry entry + one resolver.

## Architecture

New code under `src/lib/stats-qa/`. Reads Phase-2 aggregates; one new table.

### Types (shared/types)
```ts
type StatAnswer = {
  headline: { label: string; value: string; unit?: string } | null; // null → empty-state
  secondary?: string;
  series?: { label: string; value: number }[];      // bar card
  top?: { name: string; value: string; href?: string }[]; // leaderboard card
  href?: string;                                     // primary deep link
  questionKey: string;                               // id[:club][:rival]
  coverageNote?: string;                             // e.g. "מ-2006"
};
type StatQuestion = {
  id: string; scope: 'club' | 'league';
  titleHe: (ctx) => string; needsClub: boolean; needsRival?: boolean;
  cardType: 'hero' | 'bar' | 'leaderboard';
  resolve: (ctx: { clubKey?: string; rivalKey?: string }) => Promise<StatAnswer>;
};
```

### Components
- `registry.ts` — array of `StatQuestion`.
- `resolvers/*.ts` — one resolver per question, calling existing services (`records-engine`/`RecordEntry`, `club-identity`, `cup-finals`, `club-honors`, `seasons-spine`, all-time table, `buildFullH2H`, leaderboards). Deterministic; return `StatAnswer`.
- `narrative.ts` — `getNarrative(question, answer)`: look up `StatNarrative` by `(questionKey, dataVersion)`; on miss, generate a ≤1-sentence Hebrew line via the Anthropic SDK from the resolved numbers and cache it. On generation failure return `null`.
- **`StatNarrative` table** (only schema change): `{ id, questionKey, dataVersion, text, createdAt }`, unique `(questionKey, dataVersion)`.

### Surfaces
- Web: `src/app/history/ask/page.tsx` (client component for chip interaction + fetching) + `StatAnswerCard` with hero/bar/leaderboard variants; `GET /api/history/ask?q=&club=&rival=`.
- Home teaser: rotating `StatQuestionTeaser` card linking into `/history/ask` with a preselected question.
- Mobile: `mobile/app/history/ask.tsx` + `useStatQuestions`/`useStatAnswer` hooks + shared card; `/api/mobile/v1/history/ask`.
- Nav: add "שיאים ותשובות" under היסטוריה.

## Data flow

1. Page loads the registry → renders club-section chips (filtered by selected club) + league-section chips.
2. Tap → client calls `/api/history/ask?q=<id>[&club=<clubKey>][&rival=<clubKey>]`.
3. API: `registry[q].resolve(ctx)` → deterministic `StatAnswer`; `getNarrative()` → cached or generate+cache; return combined JSON.
4. `StatAnswerCard` renders per `cardType`, shows `coverageNote` when present, and deep-links via `href`.

## Caching & cost

- Narratives cached in `StatNarrative` by `(questionKey, dataVersion)`. `dataVersion` is a stamp produced by the nightly `rebuild-records.ts` (04:30) — bumped whenever the underlying numbers change, so narratives regenerate lazily on first view afterwards.
- The rebuild job pre-warms the HBS club narratives + all league narratives (small, popular set) so the common path is always a cache hit.
- Answer numbers never call the LLM. Resolvers read `RecordEntry` + cached services (already fast).

## Card renderers

- **hero** — big `value` + `label` (+ `secondary`); optional `href`.
- **bar** — hero + small bar chart from `series[]`; degrades to hero if `series` empty.
- **leaderboard** — top-N rows from `top[]` (value + optional link).
All three shared between web and the mobile design-system.

## Edge cases & correctness

- Insufficient data → resolver returns `headline: null` → card shows "אין מספיק נתונים"; no narrative generated. Never fabricate a value.
- Data-coverage honesty → resolvers set `coverageNote` (e.g. events start 2006) and scope accordingly, so we never imply full history when the data doesn't support it.
- Club selector + rival picker driven by `club-identity` families and `buildFullH2H` (only real clubs/opponents). Default HBS.
- Narrative generation failure (LLM down/timeout) → card renders without the one-liner; numbers always show; the answer is never blocked on the LLM.

## Testing

- Per-resolver unit tests asserting **exact numbers** against known fixtures (HBS all-time top scorer; a club's title count; a known biggest win).
- Registry-integrity test: every entry resolves for HBS (club scope) and for league scope without throwing.
- Narrative-cache tests: miss→generate→hit; generation failure→`null` and card still renders.
- Mobile hook + card render tests (existing Jest + MSW pattern); card-variant snapshots.

## Deploy / versioning

- Version bump (`src/lib/version.ts` + `package.json`).
- `npx prisma db push` for `StatNarrative` (only schema change).
- Hook `rebuild-records.ts` to bump `dataVersion` + pre-warm HBS/league narratives.
- Ships web + mobile via OTA (no native module).

## Out of scope (future Phase-3 tracks)

- Free-text "ask anything" NL box (LLM router into these resolvers) — the disabled box is a placeholder for it.
- Yearly/season recap; AI match previews; native widgets/Live Activities + Android.
