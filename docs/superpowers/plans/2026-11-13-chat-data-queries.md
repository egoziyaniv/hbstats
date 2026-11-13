# Chat Over All the Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The site chat answers football questions over all our data by writing read-only SQL against a purpose-built `chat` schema, on `gpt-6-luna` with automatic escalation to `gpt-6.1-sol`, logging every question.

**Architecture:** Postgres views in schema `chat` (+ a `chat.club_map` table refreshed nightly) present games per team, goals, appearances with minutes, standings, players. A guard parses every model-written query with the real PostgreSQL parser (libpg-query 16.8.2) and allows a single SELECT over `chat.*` only; it runs in a READ ONLY transaction with a 5s timeout and a 200-row cap, as a dedicated `hbs_chat` role when `CHAT_DATABASE_URL` is set. The OpenAI path moves to the Responses API. Questions go to `ChatQuestion`; verified templates live in `ChatSavedQuery`.

**Tech Stack:** Next.js, Prisma 5 / PostgreSQL 16, openai 6.49 (Responses API), libpg-query 16.8.2, Jest.

Spec: `docs/superpowers/specs/2026-11-13-chat-data-queries-design.md`.

## File structure

| File | Responsibility |
|---|---|
| `scripts/chat/schema.sql` | `CREATE SCHEMA chat`, `chat.club_map` table, all `chat.*` views (idempotent: `CREATE OR REPLACE VIEW`) |
| `scripts/chat/apply-schema.ts` | runs schema.sql, refreshes `chat.club_map`, grants SELECT to `hbs_chat` when the role exists |
| `src/lib/chat-sql/guard.ts` | `checkSql(sql)` → `{ ok, sql } | { ok:false, reason }` (AST walk) |
| `src/lib/chat-sql/run.ts` | `runChatQuery(sql)` → rows/columns/truncated/ms (read-only tx, timeout, cap) |
| `src/lib/chat-sql/dictionary.ts` | data dictionary + coverage + worked examples (prompt text) |
| `src/lib/chat-sql/saved.ts` | saved-query match (luna) + parameter binding + execution |
| `src/lib/chat-sql/agent.ts` | Responses-API loop: tools runQuery/describeTable + existing six; escalation; usage/cost |
| `src/lib/chat-sql/log.ts` | `ChatQuestion` writes, normalisation, cost table |
| `src/app/api/ai/chat/route.ts` | uses agent + log; returns `{ reply, questionId }` |
| `src/app/api/ai/chat/feedback/route.ts` | 👍/👎 |
| `src/components/AiChat.tsx` | feedback buttons |
| `src/app/admin/chat-questions/page.tsx` + client | grouped questions, failures, cost, saved queries |
| `scripts/chat/eval.ts` + `scripts/chat/eval-questions.json` | eval run against luna |
| `prisma/schema.prisma` | `ChatQuestion`, `ChatSavedQuery` |

## Tasks

### Task 1: Model ids
- [ ] `src/lib/ai-providers.ts`: OpenAI default model → `gpt-6-luna`; Claude model `claude-sonnet-4-20250514` → `claude-sonnet-5-5` (retired model; adaptive thinking is default on Sonnet 5.5 — keep request otherwise unchanged, verify no `temperature`/`budget_tokens` sent).
- [ ] `scripts/transliterate-names.js`, `scripts/fetch-team-overviews.js`, `scripts/fetch-player-overviews.js`: `gpt-4o-mini` → `gpt-6-luna`; they use chat/completions — gpt-6-luna is a reasoning model, so send `max_completion_tokens` (not `max_tokens`) and `reasoning_effort: 'none'` (luna supports none).
- [ ] Commit.

