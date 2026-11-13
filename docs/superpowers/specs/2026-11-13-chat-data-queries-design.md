# Chat Over All the Data (read-only SQL) — Design Spec

**Date:** 2026-11-13
**Status:** Approved in brainstorm, awaiting owner review of this document → implementation plan
**Trigger:** the owner asked the site chat "was there a team that scored at least 5 in three consecutive
games?" and it refused. The chat has six narrow tools (player search, player events, game search, standings,
leaderboard, cards) and cannot compute over the ~16,900 games. Goal: the chat answers from all the data we hold.

## Decisions (from brainstorm)

1. **Approach:** phase 1 = the model writes read-only SQL against a purpose-built analysis layer; phase 2
   (later) = text retrieval (RAG) over editorial, club pages and songs. The six existing tools stay.
2. **Models (OpenAI account):** `gpt-6-luna` for everything ($0.10 / $0.50 per 1M tokens). Automatic
   escalation of a single question to `gpt-6.1-sol` ($2 / $10) only when luna fails (query errors twice, or a
   result that fails sanity checks). gpt-4o / gpt-4o-mini shut down 2027-01-14 (OpenAI deprecations page), so
   the chat and the three gpt-4o-mini scripts (`transliterate-names.js`, `fetch-team-overviews.js`,
   `fetch-player-overviews.js`) move to `gpt-6-luna`.
3. **API:** the chat moves to the OpenAI **Responses API** — the gpt-6 reasoning models refuse function tools on
   chat/completions unless reasoning is off, and sol has no "none" level.
4. **Scope of data:** everything we hold — standings 1949/50–today (76 seasons), games from 1950 (HBS nearly
   complete; other clubs mostly 1990s+), goals/scorers from 1955 (pre-2006 mostly HBS, from Eyal Hatav's
   archive), lineups/minutes/subs from 2009/10. Answers state coverage only where the question touches data
   that is partial for that period.
5. **Question log:** every question is stored for learning; frequent questions become verified, parameterised
   saved queries answered without writing SQL.

## Architecture

```
user question
  → saved-query match? (luna, short call: template id + parameters) → run template → answer
  → else luna (Responses API) with tools:
       runQuery(sql)            — read-only, against schema `chat`
       describeTable(name)      — columns, meaning, coverage
       existing six tools       — unchanged
  → query error twice / sanity check fails → same question re-run on gpt-6.1-sol
  → Hebrew answer + links (/games/:id, /players/:id) + coverage note when relevant
  → ChatQuestion row (question, answer, SQL, model, outcome, latency, tokens, cost)
```

## The analysis layer — schema `chat` (SQL views, created by a migration script)

Every view: Hebrew names first, clubs folded across seasons (club families, `src/lib/history/club-identity.ts`
logic materialised as a `chat.clubs` mapping table refreshed nightly), players by canonical key.

| View | Grain | Key columns |
|---|---|---|
| `chat.team_games` | one row per team per completed game | game_id, date, season (label + year), competition (id, name_he, is_league, tier), club_key, team_he, opponent_key, opponent_he, home (bool), goals_for, goals_against, result W/D/L, ht_for, ht_against (from goal minutes, null when incomplete), extra_time, penalties, **team_game_no** (running number per club, all competitions) and **team_league_game_no** (per club per league season) |
| `chat.goals` | one row per goal | game_id, date, season, competition, club_key (benefiting), scorer_key, scorer_he, minute, penalty, own_goal, by_sub (null without lineups) |
| `chat.player_appearances` | one row per player per game (2009/10+) | game_id, date, season, competition, club_key, player_key, player_he, started, came_on, minute_on, minute_off, **minutes**, goals, yellow, red, shirt_no |
| `chat.standings` | one row per table line | season, competition, group, position, club_key, team_he, played, won, drawn, lost, gf, ga, points, book_order flag |
| `chat.players` | one row per player key | player_key, name_he, name_en, birth_date, nationality, clubs (array of club_key+seasons) |
| `chat.seasons`, `chat.competitions`, `chat.clubs` | reference | labels, tiers, Hebrew names |
| `chat.coverage` | one row per data kind × period | what is complete from when (drives the coverage note) |

**Minutes:** starter 0 → sub-off / red card / end; substitute minute-on → sub-off / red / end; end = 90, or 120
when the game went to extra time; stoppage time not counted. Sub pairs come from `SUBSTITUTION_OUT` events
(`playerId` = off, `relatedPlayerId` = on; verified on prod, ~92% carry both).

