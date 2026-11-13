-- The `chat` schema: the read-only analysis layer the site chat writes SQL against.
-- Rebuilt from scratch by scripts/chat/apply-schema.ts (DROP SCHEMA … CASCADE, then this file),
-- so every object here is created plainly. Heavy views are MATERIALIZED and refreshed by the
-- same script (cron). Views run with the owner's rights, so the hbs_chat role needs SELECT on
-- `chat` only — never on `public`.

CREATE SCHEMA chat;

-- Club identity across seasons (one Team row per season): filled by apply-schema.ts from
-- src/lib/history/club-identity.ts. Unmapped teams fall back to 'team-<id>'.
CREATE TABLE chat.club_map (
  team_id  text PRIMARY KEY,
  club_key text NOT NULL,
  club     text NOT NULL
);

CREATE VIEW chat.clubs AS
SELECT club_key, min(club) AS club, count(*) AS team_rows
FROM chat.club_map GROUP BY club_key;

CREATE VIEW chat.seasons AS
SELECT year AS season_year, year || '/' || lpad(((year + 1) % 100)::text, 2, '0') AS season
FROM public.seasons;

-- Competition data is uneven (wrong types, English names, two State Cup rows): normalise here.
CREATE VIEW chat.competitions AS
SELECT
  c.id AS competition_id,
  CASE c.id
    WHEN 'comp_state_cup' THEN 'גביע המדינה'
    WHEN 'cmpn90oj22b4v110i9ps978q8' THEN 'ליגה א'''
    ELSE coalesce(nullif(c."nameHe", ''), c."nameEn")
  END AS competition,
  CASE
    WHEN c.id IN ('comp_liga_haal', 'comp_liga_leumit', 'comp_hist_liga_alef', 'comp_hist_liga_bet',
                  'comp_hist_liga_gimel', 'comp_hist_liga_artzit', 'comp_hist_regional', 'cmpn90oj22b4v110i9ps978q8')
      THEN 'league'
    WHEN c.id IN ('comp_state_cup', 'cmrg732m70000mgbwu1hz5o1e') THEN 'state_cup'
    WHEN c.id LIKE 'comp_toto_cup%' OR c.id = 'comp_hist_toto_artzit' THEN 'toto_cup'
    WHEN c.id = 'comp_super_cup' THEN 'super_cup'
    WHEN c.type = 'EUROPE' THEN 'europe'
    WHEN c.id IN ('comp_friendlies', 'cmr2qvcx00000llcsxchtwoye') THEN 'friendly'
    WHEN c.id LIKE 'comp_playoffs%' OR c.id = 'comp_hist_test_matches' THEN 'playoff'
    ELSE 'other_cup'
  END AS kind,
  CASE
    WHEN c.id LIKE '%women%' THEN 'women'
    WHEN c.id LIKE 'comp_u19%' THEN 'youth'
    ELSE 'men'
  END AS category,
  c.id = 'comp_liga_haal' AS top_flight
FROM public.competitions c;

-- One row per completed game.
CREATE VIEW chat.games AS
SELECT
  g.id AS game_id,
  g."dateTime" AS date,
  s.year AS season_year,
  s.year || '/' || lpad(((s.year + 1) % 100)::text, 2, '0') AS season,
  g."competitionId" AS competition_id,
  coalesce(cc.competition, 'ללא מסגרת') AS competition,
  coalesce(cc.kind, 'unknown') AS competition_kind,
  coalesce(cc.category, 'men') AS category,
  coalesce(g."roundNameHe", g."roundNameEn") AS round,
  coalesce(hm.club_key, 'team-' || g."homeTeamId") AS home_key,
  coalesce(nullif(ht."nameHe", ''), ht."nameEn") AS home_team,
  coalesce(am.club_key, 'team-' || g."awayTeamId") AS away_key,
  coalesce(nullif(at."nameHe", ''), at."nameEn") AS away_team,
  g."homeScore" AS home_goals,
  g."awayScore" AS away_goals,
  g."homePenalty" AS home_pens,
  g."awayPenalty" AS away_pens,
  (g."homePenalty" IS NOT NULL
    OR (g."homeScoreRegular" IS NOT NULL AND (g."homeScoreRegular" <> g."homeScore" OR g."awayScoreRegular" <> g."awayScore"))) AS extra_time,
  coalesce(nullif(v."nameHe", ''), g."venueNameHe", g."venueNameEn") AS venue,
  g.attendance
FROM public.games g
JOIN public.seasons s ON s.id = g."seasonId"
JOIN public.teams ht ON ht.id = g."homeTeamId"
JOIN public.teams at ON at.id = g."awayTeamId"
LEFT JOIN chat.competitions cc ON cc.competition_id = g."competitionId"
LEFT JOIN chat.club_map hm ON hm.team_id = g."homeTeamId"
LEFT JOIN chat.club_map am ON am.team_id = g."awayTeamId"
LEFT JOIN public.venues v ON v.id = g."venueId"
WHERE g.status = 'COMPLETED' AND g."homeScore" IS NOT NULL AND g."awayScore" IS NOT NULL;

