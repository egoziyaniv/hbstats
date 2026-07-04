import prisma from '@/lib/prisma';
import { getCurrentSeasonStartYear } from '@/lib/home-live';

// ─── Tool Definitions (for AI provider) ───

export const toolDefinitions = [
  {
    name: 'searchPlayers',
    description: 'Search for players by name (Hebrew or English). Returns player id, name, team, position, season.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Player name to search (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Optional season year to filter (e.g. 2025)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'getPlayerEvents',
    description: 'Get match events for a player — goals, yellow cards, red cards, substitutions. Returns event type, minute, and match details.',
    parameters: {
      type: 'object' as const,
      properties: {
        playerId: { type: 'string', description: 'Player ID' },
        seasonYear: { type: 'number', description: 'Optional season year filter' },
        eventType: {
          type: 'string',
          description: 'Filter by event type',
          enum: ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION_IN', 'SUBSTITUTION_OUT', 'OWN_GOAL', 'PENALTY_GOAL'],
        },
      },
      required: ['playerId'],
    },
  },
  {
    name: 'searchGames',
    description: 'Search for games by team name, an optional opponent (for head-to-head), season, or date range. Returns match date, teams, scores, competition. For "team X vs team Y" pass teamName=X and opponentName=Y. A single date (dateFrom=dateTo) covers the whole day.',
    parameters: {
      type: 'object' as const,
      properties: {
        teamName: { type: 'string', description: 'Team name (Hebrew or English)' },
        opponentName: { type: 'string', description: 'Optional second team — returns only games between teamName and this team (either side home/away)' },
        seasonYear: { type: 'number', description: 'Season year' },
        dateFrom: { type: 'string', description: 'Start date (ISO format, e.g. 2025-08-01)' },
        dateTo: { type: 'string', description: 'End date (ISO format). For a single day, pass the same value as dateFrom.' },
      },
    },
  },
  {
    name: 'getStandings',
    description: 'Get the league standings table for a season. Position 1 is the champion. Defaults to ליגת העל (Israeli Premier League) — its winner holds the "אלופת המדינה" title. Pass league="NATIONAL" for ליגה לאומית (the second tier). Returns the competition name plus position, team, played, wins, draws, losses, goals for/against, diff, points.',
    parameters: {
      type: 'object' as const,
      properties: {
        seasonYear: { type: 'number', description: 'Season year (e.g. 2025)' },
        league: {
          type: 'string',
          enum: ['PREMIER', 'NATIONAL'],
          description: 'PREMIER = ליגת העל (top tier, "אלופת המדינה"; default). NATIONAL = ליגה לאומית (second tier).',
        },
      },
      required: ['seasonYear'],
    },
  },
  {
    name: 'getLeaderboard',
    description: 'Get leaderboard — top scorers, assists, yellow cards, red cards, substitutions in/out.',
    parameters: {
      type: 'object' as const,
      properties: {
        category: {
          type: 'string',
          description: 'Leaderboard category',
          enum: ['TOP_SCORERS', 'TOP_ASSISTS', 'TOP_YELLOW_CARDS', 'TOP_RED_CARDS', 'TOP_SUBSTITUTED_IN', 'TOP_SUBSTITUTED_OUT'],
        },
        seasonYear: { type: 'number', description: 'Season year' },
      },
      required: ['category'],
    },
  },
  {
    name: 'getTeamCardSummary',
    description: 'Per-team summary of yellow + red cards per player for the season. Returns each player with their yellow count and a status: SUSPENDED (just hit 5/9/13 milestone in latest matchday → next game banned), AT_RISK (count is 4/8/12 → next yellow triggers ban), or CLEAR. Use this to answer questions like "who is suspended" or "who is at risk of suspension" for a specific team.',
    input_schema: {
      type: 'object',
      properties: {
        teamName: { type: 'string', description: 'Team name (Hebrew or English)' },
        seasonYear: { type: 'number', description: 'Season year (defaults to most recent)' },
      },
      required: ['teamName'],
    },
  },
];

// ─── Tool Implementations ───

