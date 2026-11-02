# Match Analysis (post-match + next-match preview) — Design Spec

**Date:** 2026-11-02
**Status:** Approved in brainstorm, awaiting owner review of this document → implementation plan
**Inspiration:** a fan column after HBS's second 5:2 in a row — "scorigami", the same score twice in a row,
5+ goals in consecutive away games, record when not leading at half-time, share of second-half goals, goals
by substitutes. Goal: reach that level of analysis after and before every HBS game, from our own data.

## Decisions (from brainstorm)

1. **Engine:** a deterministic fact engine computes every number; an AI model only writes prose from those
   facts; the owner approves before anything is public. No number is ever produced by the model.
2. **Comparison scope:** HBS against its whole history (1950+, every club game is held). League-wide claims
   ("7th time in league history") only over the era where we hold the complete league, and the text always
   names that era ("in Ligat Ha'Al since 1991"). The start of the complete era is measured, not assumed
   (see "Coverage" below).
3. **Trigger:** when an official HBS game (league, State Cup, Toto Cup, Europe, Super Cup — not friendlies)
   ends, two drafts are created together: the **post-match** analysis of that game and the **preview** of
   HBS's next game. The owner gets a push notification and approves each.
4. **Display:** game page (web + mobile) and a teaser block on the home page (first item + "להמשך" link).

## Architecture

```
matchday-live cron (*/10) sees an HBS game reach FT
  → analysis job (idempotent per game)
      → fact engine: detectors × {finished game (POST), next scheduled game (PRE)}
      → rank by rarity, keep 4–6 facts per piece
      → AI writes a numbered Hebrew column from the facts only
      → MatchAnalysis rows, status DRAFT (facts JSON + text)
  → push to admin users: "ניתוח מוכן לאישור"
admin /admin/games/[id]/analysis → edit / regenerate / approve → PUBLISHED
  → game page (web + mobile), home teaser
```

### Units

| Unit | Responsibility |
|---|---|
| `src/lib/match-analysis/history.ts` | Loads HBS's game history once per run (results, venue side, competition, goal minutes, scorer + whether the scorer came off the bench) and the complete-era league games. Pure data, no ranking. |
| `src/lib/match-analysis/detectors/*.ts` | One file per detector. `(ctx) => Fact[]`. Pure functions over `history`, unit-testable without a DB. |
| `src/lib/match-analysis/rank.ts` | Rarity score + selection of the top facts, dedupe of overlapping facts. |
| `src/lib/match-analysis/write.ts` | Prompt + AI call (same provider plumbing as `match-summary.ts`: `getAiSettings`, `chatWithOpenAI`/`chatWithClaude`). Fails soft (null text). |
| `src/lib/match-analysis/job.ts` | Builds both drafts for a finished game, idempotency, push. Called by the cron and by the admin "regenerate" button. |
| `scripts/match-analysis.js` (or hook in `matchday-live.js`) | Cron entry: finds HBS games that reached FT without a POST analysis. |

### Fact shape

```ts
interface Fact {
  key: string;            // 'scoreline-first', 'same-score-streak', …
  kind: 'POST' | 'PRE';
  scope: 'club' | 'league';
  coverageHe: string;     // "בתולדות המועדון" | "בליגת העל מאז 1991" | "מאז 2010"
  rarity: number;         // 0..1, higher = rarer
  textHe: string;         // deterministic one-line statement with the numbers
  numbers: Record<string, number | string>;
  evidenceGameIds: string[]; // games behind the claim, for drill-down links
}
```

## Detectors (v1)

Post-match (the finished game):

1. **Scoreline first** — first time HBS ended a game with this score (HBS perspective, home/away aware), or
   first since year X. League scope: first time in the complete era.
2. **Same score in a row** — HBS repeated the previous game's score; league scope: how often a team did it,
   and the last time.
3. **Goal-flood streak** — 5+ goals in consecutive away (or home) games; distinguishes "consecutive away
   games" from "consecutive games, both away".
4. **Half-time state vs result** — result after trailing/level at HT; season win rate when not leading at HT
   vs previous season. HT is derived from goal minutes.
5. **Second-half share** — share of the season's goals scored after the break vs previous seasons.
6. **Substitute goals** — share of goals by players who came off the bench, this season vs last.
7. **Streaks** — current win / unbeaten / scoring streak vs longest since X and the club record.
8. **Opponent and venue** — first win vs this opponent / at this ground since X, biggest-ever win vs them.
9. **Player milestones** — Nth goal for the club, first goal, first brace/hat-trick, passing someone in the
   club's all-time scorers.