-- Two rows per game, one from each club's side, with running game numbers for streak questions.
CREATE MATERIALIZED VIEW chat.team_games AS
WITH sides AS (
  SELECT game_id, date, season_year, season, competition_id, competition, competition_kind, category, round,
         home_key AS club_key, home_team AS team, away_key AS opponent_key, away_team AS opponent, true AS home,
         home_goals AS goals_for, away_goals AS goals_against, home_pens AS pens_for, away_pens AS pens_against, extra_time
  FROM chat.games
  UNION ALL
  SELECT game_id, date, season_year, season, competition_id, competition, competition_kind, category, round,
         away_key, away_team, home_key, home_team, false,
         away_goals, home_goals, away_pens, home_pens, extra_time
  FROM chat.games
)
SELECT
  sides.*,
  CASE WHEN goals_for > goals_against THEN 'W' WHEN goals_for = goals_against THEN 'D' ELSE 'L' END AS result,
  row_number() OVER (PARTITION BY club_key ORDER BY date, game_id) AS team_game_no,
  row_number() OVER (PARTITION BY club_key, season_year, competition_id ORDER BY date, game_id) AS team_competition_game_no
FROM sides;
CREATE INDEX ON chat.team_games (club_key, team_game_no);
CREATE INDEX ON chat.team_games (season_year);

-- Event side: teamId first, then the literal 'home'/'away', then the team's English name.
CREATE VIEW chat.events AS
SELECT
  e.id AS event_id,
  e."gameId" AS game_id,
  e.type::text AS type,
  e.minute,
  e."extraMinute" AS extra_minute,
  e."playerId" AS player_id,
  e."relatedPlayerId" AS related_player_id,
  e."participantName" AS participant_name,
  CASE
    WHEN e."teamId" = g."homeTeamId" THEN 'home'
    WHEN e."teamId" = g."awayTeamId" THEN 'away'
    WHEN e.team IN ('home', 'away') THEN e.team
    WHEN e.team = ht."nameEn" THEN 'home'
    WHEN e.team = at."nameEn" THEN 'away'
  END AS side
FROM public.game_events e
JOIN public.games g ON g.id = e."gameId"
JOIN public.teams ht ON ht.id = g."homeTeamId"
JOIN public.teams at ON at.id = g."awayTeamId";

-- One row per goal; own goals are credited to the side that benefited.
CREATE MATERIALIZED VIEW chat.goals AS
SELECT
  ev.event_id AS goal_id,
  gm.game_id, gm.date, gm.season_year, gm.season, gm.competition_id, gm.competition, gm.competition_kind, gm.category,
  CASE ev.side WHEN 'home' THEN gm.home_key ELSE gm.away_key END AS club_key,
  CASE ev.side WHEN 'home' THEN gm.home_team ELSE gm.away_team END AS team,
  CASE ev.side WHEN 'home' THEN gm.away_key ELSE gm.home_key END AS opponent_key,
  CASE ev.side WHEN 'home' THEN gm.away_team ELSE gm.home_team END AS opponent,
  CASE WHEN ev.type = 'OWN_GOAL' THEN NULL ELSE coalesce(p."canonicalPlayerId", p.id) END AS player_key,
  CASE WHEN ev.type = 'OWN_GOAL' THEN NULL
       ELSE coalesce(nullif(cp."nameHe", ''), nullif(p."nameHe", ''), p."nameEn", ev.participant_name) END AS player,
  ev.minute,
  ev.extra_minute,
  ev.type = 'PENALTY_GOAL' AS penalty,
  ev.type = 'OWN_GOAL' AS own_goal
FROM chat.events ev
JOIN chat.games gm ON gm.game_id = ev.game_id
LEFT JOIN public.players p ON p.id = ev.player_id
LEFT JOIN public.players cp ON cp.id = p."canonicalPlayerId"
WHERE ev.type IN ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL') AND ev.side IS NOT NULL;
CREATE INDEX ON chat.goals (player_key);
CREATE INDEX ON chat.goals (club_key, season_year);

