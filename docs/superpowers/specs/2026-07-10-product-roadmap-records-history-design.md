# StatsAI Product Roadmap — Records & History Flagship (Design)

**Date:** 2026-07-10
**Status:** Approved by product owner (all 3 sections)
**Scope:** 3-phase product roadmap; Phase 1 executed immediately, Phase 2 is the flagship, Phase 3 directional.

---

## 1. Context & Goals

StatsAI serves Israeli football fans on web (Next.js 14) and mobile (Expo/React Native, iOS live; Android in prep). Today the product serves the **casual fan** (scores, table, live). The owner's goal: evolve to **"both, in layers"** — a casual-first surface with real statistical depth one tap away.

The unique asset: **26 years of Israeli football data** — ~13,064 games (2000–2026), ~20k players, ~208k lineups and ~122k match events (2006+), standings, cups, coaches, referees, venues. Research confirmed no competitor presents this: the only existing Israeli all-time table (RSSSF) is plain text, frozen since Aug 2005.

## 2. Decisions Made

| Question | Decision |
|---|---|
| Audience | **C — both in layers**: casual-first surface, depth one tap away |
| Platform strategy | Backend + web first (zero friction); mobile screens via **Expo OTA** (no App Store review for JS-only changes); native changes batched for the next binary |
| Scope | **C — phased roadmap**: Phase 1 quick wins now → Phase 2 flagship → Phase 3 frontier |
| Flagship | **A — Records & History hub** (over B Hebrew-StatMuse and C feed-first home) |

**Why flagship A:** every live-score competitor (FotMob, Sofascore, Flashscore, 365Scores, OneFootball) leaves the same gap open — aggregated history (record books, all-time tables, full H2H archives, club encyclopedias). FotMob's league history stops at 2010/11; Sofascore has no champions timeline. B (NL stat answers) requires A's aggregation layer anyway → Phase 3. C (feed-first) attacks 365Scores where they're strongest and ignores the archive.

## 3. Research Summary (7 products benchmarked)