### Task 2: `chat` schema (views)
- [ ] `scripts/chat/schema.sql` with views (column names snake_case, Hebrew-first):
  - `chat.club_map(team_id pk, club_key, club_he)` — table, filled by apply-schema from `getClubTeamIndex()` + HBS by nameHe.
  - `chat.seasons(season_year, season)`; `chat.competitions(competition_id, competition, type, is_league, tier)` (tier: 1 = comp_liga_haal, 2 = comp_liga_leumit, 3+ historical lower leagues, null cups).
  - `chat.games` (one row per completed game): game_id, date, season_year, season, competition_id, competition, round, home/away club_key + team_he, home_goals, away_goals, home_pens, away_pens, venue, attendance.
  - `chat.team_games` (two rows per game): game_id, date, season_year, season, competition_id, competition, is_league, tier, club_key, team, opponent_key, opponent, home, goals_for, goals_against, result ('W'/'D'/'L'), team_game_no (row_number over club_key order by date), team_season_league_game_no (over club_key, season_year, competition_id when is_league).
  - `chat.goals`: game_id, date, season_year, competition_id, club_key (benefiting side; event side via teamId → 'home'/'away' literal → nameEn), team, player_key (`coalesce(canonicalPlayerId, playerId)`), player (nameHe, else participantName), minute, penalty, own_goal.
  - `chat.player_appearances` (from lineup entries STARTER/SUBSTITUTE with playerId): game_id, date, season_year, competition_id, club_key, team, player_key, player, started, came_on (substitute with an on-minute), minute_on, minute_off, minutes (end = 120 when the game has extra time i.e. `homeScoreRegular` not null and differs, else 90; off = SUBSTITUTION_OUT minute for the player, or red card minute), shirt_no; goals/yellow/red counted from events by player key.
  - `chat.standings`: season_year, season, competition_id, competition, group_he, position, club_key, team, played, won, drawn, lost, goals_for, goals_against, points.
  - `chat.players`: player_key, player, player_en, birth_date, nationality, position (from the canonical row).
  - `chat.coverage`: static rows (kind, from_season, note_he).
- [ ] `scripts/chat/apply-schema.ts` (tsx): execute schema.sql, rebuild club_map in one transaction, `GRANT USAGE ON SCHEMA chat` + `GRANT SELECT ON ALL TABLES IN SCHEMA chat TO hbs_chat` when `pg_roles` has it.
- [ ] Run locally where possible; on prod via `npx tsx scripts/chat/apply-schema.ts`; spot-check: HBS 2026/27 team_games rows vs site; a known player's minutes.
- [ ] Commit.

### Task 3: SQL guard (TDD)
- [ ] Tests: allows SELECT/WITH over chat.*, window functions, subqueries, CTE names; rejects: INSERT/UPDATE/DELETE/DDL, multiple statements, non-chat tables (`public.users`, unqualified `users`), `pg_sleep`, `pg_read_file`, `set_config`, `dblink`, `lo_import`, `current_setting`, `SELECT INTO`, `FOR UPDATE`, `COPY`.
- [ ] Implement: `loadModule()` once; `parseSync`; exactly one stmt and it is `SelectStmt`; walk the AST: every `RangeVar` must have `schemaname === 'chat'` unless its relname is a CTE name defined in the same query; every `FuncCall` name must not match the deny list (`^pg_`, `dblink`, `lo_`, `set_config`, `current_setting`, `query_to_xml`, `xml`…); reject `intoClause`, `lockingClause`.
- [ ] Commit.

### Task 4: Runner
- [ ] `run.ts`: lazily create a second `PrismaClient` with `datasources.db.url = process.env.CHAT_DATABASE_URL ?? process.env.DATABASE_URL`; `$transaction(async tx => { SET TRANSACTION READ ONLY; SET LOCAL statement_timeout = '5s'; rows = $queryRawUnsafe(`SELECT * FROM (${sql}) q LIMIT 201`) })`; BigInt → Number, Date → ISO; return `{ columns, rows (≤200), truncated, ms }`; errors → `{ error }` with Postgres message only.
- [ ] `isChatSqlPublic()` = `!!process.env.CHAT_DATABASE_URL` (the role exists) — otherwise runQuery is offered only to ADMIN users.
- [ ] Commit.