-- One row per player per game they were in the squad for (lineups exist from 2009/10).
CREATE MATERIALIZED VIEW chat.player_appearances AS
WITH ev AS (
  SELECT "gameId" AS game_id, "playerId" AS pid,
    min(minute) FILTER (WHERE type = 'SUBSTITUTION_OUT') AS off_sub,
    min(minute) FILTER (WHERE type IN ('RED_CARD', 'YELLOW_RED_CARD')) AS off_red,
    min(minute) FILTER (WHERE type = 'SUBSTITUTION_IN') AS on_in,
    count(*) FILTER (WHERE type IN ('GOAL', 'PENALTY_GOAL')) AS goals,
    count(*) FILTER (WHERE type = 'ASSIST') AS assists,
    count(*) FILTER (WHERE type = 'YELLOW_CARD') AS yellow,
    count(*) FILTER (WHERE type IN ('RED_CARD', 'YELLOW_RED_CARD')) AS red
  FROM public.game_events WHERE "playerId" IS NOT NULL GROUP BY 1, 2
),
came AS (
  -- a SUBSTITUTION_OUT event names who went off (playerId) and who came on (relatedPlayerId)
  SELECT "gameId" AS game_id, "relatedPlayerId" AS pid, min(minute) AS on_min
  FROM public.game_events WHERE type = 'SUBSTITUTION_OUT' AND "relatedPlayerId" IS NOT NULL GROUP BY 1, 2
),
base AS (
  SELECT
    gm.game_id, gm.date, gm.season_year, gm.season, gm.competition_id, gm.competition, gm.competition_kind, gm.category,
    coalesce(cm.club_key, 'team-' || l."teamId") AS club_key,
    coalesce(nullif(t."nameHe", ''), t."nameEn") AS team,
    coalesce(p."canonicalPlayerId", p.id) AS player_key,
    coalesce(nullif(cp."nameHe", ''), nullif(p."nameHe", ''), p."nameEn", l."participantName") AS player,
    l.role = 'STARTER' AS started,
    l."jerseyNumber" AS shirt_no,
    CASE WHEN gm.extra_time THEN 120 ELSE 90 END AS full_time,
    CASE WHEN l.role = 'STARTER' THEN 0 ELSE coalesce(came.on_min, ev.on_in) END AS minute_on,
    least(ev.off_sub, ev.off_red) AS minute_off,
    coalesce(ev.goals, 0) AS goals,
    coalesce(ev.assists, 0) AS assists,
    coalesce(ev.yellow, 0) AS yellow,
    coalesce(ev.red, 0) AS red
  FROM public.game_lineup_entries l
  JOIN chat.games gm ON gm.game_id = l."gameId"
  JOIN public.teams t ON t.id = l."teamId"
  JOIN public.players p ON p.id = l."playerId"
  LEFT JOIN public.players cp ON cp.id = p."canonicalPlayerId"
  LEFT JOIN chat.club_map cm ON cm.team_id = l."teamId"
  LEFT JOIN ev ON ev.game_id = l."gameId" AND ev.pid = l."playerId"
  LEFT JOIN came ON came.game_id = l."gameId" AND came.pid = l."playerId"
  WHERE l.role IN ('STARTER', 'SUBSTITUTE')
)
SELECT
  game_id, date, season_year, season, competition_id, competition, competition_kind, category,
  club_key, team, player_key, player, started,
  (NOT started AND minute_on IS NOT NULL) AS came_on,
  (started OR minute_on IS NOT NULL) AS played,
  minute_on,
  CASE WHEN started OR minute_on IS NOT NULL THEN least(coalesce(minute_off, full_time), full_time) END AS minute_off,
  CASE WHEN started OR minute_on IS NOT NULL
       THEN greatest(0, least(coalesce(minute_off, full_time), full_time) - coalesce(minute_on, 0)) ELSE 0 END AS minutes,
  goals, assists, yellow, red, shirt_no
FROM base;
CREATE INDEX ON chat.player_appearances (player_key);
CREATE INDEX ON chat.player_appearances (club_key, season_year);

CREATE VIEW chat.standings AS
SELECT
  s.year AS season_year,
  s.year || '/' || lpad(((s.year + 1) % 100)::text, 2, '0') AS season,
  st."competitionId" AS competition_id,
  cc.competition,
  nullif(st."groupNameHe", '') AS group_name,
  st.position,
  coalesce(cm.club_key, 'team-' || st."teamId") AS club_key,
  coalesce(nullif(t."nameHe", ''), t."nameEn") AS team,
  st.played, st.wins AS won, st.draws AS drawn, st.losses AS lost,
  st."goalsFor" AS goals_for, st."goalsAgainst" AS goals_against, st.points,
  st."pointsAdjustment" AS points_adjustment
FROM public.standings st
JOIN public.seasons s ON s.id = st."seasonId"
JOIN public.teams t ON t.id = st."teamId"
LEFT JOIN chat.competitions cc ON cc.competition_id = st."competitionId"
LEFT JOIN chat.club_map cm ON cm.team_id = st."teamId";

-- One row per player key (canonical rows and rows with no canonical link).
CREATE VIEW chat.players AS
SELECT
  p.id AS player_key,
  coalesce(nullif(p."nameHe", ''), p."nameEn") AS player,
  p."nameEn" AS player_en,
  p."birthDate"::date AS birth_date,
  coalesce(p."nationalityHe", p."nationalityEn") AS nationality,
  p.position
FROM public.players p
WHERE p."canonicalPlayerId" IS NULL;

CREATE TABLE chat.coverage (kind text, from_season text, note text);
INSERT INTO chat.coverage VALUES
  ('standings', '1949/50', 'טבלאות כל הליגות שיש לנו'),
  ('games_beer_sheva', '1950/51', 'כמעט כל משחקי הפועל באר שבע'),
  ('games_top_flight_complete', '2020/21', 'כל משחקי הליגה הבכירה מלאים רק מעונה זו; לפניה חלקי'),
  ('games_other_clubs', '1990/91', 'משחקי שאר הקבוצות בעיקר משנות ה-90 והלאה'),
  ('goals', '1955/56', 'כובשים: לפני 2006 בעיקר משחקי באר שבע'),
  ('appearances_minutes', '2009/10', 'הרכבים, חילופים ודקות משחק');