**Data quirks the views absorb:** `GameEvent.team` is 'home'/'away' or the English team name (resolve via
teamId → literal → name); own goals are credited to the benefiting side; HBS team rows matched by
`apiFootballId 563` OR exact `nameHe` (pre-API rows).

**Duplicate players (pre-2016 per-season rows, reversed names):** `player_key = coalesce(canonicalPlayerId,
id)`. The chat may add up keys only inside one club lineage or when already linked in data — never by name
alone across clubs (the site's safety rule, see memory player-data-fragmentation). On real ambiguity (same name,
different clubs) it asks the user. Answers about a player include a per-season breakdown so gaps are visible.

## Security

- **Read-only role** `hbs_chat` (LOGIN, no other rights) with `SELECT` on schema `chat` only; the app's `hbs`
  user lacks CREATEROLE, so the owner runs one command as root
  (`sudo -u postgres psql -c "CREATE ROLE hbs_chat LOGIN PASSWORD '…'"`); `hbs`, as owner of schema `chat`,
  grants the rest. Separate `CHAT_DATABASE_URL` env var, separate small `pg` pool.
- **Always, in addition:** each query runs in `BEGIN READ ONLY`, `SET LOCAL statement_timeout = '5s'`, result
  capped at 200 rows; the SQL is parsed (PostgreSQL AST) and rejected unless it is a single `SELECT`/`WITH`
  that references only `chat.*` relations and no blocked functions (`pg_*`, `dblink`, `lo_*`, file/admin
  functions). Users, sessions, settings, API keys are unreachable.
- Until the role exists the feature stays behind an admin-only flag (the AST + read-only transaction alone are
  not considered enough for public use).

## Answer quality

- System prompt: data dictionary for each view, the coverage table, the duplicate-player rule, Hebrew answer
  style, "state coverage when the period is partial", "never invent; if the data can't answer, say what's
  missing".
- 8–10 worked examples (question → SQL), including the 5-goals-in-3-consecutive-games streak (gaps-and-islands
  over `team_game_no`) and player games/minutes/starts/goals.
- Sanity checks before answering: zero rows on a question that implies existence → retry once with a hint;
  numeric results outside plausible ranges (e.g. minutes > 120 × games) → escalate.
- **Eval set:** ~20 real questions with verified answers (incl. the owner's), run against luna before launch;
  escalation share and accuracy reported.

## Question log + saved queries

```prisma
model ChatQuestion {
  id           String   @id @default(cuid())
  userId       String?  // nulled when the account is deleted
  question     String
  normalized   String   // lower-cased, punctuation/whitespace folded — groups variants
  answer       String?
  queries      Json     // [{ sql, rows, ms, error? }]
  savedQueryId String?
  model        String   // gpt-6-luna | gpt-6.1-sol | saved
  outcome      String   // ok | sql-error | refused | escalated | failed
  latencyMs    Int
  inputTokens  Int
  outputTokens Int
  costUsd      Float
  feedback     Int?     // +1 / -1 from the 👍/👎 buttons
  createdAt    DateTime @default(now())
  @@index([normalized])
  @@index([createdAt])
  @@map("chat_questions")
}

model ChatSavedQuery {
  id          String   @id @default(cuid())
  titleHe     String   // "כמה שערים כבש {שחקן} בעונה {עונה}"
  intentHe    String   // description luna matches against
  sql         String   // with :named parameters
  params      Json     // [{ name, type: 'player'|'club'|'season'|'competition'|'int', descriptionHe }]
  answerHe    String   // answer template
  enabled     Boolean  @default(true)
  hits        Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@map("chat_saved_queries")
}
```

- Retention: one year (nightly cleanup); deleting an account nulls `userId`.
- Admin page `/admin/chat-questions`: frequent questions grouped by `normalized` with count, last SQL and
  answers; filter failed / 👎; cost today / this month; "pin as saved query" (owner edits the template and
  parameters, tests it, enables it); list of saved queries with hits.
- Seeded saved queries: player games / minutes / starts / sub appearances (career or season), player goals
  (career or season), club record vs opponent, club season finish.

## Out of scope (this phase)

- Text retrieval (RAG) over editorial, club pages, songs — phase 2.
- Fixing duplicate players league-wide — separate data project (improves answers as it lands).
- Fixing the top-flight NULL-competition games of 2011–15 — separate data fix (see memory match-analysis).
- Mobile chat UI changes beyond the 👍/👎 buttons (same API).

## Also in this work

- The Anthropic path in `src/lib/ai-providers.ts` is pinned to `claude-sonnet-4-20250514`, retired 2026-06-15;
  switching the provider to Anthropic would break the chat. Update it to `claude-sonnet-5-5` alongside.