export async function searchPlayers(args: { name: string; seasonYear?: number }) {
  // Each player has one Player row per season. We dedupe by canonicalPlayerId
  // (falling back to id when canonical is null) and surface the most recent
  // season's row — otherwise the chatbot gets 10 stale records of the same
  // person and may pick one from 2016.
  const where: any = {
    OR: [
      { nameHe: { contains: args.name, mode: 'insensitive' } },
      { nameEn: { contains: args.name, mode: 'insensitive' } },
      { firstNameHe: { contains: args.name, mode: 'insensitive' } },
      { lastNameHe: { contains: args.name, mode: 'insensitive' } },
    ],
  };
  if (args.seasonYear) {
    where.team = { season: { year: args.seasonYear } };
  }

  const players = await prisma.player.findMany({
    where,
    include: {
      team: { select: { nameHe: true, nameEn: true, season: { select: { year: true } } } },
    },
    orderBy: [{ team: { season: { year: 'desc' } } }, { updatedAt: 'desc' }],
    take: 50,
  });

  const seen = new Set<string>();
  const deduped: typeof players = [];
  for (const p of players) {
    const key = p.canonicalPlayerId ?? p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(p);
    if (deduped.length >= 10) break;
  }

  // Aggregate stats across every Player row that shares the canonical id —
  // a season-specific row may show 0 yellows because the player moved teams
  // mid-season and his other half-of-the-year stats live on a different row.
  return Promise.all(
    deduped.map(async (p) => {
      const canonicalKey = p.canonicalPlayerId ?? p.id;
      const linked = await prisma.player.findMany({
        where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
        select: { id: true },
      });
      const linkedIds = linked.length > 0 ? linked.map((l) => l.id) : [p.id];
      const seasonFilter = args.seasonYear ? { season: { year: args.seasonYear } } : undefined;
      const agg = await prisma.playerStatistics.aggregate({
        where: { playerId: { in: linkedIds }, ...(seasonFilter ?? {}) },
        _sum: { goals: true, assists: true, yellowCards: true, redCards: true, gamesPlayed: true, minutesPlayed: true },
      });
      return {
        id: p.id,
        canonicalPlayerId: canonicalKey,
        nameHe: p.nameHe,
        nameEn: p.nameEn,
        position: p.position,
        team: p.team?.nameHe || p.team?.nameEn,
        season: p.team?.season?.year ?? null,
        stats: {
          goals: agg._sum.goals ?? 0,
          assists: agg._sum.assists ?? 0,
          yellowCards: agg._sum.yellowCards ?? 0,
          redCards: agg._sum.redCards ?? 0,
          gamesPlayed: agg._sum.gamesPlayed ?? 0,
          minutesPlayed: agg._sum.minutesPlayed ?? 0,
        },
      };
    }),
  );
}

export async function getPlayerEvents(args: { playerId: string; seasonYear?: number; eventType?: string }) {
  // Events are attached to season-specific Player rows. To answer questions
  // like "in which games did <player> get a yellow card" across his career,
  // gather every Player row linked to the same canonical entity and look up
  // events on all of them.
  const root = await prisma.player.findUnique({
    where: { id: args.playerId },
    select: { id: true, canonicalPlayerId: true },
  });
  const canonicalKey = root?.canonicalPlayerId ?? root?.id ?? args.playerId;
  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
    select: { id: true },
  });
  const playerIds = linked.length > 0 ? linked.map((p) => p.id) : [args.playerId];

  const where: any = { playerId: { in: playerIds } };
  if (args.eventType) {
    where.type = args.eventType;
  }
  if (args.seasonYear) {
    where.game = { season: { year: args.seasonYear } };
  }

  const events = await prisma.gameEvent.findMany({
    where,
    include: {
      game: {
        select: {
          dateTime: true,
          homeScore: true,
          awayScore: true,
          homeTeam: { select: { nameHe: true } },
          awayTeam: { select: { nameHe: true } },
          competition: { select: { nameHe: true } },
          season: { select: { year: true, name: true } },
        },
      },
    },
    orderBy: { game: { dateTime: 'desc' } },
    // Career queries need the full history — the system prompt promises "all
    // events across the career". 500 comfortably covers even 20-year veterans;
    // 50 silently truncated goal/appearance counts and produced wrong answers.
    take: 500,
  });

  return events.map((e) => ({
    type: e.type,
    minute: e.minute,
    extraMinute: e.extraMinute,
    date: e.game.dateTime.toISOString().split('T')[0],
    season: e.game.season?.name ?? null,
    match: `${e.game.homeTeam.nameHe} ${e.game.homeScore ?? '?'}-${e.game.awayScore ?? '?'} ${e.game.awayTeam.nameHe}`,
    competition: e.game.competition?.nameHe || '',
  }));
}

// Match a team by Hebrew or English name (case-insensitive substring).
function teamNameMatch(name: string) {
  return { OR: [{ nameHe: { contains: name, mode: 'insensitive' as const } }, { nameEn: { contains: name, mode: 'insensitive' as const } }] };
}