10. **Season pace** — points after N league rounds vs every previous HBS season.

Preview (next game), same detectors looking forward:
- **On the line:** "a win would be the 7th in a row and equal the 1976 record", "one goal from his 100th".
- **Opponent history:** overall record, last meeting, record at this venue.
- **Form** of both sides.

The owner may add detectors later; each is an independent file + tests.

## Accuracy rules

- **Coverage is explicit.** Every fact carries `coverageHe`; the prompt requires the model to keep it.
- **Incomplete data is excluded, not guessed.** A game whose goal minutes don't add up to its score is left
  out of half-time/second-half stats; a substitute-goal stat only counts games with lineups (2010+). If the
  excluded share of the relevant sample exceeds 20%, the detector emits nothing.
- **Coverage measurement (first plan task):** compute, per season, whether we hold every league game
  (games held = n·(n−1)·rounds-factor from the standings). The complete league era starts at the first
  season after which every season is complete. Until measured, league-scope detectors are off.
- **Ranking:** "first ever" > "first since X" (older X ranks higher); league scope > club scope at equal
  rarity; at most one fact per detector per piece.
- **Model output is checked:** every number in the generated text must appear in the facts' `numbers` or
  `textHe`; otherwise the draft is flagged in the editor ("מספר שלא מופיע בפקטים").

## Data model

```prisma
model MatchAnalysis {
  id          String              @id @default(cuid())
  gameId      String              // the game the piece is about (finished game for POST, next game for PRE)
  kind        MatchAnalysisKind   // POST | PRE
  status      MatchAnalysisStatus @default(DRAFT) // DRAFT | PUBLISHED
  facts       Json                // Fact[] used for the text, incl. removed flags
  titleHe     String?
  bodyHe      String?             // numbered column
  scoreAtBuild String?            // "5-2" for POST — editor warns if the result changed since
  sourceGameId String?            // for PRE: the finished game that triggered it
  aiGenerated Boolean             @default(true)
  publishedAt DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  game        Game                @relation(fields: [gameId], references: [id], onDelete: Cascade)
  @@unique([gameId, kind])
  @@map("match_analyses")
}
```

Schema change → `npx prisma db push` on prod at deploy.

## Admin

- `/admin/games/[id]/analysis` with tabs "אחרי המשחק" / "לקראת [next game]".
- Text editor; below it the facts list (number, coverage, links to evidence games); remove a fact and
  regenerate text without it.
- Buttons: save, approve & publish, regenerate (recompute facts + text), unpublish.
- Warning when the game's score differs from `scoreAtBuild`.
- Pending-drafts badge in the admin dashboard.
- Admin API: `GET/PUT /api/admin/games/[id]/analysis`, `POST …/analysis/generate`.

## Notification

Push to admin users via the existing `push-notify.ts` ("ניתוח מוכן: באר שבע 2:5 X + לקראת Y"), deep link
to the admin page.

## Display

- **Game page, web:** POST analysis on the overview tab above `GameEditorialBlock` — title, numbered items,
  credit "נכתב בעזרת AI ונבדק בידי העורך". PRE analysis replaces the `aiSummary` paragraph inside
  `MatchPreviewSection` when published; otherwise the existing paragraph stays.
- **Mobile:** `MatchPayload.analysis` (published only) built in the mobile game route; rendered in the game
  overview + `PreMatchBlock`. Ships by OTA.
- **Home (web + mobile):** a teaser block showing the newest published piece (PRE when the next game is
  within 7 days and its preview is published, else the latest POST): title + first item + "להמשך" → game page.
- Nothing is shown publicly until published.

## Error handling

- AI failure → draft saved with facts only; owner writes or regenerates.
- Next game not scheduled yet (no fixture or placeholder kickoff) → only the POST draft; PRE is created when
  the fixture appears (same cron) or by hand.
- Cron sees the same FT twice → `@@unique([gameId, kind])`; an existing draft is never overwritten
  automatically (only "regenerate" does that).

## Testing

- Detector unit tests on in-memory fixtures (pure functions).
- Golden tests on real HBS sequences from prod data snapshots, including reproducing the inspiration column's
  facts for the 2026/27 games where our data covers them.
- Number-check of the model output (unit test with a fabricated number → flagged).
- Admin API + publish gating (draft never in public payloads).

## Out of scope (v1)

- Other clubs' analyses (engine is club-parameterised, but only HBS is triggered).
- League-wide claims before the measured complete era.
- Auto-publish without approval.
- Fan-facing free-text questions over the facts.