- **Commodity live core:** momentum graph, live player ratings, xG — all three big apps have them. We keep up, we don't compete there.
- **The open gap:** aggregated history. Nobody builds record books, all-time tables, full rivalry archives.
- **365Scores** owns the Israeli casual market (feed-first home). Don't fight them on feeds.
- **StatMuse** covers only top-5 leagues — Hebrew NL stat answers are wide open (Phase 3).
- **Cheapest retention feature found:** "On this day" + daily push (11v11's identity feature; we already have push infra).
- **Patterns to steal:** Transfermarkt's era-range filter + home/away all-time table; FotMob's club History tab (position-per-season chart, trophy cabinet, coach win-% table); FBref's season "spine" page and layered career totals (grand → per-club → per-season); 11v11's complete meeting lists; link-everything density (RSSSF has the data and feels dead because nothing links).

## 4. Phase 1 — Table-Stakes + Quick Wins (execute now)

All items independent; each ships when done. **No App Store review.** Web deploys immediately; mobile via OTA. One additive schema change only (§4.2's `notifyOnThisDay` user column — trivial `db push`, zero data risk); everything else touches no schema.

### 4.1 Mobile standings upgrade
- **Form guide:** last-5 chips (נ/ת/ה — green/gray/red) per team, computed from completed games.
- **Zone coloring + legend:** championship / Europe / relegation zones (extend existing zone bar, add legend).
- **Scope toggle:** הכל / בית / חוץ.
- **Backend:** `/api/mobile/v1/standings` gains `scope=all|home|away` param; response rows gain `form: string` (e.g. `"WWDLW"`, most-recent match LAST so chips read left-to-right oldest→newest in the RTL row; renderer decides display order). Home/away splits computed from games server-side (same derivation path as `standings-from-games`).
- **Mobile:** render chips + toggle in `(tabs)/standings.tsx`. OTA.

### 4.2 "היום לפני X שנים" (On This Day)
- **Service** (`src/lib/on-this-day.ts`): given a calendar day, return (a) the best anniversary match and (b) player birthdays.
  - Match selection heuristics, in priority order: cup final > title-decider (champion's clinching game) > derby (configurable club-pair list) > goals ≥ 5 > highest-goals match that day. Prefer round anniversaries (10/20/25 years) when available.
  - Birthdays: players with `dateOfBirth` matching the day, ordered by career games played, top 3.
- **Web:** card on homepage linking to the game page.
- **Mobile:** card on home feed (new payload field in `/api/mobile/v1/home`). OTA.
- **Push:** daily 09:00 cron calling a new `/api/cron/on-this-day` route (guarded by `x-cron-secret` header, consistent with notify-news) that sends one push to opted-in users via the existing Expo push pipeline. New user pref: additive column `notifyOnThisDay Boolean @default(true)` on `User` (follows the existing notifyGoals/notifyNews pattern) + an `onThisDay` key in the admin `push_categories` master switch. This is Phase 1's only schema change. **Cron install requires owner authorization at deploy time.**

### 4.3 "כל העונות" season spine page
- One row per season (2000/01 → current): champion, runner-up, top scorer (name + goals), relegated teams, link to that season's standings.
- **Data:** champions/runners-up from `Standing` (position 1–2, competition 383); top scorer from `Leaderboard` (TOP_SCORERS, rank 1); relegated = bottom-2 final positions (fallback: `descriptionHe`/`statusHe` containing ירידה where the season's relegation count differed).
- **Web:** `/history/seasons` page. **Mobile:** screen reachable from standings tab. New endpoint `/api/mobile/v1/history/seasons`. Every name links to its team/player page.

### 4.4 Mobile game page completion
- The mobile game endpoint **already returns** full event timeline, lineups, and comparison rows (verified in `mobile-details-api.ts`). Render the missing sections in `games/[id].tsx`: full event timeline (all events, not just goals) and lineups (starting XI + bench with jersey numbers). Pure OTA, zero backend work.

### 4.5 Basic search
- **Backend:** `/api/search?q=` — teams + players by name, Hebrew + English, case/quote-insensitive `contains` matching, grouped results, limit 10 per type. (Full universal search incl. coaches/referees/venues deferred.)
- **Web:** search box in the site header.
- **Mobile:** search input at the top of the players tab querying the same endpoint (via a mobile mirror route `/api/mobile/v1/search`). OTA.

## 5. Phase 2 — Flagship: Records & History Hub

Build order is strict: **club identity → aggregation services → pages.**

### 5.1 Club identity (foundation)
`Team` rows are per-season (≈26 rows per club). New service `src/lib/history/club-identity.ts`:
- Groups team rows into **club families** by normalized Hebrew name (same normalization the admin team editor's `teamKey` uses; reuse/extract, don't duplicate).
- API: `getClubFamilies()`, `getClubFamily(clubKey)` → `{ clubKey, nameHe, nameEn, logoUrl, teamIds: string[], seasons: [...] }`.
- No schema change. If name drift ever breaks grouping, a future `Club` table is the escape hatch (explicitly out of scope now).

### 5.2 Aggregation services (`src/lib/history/`)
Computed live from `Game`/`Standing` with SQL aggregates + 1-hour in-memory cache (pattern: module-level Map keyed by filter combo). ~13k games — measured cost is well under interactive budget.
- **All-time table:** filters seasonFrom/seasonTo, scope all|home|away, competition league|state-cup|toto|all. Columns: seasons, P, W, D, L, GF, GA, GD, Pts (3-pt era throughout — data starts 2000, no era conversion needed; state this on-page as a data note). Sortable by any column.
- **H2H:** for a club-family pair: aggregate W/D/L + goals, per-competition split, venue split, biggest win each way, full chronological meeting list (each row links to the game page).
- **Club history:** league position per season (for the position chart; relegation zone shading; championship seasons marked), trophy cabinet (championships = final position 1; cup titles derived from cup final wins), coach history (reuse `coach-timeline.ts`), historical squads per season (from rosters/lineups).

### 5.3 Records materialization (the one schema change)
Records require event-level scans (fastest goals, youngest/oldest scorers, streaks, biggest wins, hat-tricks, appearance/goal records). Precompute into a new table:

```prisma
model RecordEntry {
  id           String   @id @default(cuid())
  category     String   // e.g. "fastest_goal", "biggest_win", "longest_win_streak"
  scope        String   // "league" | "club:<clubKey>" | "competition:<id>"
  rank         Int
  valueNum     Float?   // sortable value (minute, goal count, streak length)
  labelHe      String   // display line, superlative-framed
  playerId     String?
  gameId       String?
  seasonYear   Int?
  metaJson     Json?
  computedAt   DateTime
  @@unique([category, scope, rank])
  @@index([scope, category])
}
```
- **Rebuild:** nightly script (`scripts/rebuild-records.js`) + admin "rebuild records" button. **Nightly cron requires owner authorization at deploy time.** Deploying Phase 2 requires one `prisma db push`.
- **Record categories (league-wide AND per-club):** biggest wins, longest win/unbeaten/scoring streaks, fastest goals, most goals in a game (team + player), youngest/oldest scorers, hat-tricks, most appearances, most career goals, most goals in a season, most clean sheets. Event-based categories carry the footnote: **"מבוסס נתוני אירועים מ-2006 ואילך"**.

### 5.4 Pages
**Web:** `/history` hub (entry cards: all-time table, records, rivalries, seasons); `/history/all-time` (filterable table); `/history/records` (+ records block inside each team page); `/h2h` index + `/h2h/[clubA]/[clubB]`; team page gains a **"היסטוריה" tab** (position chart, trophy cabinet, historical squads, coach table, club records); player page career upgrade — layered totals (career grand total → per-club subtotal → per-season rows).
**Mobile:** history hub screen, club history tab, rivalry screen — via OTA, backed by `/api/mobile/v1/history/*` endpoints mirroring the web services.

### 5.5 Honesty & density rules
1. Event-based records always show their coverage window (2006+). Standings/game records cover 2000+.
2. Every club/player/season mention on every history surface is a link. Superlative framing labels on records ("שיא מועדון", "לראשונה מאז 2009").

## 6. Phase 3 — Frontier (directional; each item gets its own spec when reached)
- **Hebrew stat answers:** ~20 query templates over Phase 2 aggregates; each answer a shareable card at its own URL (headline sentence + face + table — StatMuse anatomy).
- **Yearly personal recap** per favorite team (Sofascore-Wrapped pattern).
- **AI pre-match previews** in Hebrew via existing `ai-tools` infra (Flashscore's 2025 play).
- **Native batch:** home-screen widgets, iOS Live Activities, notification-preference upgrades — bundled into the next binary alongside the Android launch (one review cycle).

## 7. Delivery, Testing, Rollout
- **Shipping:** Phase 1 items ship independently (web deploy + OTA batches). Feature releases bump minor version (0.X.0) per project convention.
- **Testing:** Jest unit tests for every aggregation service (all-time math, H2H totals, form strings, record computations) — a wrong "record" destroys trust; history claims must be provably right. Spot-check records against known facts (championship years, famous derbies) before enabling pages.
- **SEO:** new web pages get Hebrew metadata (title/description/OG); records + rivalry pages are the organic-search magnets.
- **Constraints:** iOS keeps initials badges (`SHOW_TEAM_LOGOS` platform gate) — App Store compliance; all mobile Phase 1–2 work is JS-only (OTA-safe); cron installs (daily on-this-day push, nightly records rebuild) require explicit owner authorization at deploy time.
- **Success metrics:** push opt-in rate + daily opens (retention); history-page views (depth); organic landings on records/H2H pages (growth).

## 8. Out of Scope
- Feed-first home restructure (deliberately rejected — 365Scores' home turf).
- `Club` schema table (name-based grouping first; table only if grouping proves insufficient).
- Betting-oriented tables (Over/Under, HT/FT), fantasy, paid tiers — revisit after Phase 3.
- Pre-2000 data acquisition (RSSSF has 1949+; separate initiative if ever).