export async function searchGames(args: { teamName?: string; opponentName?: string; seasonYear?: number; dateFrom?: string; dateTo?: string }) {
  const where: any = {};

  if (args.teamName && args.opponentName) {
    // Head-to-head: match games between the two teams regardless of who is home.
    where.OR = [
      { AND: [{ homeTeam: teamNameMatch(args.teamName) }, { awayTeam: teamNameMatch(args.opponentName) }] },
      { AND: [{ homeTeam: teamNameMatch(args.opponentName) }, { awayTeam: teamNameMatch(args.teamName) }] },
    ];
  } else if (args.teamName) {
    where.OR = [{ homeTeam: teamNameMatch(args.teamName) }, { awayTeam: teamNameMatch(args.teamName) }];
  }
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }
  if (args.dateFrom || args.dateTo) {
    where.dateTime = {};
    if (args.dateFrom) where.dateTime.gte = new Date(args.dateFrom);
    if (args.dateTo) {
      // A date-only string (YYYY-MM-DD) parses to midnight UTC, which would
      // exclude same-day games kicking off later. Extend it to end of day.
      const to = new Date(args.dateTo);
      if (/^\d{4}-\d{2}-\d{2}$/.test(args.dateTo)) to.setUTCHours(23, 59, 59, 999);
      where.dateTime.lte = to;
    }
  }

  const games = await prisma.game.findMany({
    where,
    include: {
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
      competition: { select: { nameHe: true } },
      season: { select: { year: true } },
    },
    orderBy: { dateTime: 'desc' },
    take: 50,
  });

  return games.map((g) => ({
    id: g.id,
    date: g.dateTime.toISOString().split('T')[0],
    homeTeam: g.homeTeam.nameHe,
    awayTeam: g.awayTeam.nameHe,
    homeScore: g.homeScore,
    awayScore: g.awayScore,
    competition: g.competition?.nameHe || '',
    season: g.season.year,
  }));
}

// Stable API-Football competition ids for the two Israeli league tiers.
// This query is explicitly scoped to one league competition, so position 1 of a
// single tier is unambiguously that tier's champion ("אלופת המדינה" = ליגת העל).
const LEAGUE_API_IDS: Record<'PREMIER' | 'NATIONAL', number> = { PREMIER: 383, NATIONAL: 382 };

export async function getStandings(args: { seasonYear: number; league?: 'PREMIER' | 'NATIONAL' }) {
  const leagueApiId = LEAGUE_API_IDS[args.league ?? 'PREMIER'] ?? LEAGUE_API_IDS.PREMIER;

  const standings = await prisma.standing.findMany({
    where: { season: { year: args.seasonYear }, competition: { apiFootballId: leagueApiId } },
    include: { team: { select: { nameHe: true } }, competition: { select: { nameHe: true } } },
    take: 40,
  });

  // Report ADJUSTED points (base + pointsAdjustment, e.g. −8 deductions) and
  // re-rank by them, so the tool never quotes points that contradict the order
  // or names a pre-deduction leader as champion.
  const rows = standings
    .map((s) => ({
      team: s.team.nameHe,
      played: s.played,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      goalsFor: s.goalsFor,
      goalsAgainst: s.goalsAgainst,
      goalsDiff: s.goalsDiff,
      points: s.points + s.pointsAdjustment,
      pointsAdjustment: s.pointsAdjustment,
    }))
    .sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor)
    .map((r, i) => ({ position: i + 1, ...r }));

  return {
    competition: standings[0]?.competition?.nameHe ?? (args.league === 'NATIONAL' ? 'ליגה לאומית' : 'ליגת העל'),
    seasonYear: args.seasonYear,
    standings: rows,
  };
}

export async function getLeaderboard(args: { category: string; seasonYear?: number }) {
  const where: any = { category: args.category as any };
  if (args.seasonYear) {
    where.season = { year: args.seasonYear };
  }

  const entries = await prisma.competitionLeaderboardEntry.findMany({
    where,
    include: {
      season: { select: { year: true } },
    },
    orderBy: { rank: 'asc' },
    take: 20,
  });

  return entries.map((e) => ({
    rank: e.rank,
    playerName: e.playerNameHe || e.playerNameEn,
    teamName: e.teamNameHe || e.teamNameEn,
    value: e.value,
    gamesPlayed: e.gamesPlayed,
    season: e.season.year,
  }));
}