### Task 5: Dictionary + prompt
- [ ] `dictionary.ts`: per view: columns with meaning; coverage table (standings 1949/50+, games 1950+ HBS / mostly 1990s+ others, all top-flight games complete 2020/21+, goals 1955+ mostly HBS before 2006, appearances 2009/10+); rules (club_key for clubs, Be'er Sheva = 'api-563'; player search by `player ILIKE`; duplicate-player rule; per-season breakdown for player totals; ask when ambiguous; state coverage when partial; never invent; Hebrew answers; links as `/games/<id>` `/players/<key>`); 8–10 worked examples incl. the 5-in-3 streak:

```sql
with g as (
  select club_key, team, game_id, date, team_game_no, goals_for >= 5 as big
  from chat.team_games),
runs as (
  select *, team_game_no - row_number() over (partition by club_key, big order by team_game_no) as grp
  from g where big)
select club_key, min(team) team, count(*) games, min(date) first_date, max(date) last_date
from runs group by club_key, grp having count(*) >= 3 order by games desc, first_date
```
- [ ] Commit.

### Task 6: Agent (Responses API) + escalation
- [ ] `agent.ts`: `answerQuestion({ messages, isAdmin }) → { reply, model, outcome, queries[], usage }`. Tools: `runQuery {sql}`, `describeTable {name}`, plus existing six (wrap `toolDefinitions` to Responses `FunctionTool`). Loop ≤ 8 rounds on `client.responses.create({ model, instructions, input, tools, reasoning: { effort: 'low' }, max_output_tokens: 4000 })`; append `response.output` items, then `function_call_output` per `function_call`. Track SQL errors; two runQuery errors or a sanity-check failure → restart once on `gpt-6.1-sol` (`reasoning.effort: 'medium'`), outcome `escalated`. Claude provider keeps the existing `chatWithClaude` path (no SQL tool in this phase).
- [ ] Unit tests with a mocked OpenAI client: tool loop, error → escalation, max rounds.
- [ ] Commit.

### Task 7: Log + saved queries + route
- [ ] Prisma models `ChatQuestion`, `ChatSavedQuery` (spec); `normalizeQuestion()`; `costUsd` from a price table (luna 0.10/0.50, sol 2/10 per 1M).
- [ ] `saved.ts`: if enabled saved queries exist, one short luna call (structured JSON: `{ id | null, params }`) → bind params as SQL parameters (`$1…` via `$queryRawUnsafe(sql, ...values)` after guard) → format `answerHe`; on no match fall through to the agent.
- [ ] Route: after quota → saved match → agent → log → `{ reply, questionId }`. Feedback route `POST /api/ai/chat/feedback {questionId, value}` (owner of the question only).
- [ ] `AiChat.tsx`: 👍/👎 under each assistant reply.
- [ ] Nightly cleanup (rows > 365 days) in the existing 04:30 rebuild cron script or a new `scripts/chat/cleanup.ts` cron; account deletion nulls `userId`.
- [ ] Seed saved queries: player games/starts/subs/minutes (career, season), player goals (career, season), club record vs opponent, club season finish.
- [ ] Commit.

### Task 8: Admin page
- [ ] `/admin/chat-questions`: tabs frequent (group by normalized, count, last answer, last SQL) / failed & 👎 / saved queries (list, enable/disable, hits, edit, test run) / cost (today, month); "pin as saved query" form prefilled from a question's SQL. Link in AdminShell nav under content.
- [ ] Commit.

### Task 9: Eval, deploy
- [ ] `scripts/chat/eval-questions.json` (~20 questions with expected answers computed by hand-written SQL), `scripts/chat/eval.ts` runs the agent per question, prints model used, pass/fail, cost.
- [ ] Version bump 0.59.0; deploy: `prisma db push`, `npx tsx scripts/chat/apply-schema.ts`, build, restart; crontab: nightly `apply-schema` (club map refresh) + cleanup; run eval on prod; report to the owner; owner creates `hbs_chat` role → set `CHAT_DATABASE_URL`, re-run apply-schema (grants), restart → public.