export async function getTeamCardSummary(args: { teamName: string; seasonYear?: number }) {
  // Resolve season. Default (no year) to the current season START year — NOT the
  // absolute newest row, which can be a not-yet-started/empty artifact season.
  const seasonRow = args.seasonYear
    ? await prisma.season.findFirst({ where: { year: args.seasonYear } })
    : await prisma.season.findFirst({ where: { year: { lte: getCurrentSeasonStartYear() } }, orderBy: { year: 'desc' } });
  if (!seasonRow) return { error: 'Season not found' };

  // Resolve team(s) by name in that season
  const teams = await prisma.team.findMany({
    where: {
      seasonId: seasonRow.id,
      OR: [
        { nameHe: { contains: args.teamName, mode: 'insensitive' } },
        { nameEn: { contains: args.teamName, mode: 'insensitive' } },
      ],
    },
    select: { id: true, nameHe: true, nameEn: true },
  });
  if (teams.length === 0) return { error: `No team matching "${args.teamName}" in ${args.seasonYear ?? seasonRow.year}` };

  const teamIds = teams.map((t) => t.id);

  // For each player on those teams, count yellow + red events across ALL competitions in this season
  const rows = await prisma.$queryRaw<Array<{
    playerId: string; nameHe: string; nameEn: string; yellow: number; red: number; lastYellow: Date | null;
  }>>`
    SELECT p.id AS "playerId", p."nameHe", p."nameEn",
      SUM(CASE WHEN ge.type = 'YELLOW_CARD' THEN 1 ELSE 0 END)::int AS yellow,
      SUM(CASE WHEN ge.type IN ('RED_CARD', 'YELLOW_RED_CARD') THEN 1 ELSE 0 END)::int AS red,
      MAX(CASE WHEN ge.type = 'YELLOW_CARD' THEN g."dateTime" END) AS "lastYellow"
    FROM players p
    LEFT JOIN game_events ge ON ge."playerId" = p.id
    LEFT JOIN games g ON g.id = ge."gameId" AND g."seasonId" = ${seasonRow.id}
    WHERE p."teamId" = ANY(${teamIds}::text[])
    GROUP BY p.id, p."nameHe", p."nameEn"
    HAVING SUM(CASE WHEN ge.type = 'YELLOW_CARD' THEN 1 ELSE 0 END) > 0
        OR SUM(CASE WHEN ge.type IN ('RED_CARD', 'YELLOW_RED_CARD') THEN 1 ELSE 0 END) > 0
    ORDER BY yellow DESC, red DESC
  `;

  // Latest yellow league-wide (within this season) for "matchday" cutoff
  const latestRow = await prisma.$queryRaw<Array<{ latest: Date | null }>>`
    SELECT MAX(g."dateTime") AS latest
    FROM game_events ge JOIN games g ON g.id = ge."gameId"
    WHERE ge.type = 'YELLOW_CARD' AND g."seasonId" = ${seasonRow.id}
  `;
  const latestTime = latestRow[0]?.latest ? +new Date(latestRow[0].latest) : 0;
  const cutoff = latestTime - 5 * 24 * 3600 * 1000;

  const players = rows.map((r) => {
    const lastTime = r.lastYellow ? +new Date(r.lastYellow) : 0;
    const inLatestMatchday = lastTime >= cutoff && latestTime > 0;
    let status: 'SUSPENDED' | 'AT_RISK' | 'CLEAR' = 'CLEAR';
    if ([5, 9, 13].includes(r.yellow) && inLatestMatchday) status = 'SUSPENDED';
    else if ([4, 8, 12].includes(r.yellow)) status = 'AT_RISK';
    return {
      playerId: r.playerId,
      name: r.nameHe || r.nameEn,
      yellow: r.yellow,
      red: r.red,
      lastYellowDate: r.lastYellow ? new Date(r.lastYellow).toISOString().slice(0, 10) : null,
      status,
    };
  });

  return {
    team: teams[0].nameHe || teams[0].nameEn,
    season: seasonRow.name,
    suspended: players.filter((p) => p.status === 'SUSPENDED'),
    atRisk: players.filter((p) => p.status === 'AT_RISK'),
    allPlayers: players,
  };
}

// ─── Tool Dispatcher ───

export async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await dispatchTool(name, args);
  // Temporary tracing: dump every tool call + truncated result so we can debug
  // wrong/empty responses from the chatbot in production logs.
  try {
    const summary = Array.isArray(result)
      ? `array(${result.length})`
      : typeof result === 'object' && result
        ? JSON.stringify(result).slice(0, 200)
        : String(result);
    console.log(`[ai-tool] ${name}(${JSON.stringify(args)}) → ${summary}`);
  } catch {}
  return result;
}

async function dispatchTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'searchPlayers':
      return searchPlayers(args as any);
    case 'getPlayerEvents':
      return getPlayerEvents(args as any);
    case 'searchGames':
      return searchGames(args as any);
    case 'getStandings':
      return getStandings(args as any);
    case 'getLeaderboard':
      return getLeaderboard(args as any);
    case 'getTeamCardSummary':
      return getTeamCardSummary(args as any);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
