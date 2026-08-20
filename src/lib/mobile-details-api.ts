import { getCompetitionDisplayName, getGameScoreDisplay, getRoundDisplayName } from '@/lib/competition-display';
import { derivePlayerDeepStats, deriveTeamDeepStats } from '@/lib/deep-stats';
import { getEventDisplayLabel } from '@/lib/event-display';
import { formatPlayerName } from '@/lib/player-display';
import { buildPlayerTrophies } from '@/lib/player-trophies';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import { buildStandingsFromGames, shouldDeriveStandings } from '@/lib/standings-from-games';

type PlayerGameFilter = 'all' | 'starts' | 'bench' | 'sub-in' | 'sub-off';

function getTeamLabel(team: { nameHe: string | null; nameEn: string }) {
  return team.nameHe || team.nameEn;
}

function formatHeDate(date: Date, withTime = false) {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    ...(withTime ? { timeStyle: 'short' } : {}),
  }).format(date);
}

function getOpponentName(
  game: { homeTeamId: string; awayTeamId: string; homeTeam: { nameHe: string | null; nameEn: string }; awayTeam: { nameHe: string | null; nameEn: string } },
  teamId: string
) {
  return game.homeTeamId === teamId ? getTeamLabel(game.awayTeam) : getTeamLabel(game.homeTeam);
}

function getTeamResult(game: { homeTeamId: string; homeScore: number | null; awayScore: number | null }, teamId: string) {
  const homeScore = game.homeScore ?? 0;
  const awayScore = game.awayScore ?? 0;
  const diff = game.homeTeamId === teamId ? homeScore - awayScore : awayScore - homeScore;
  if (diff > 0) return 'W';
  if (diff < 0) return 'L';
  return 'D';
}

function formatPercent(value: number | null) {
  return value === null ? '-' : `${value}%`;
}

function formatNumber(value: number | null) {
  return value === null ? '-' : String(value);
}

function eventMinute(event: { minute: number; extraMinute: number | null }) {
  return event.minute + Math.max(event.extraMinute || 0, 0);
}

function normalizeGameFilter(value: string | undefined): PlayerGameFilter {
  if (value === 'starts' || value === 'bench' || value === 'sub-in' || value === 'sub-off') {
    return value;
  }

  return 'all';
}

function buildEventSummary(
  game: {
    homeTeamId: string;
    awayTeamId: string;
    homeScore: number | null;
    awayScore: number | null;
    events: Array<{ teamId: string | null; type: string }>;
  }
) {
  const countEvents = (teamId: string, types: string[]) =>
    game.events.filter((event) => event.teamId === teamId && types.includes(event.type)).length;

  return {
    homeGoals: game.homeScore ?? countEvents(game.homeTeamId, ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']),
    awayGoals: game.awayScore ?? countEvents(game.awayTeamId, ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL']),
    homeYellowCards: countEvents(game.homeTeamId, ['YELLOW_CARD']),
    awayYellowCards: countEvents(game.awayTeamId, ['YELLOW_CARD']),
    homeRedCards: countEvents(game.homeTeamId, ['RED_CARD']),
    awayRedCards: countEvents(game.awayTeamId, ['RED_CARD']),
    homeSubstitutions: countEvents(game.homeTeamId, ['SUBSTITUTION_IN']),
    awaySubstitutions: countEvents(game.awayTeamId, ['SUBSTITUTION_IN']),
  };
}

function buildComparisonRows(
  stats:
    | {
        homeTeamPossession: number | null;
        awayTeamPossession: number | null;
        homeShotsOnTarget: number | null;
        awayShotsOnTarget: number | null;
        homeShotsTotal: number | null;
        awayShotsTotal: number | null;
        homeCorners: number | null;
        awayCorners: number | null;
        homeFouls: number | null;
        awayFouls: number | null;
        homeOffsides: number | null;
        awayOffsides: number | null;
        homeYellowCards: number | null;
        awayYellowCards: number | null;
        homeRedCards: number | null;
        awayRedCards: number | null;
      }
    | null,
  eventSummary: ReturnType<typeof buildEventSummary>
) {
  return [
    {
      label: 'אחזקת כדור',
      homeValue: stats?.homeTeamPossession ?? null,
      awayValue: stats?.awayTeamPossession ?? null,
      homeDisplay: formatPercent(stats?.homeTeamPossession ?? null),
      awayDisplay: formatPercent(stats?.awayTeamPossession ?? null),
    },
    {
      label: 'בעיטות למסגרת',
      homeValue: stats?.homeShotsOnTarget ?? null,
      awayValue: stats?.awayShotsOnTarget ?? null,
      homeDisplay: formatNumber(stats?.homeShotsOnTarget ?? null),
      awayDisplay: formatNumber(stats?.awayShotsOnTarget ?? null),
    },
    {
      label: 'בעיטות',
      homeValue: stats?.homeShotsTotal ?? null,
      awayValue: stats?.awayShotsTotal ?? null,
      homeDisplay: formatNumber(stats?.homeShotsTotal ?? null),
      awayDisplay: formatNumber(stats?.awayShotsTotal ?? null),
    },
    {
      label: 'קרנות',
      homeValue: stats?.homeCorners ?? null,
      awayValue: stats?.awayCorners ?? null,
      homeDisplay: formatNumber(stats?.homeCorners ?? null),
      awayDisplay: formatNumber(stats?.awayCorners ?? null),
    },
    {
      label: 'עבירות',
      homeValue: stats?.homeFouls ?? null,
      awayValue: stats?.awayFouls ?? null,
      homeDisplay: formatNumber(stats?.homeFouls ?? null),
      awayDisplay: formatNumber(stats?.awayFouls ?? null),
    },
    {
      label: 'נבדלים',
      homeValue: stats?.homeOffsides ?? null,
      awayValue: stats?.awayOffsides ?? null,
      homeDisplay: formatNumber(stats?.homeOffsides ?? null),
      awayDisplay: formatNumber(stats?.awayOffsides ?? null),
    },
    {
      label: 'צהובים',
      homeValue: stats?.homeYellowCards ?? eventSummary.homeYellowCards,
      awayValue: stats?.awayYellowCards ?? eventSummary.awayYellowCards,
      homeDisplay: formatNumber(stats?.homeYellowCards ?? eventSummary.homeYellowCards),
      awayDisplay: formatNumber(stats?.awayYellowCards ?? eventSummary.awayYellowCards),
    },
    {
      label: 'אדומים',
      homeValue: stats?.homeRedCards ?? eventSummary.homeRedCards,
      awayValue: stats?.awayRedCards ?? eventSummary.awayRedCards,
      homeDisplay: formatNumber(stats?.homeRedCards ?? eventSummary.homeRedCards),
      awayDisplay: formatNumber(stats?.awayRedCards ?? eventSummary.awayRedCards),
    },
  ];
}

function mapLineupPlayer(entry: {
  id: string;
  participantName: string | null;
  positionName: string | null;
  positionGrid: string | null;
  jerseyNumber: number | null;
  rating: number | null;
  player: {
    nameHe: string;
    nameEn: string;
    firstNameHe?: string | null;
    lastNameHe?: string | null;
    firstNameEn?: string | null;
    lastNameEn?: string | null;
  } | null;
}) {
  return {
    id: entry.id,
    displayName: entry.player ? formatPlayerName(entry.player) : entry.participantName || 'שחקן',
    positionName: entry.positionName,
    positionGrid: entry.positionGrid,
    jerseyNumber: entry.jerseyNumber,
    rating: entry.rating ?? null,
  };
}

function buildTeamLineup(
  game: {
    lineupEntries: Array<{
      id: string;
      role: 'STARTER' | 'SUBSTITUTE' | 'COACH';
      participantName: string | null;
      formation: string | null;
      positionName: string | null;
      positionGrid: string | null;
      jerseyNumber: number | null;
      rating: number | null;
      player: {
        nameHe: string;
        nameEn: string;
        firstNameHe?: string | null;
        lastNameHe?: string | null;
        firstNameEn?: string | null;
        lastNameEn?: string | null;
      } | null;
      teamId: string;
    }>;
  },
  teamId: string
) {
  const entries = game.lineupEntries.filter((entry) => entry.teamId === teamId);
  const starters = entries.filter((entry) => entry.role === 'STARTER').map(mapLineupPlayer);
  const substitutes = entries.filter((entry) => entry.role === 'SUBSTITUTE').map(mapLineupPlayer);
  const coach = entries.find((entry) => entry.role === 'COACH');
  const formation = entries.find((entry) => entry.formation)?.formation || null;

  return {
    formation,
    coachName: coach?.participantName || null,
    starters,
    substitutes,
  };
}

function buildFormationRows(
  starters: Array<{ id: string; displayName: string; jerseyNumber: number | null; positionName: string | null; positionGrid: string | null }>,
  side: 'home' | 'away'
) {
  const grouped = new Map<number, typeof starters>();

  for (const player of starters) {
    const row = Number(player.positionGrid?.split(':')[0] || 0);
    const existing = grouped.get(row) || [];
    existing.push(player);
    grouped.set(row, existing);
  }

  const sortedRows = Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, players]) =>
      [...players].sort((a, b) => {
        const aCol = Number(a.positionGrid?.split(':')[1] || 0);
        const bCol = Number(b.positionGrid?.split(':')[1] || 0);
        return side === 'home' ? aCol - bCol : bCol - aCol;
      })
    );

  return side === 'home' ? sortedRows : [...sortedRows].reverse();
}

function buildPlayerGameRow(
  player: { id: string; team: { season: { name: string } } },
  game: {
    id: string;
    dateTime: Date;
    homeScore: number | null;
    awayScore: number | null;
    competition: { nameHe: string | null; nameEn: string } | null;
    homeTeam: { nameHe: string | null; nameEn: string };
    awayTeam: { nameHe: string | null; nameEn: string };
    events: Array<{
      minute: number;
      extraMinute: number | null;
      type: string;
      playerId: string | null;
      relatedPlayerId: string | null;
    }>;
    lineupEntries: Array<{
      playerId: string | null;
      role: 'STARTER' | 'SUBSTITUTE' | 'COACH';
    }>;
  }
) {
  const playerLineups = game.lineupEntries.filter((entry) => entry.playerId === player.id);
  const isStarter = playerLineups.some((entry) => entry.role === 'STARTER');
  const onBench = playerLineups.some((entry) => entry.role === 'SUBSTITUTE');
  const subInEvent = game.events
    .filter((event) => (event.type === 'SUBSTITUTION_IN' || event.type === 'SUBSTITUTION_OUT') && event.relatedPlayerId === player.id)
    .sort((left, right) => eventMinute(left) - eventMinute(right))[0];
  const subOffEvent = game.events
    .filter((event) => (event.type === 'SUBSTITUTION_IN' || event.type === 'SUBSTITUTION_OUT') && event.playerId === player.id)
    .sort((left, right) => eventMinute(left) - eventMinute(right))[0];
  const goals = game.events.filter((event) => event.playerId === player.id && (event.type === 'GOAL' || event.type === 'PENALTY_GOAL')).length;
  const assists = game.events.filter((event) => event.relatedPlayerId === player.id && (event.type === 'GOAL' || event.type === 'PENALTY_GOAL')).length;
  const yellowCards = game.events.filter((event) => event.playerId === player.id && event.type === 'YELLOW_CARD').length;
  const redCards = game.events.filter((event) => event.playerId === player.id && event.type === 'RED_CARD').length;

  if (!isStarter && !onBench && !subInEvent && !subOffEvent && !goals && !assists && !yellowCards && !redCards) {
    return null;
  }

  const homeName = game.homeTeam.nameHe || game.homeTeam.nameEn;
  const awayName = game.awayTeam.nameHe || game.awayTeam.nameEn;
  const scoreLabel = game.homeScore === null || game.awayScore === null ? '-' : `${game.homeScore}:${game.awayScore}`;
  const startMinute = isStarter ? 0 : subInEvent ? eventMinute(subInEvent) : null;
  const endMinute = subOffEvent ? eventMinute(subOffEvent) : isStarter || subInEvent ? 90 : null;
  const wasSubbedIn = Boolean(subInEvent);
  const wasSubbedOff = Boolean(subOffEvent);

  return {
    playerId: player.id,
    gameId: game.id,
    dateTime: game.dateTime.toISOString(),
    displayDate: formatHeDate(game.dateTime),
    seasonName: player.team.season.name,
    competitionName: game.competition?.nameHe || game.competition?.nameEn || '-',
    matchLabel: `${homeName} - ${awayName}`,
    scoreLabel,
    squadRoleLabel: isStarter ? 'פתח' : onBench || wasSubbedIn ? 'נרשם כמחליף' : 'לא ידוע',
    enteredMinuteLabel: wasSubbedIn ? String(eventMinute(subInEvent)) : isStarter ? '0' : '-',
    exitedMinuteLabel: wasSubbedOff ? String(eventMinute(subOffEvent)) : '-',
    minutesLabel: startMinute === null || endMinute === null ? '-' : `${startMinute}-${endMinute}`,
    isStarter,
    onBench,
    wasSubbedIn,
    wasSubbedOff,
    goals,
    assists,
    yellowCards,
    redCards,
  };
}

function matchesGameFilter(
  row: Exclude<ReturnType<typeof buildPlayerGameRow>, null>,
  filter: PlayerGameFilter
) {
  if (filter === 'starts') return row.isStarter;
  if (filter === 'bench') return row.onBench;
  if (filter === 'sub-in') return row.wasSubbedIn;
  if (filter === 'sub-off') return row.wasSubbedOff;
  return true;
}

export async function getMobileTeamPayload(teamId: string) {
  // Each season has its own Team row, so an old URL (e.g. a 2017 Beer Sheva
  // record) routes to a stale, empty page. Resolve to the most-recent season's
  // Team row that matches the same canonical key (apiFootballId first, then
  // nameHe + nameEn). Falls back to the requested id if no newer record exists.
  const requested = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, seasonId: true, apiFootballId: true, nameHe: true, nameEn: true, aiSummary: true, wikiInfo: true, season: { select: { year: true } } },
  });
  const latestSeason = await prisma.season.findFirst({ orderBy: { year: 'desc' } });
  let resolvedTeamId = teamId;
  if (requested && latestSeason && requested.seasonId !== latestSeason.id) {
    const newer = await prisma.team.findFirst({
      where: {
        seasonId: latestSeason.id,
        OR: [
          requested.apiFootballId !== null
            ? { apiFootballId: requested.apiFootballId }
            : { id: '__never__' },
          { nameHe: requested.nameHe, nameEn: requested.nameEn },
        ],
      },
      select: { id: true },
    });
    if (newer) resolvedTeamId = newer.id;
  }

  const team = await prisma.team.findUnique({
    where: { id: resolvedTeamId },
    include: {
      players: {
        orderBy: [{ jerseyNumber: 'asc' }, { nameHe: 'asc' }, { nameEn: 'asc' }],
        take: 40,
        include: {
          uploads: {
            orderBy: [{ createdAt: 'asc' }],
          },
          playerStats: {
            where: { seasonId: { not: null } },
          },
        },
      },
      standings: true,
      teamStats: true,
      coachAssignments: {
        orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      },
      uploads: {
        orderBy: [{ createdAt: 'asc' }],
      },
      season: true,
    },
  });

  if (!team) return null;

  const now = new Date();
  const [seasonStandings, teamGames] = await Promise.all([
    prisma.standing.findMany({
      where: { seasonId: team.seasonId },
      include: { team: true },
      orderBy: [{ position: 'asc' }, { points: 'desc' }],
    }),
    prisma.game.findMany({
      where: {
        seasonId: team.seasonId,
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: true,
        prediction: true,
        events: {
          select: {
            minute: true,
            extraMinute: true,
            type: true,
            playerId: true,
            relatedPlayerId: true,
            teamId: true,
          },
        },
        lineupEntries: {
          select: {
            playerId: true,
            role: true,
            teamId: true,
          },
        },
        gameStats: {
          select: {
            homeTeamPossession: true,
            awayTeamPossession: true,
            homeShotsOnTarget: true,
            awayShotsOnTarget: true,
            homeShotsTotal: true,
            awayShotsTotal: true,
            homeCorners: true,
            awayCorners: true,
            homeFouls: true,
            awayFouls: true,
            homeOffsides: true,
            awayOffsides: true,
            homeYellowCards: true,
            awayYellowCards: true,
            homeRedCards: true,
            awayRedCards: true,
          },
        },
      },
      orderBy: { dateTime: 'desc' },
    }),
  ]);

  // Restrict the standings context to the team's primary league competition.
  // `seasonStandings` mixes Ligat Ha'al + Leumit + state cup tables, so
  // without this filter the "around" rows on a Hapoel Beer Sheva page can
  // include second-tier teams from Leumit. Pick the team's own row's
  // competitionId — prefer the one with the highest played count (= league)
  // when the team has multiple competition entries.
  const ownStandings = seasonStandings.filter((row) => row.teamId === team.id);
  const primaryStandingCompId =
    ownStandings.length > 0
      ? ownStandings.reduce((a, b) => (b.played > a.played ? b : a)).competitionId
      : null;
  const competitionFilteredStandings = primaryStandingCompId
    ? seasonStandings.filter((row) => row.competitionId === primaryStandingCompId)
    : seasonStandings;

  // Mirror the main /standings endpoint: when the playoff is running, derive
  // a live table from completed games so the team page shows current playoff
  // totals (e.g. 76 pts for Beer Sheva post-playoff, not the 59 pts snapshot).
  const sortedStandings = await (async () => {
    if (primaryStandingCompId !== 'comp_liga_haal') {
      return sortStandings(competitionFilteredStandings);
    }
    const allLeagueGames = await prisma.game.findMany({
      where: {
        seasonId: team.seasonId,
        competitionId: primaryStandingCompId,
        status: { in: ['COMPLETED', 'ONGOING'] },
      },
      select: {
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        roundNameEn: true,
      },
    });
    const shouldDerive = shouldDeriveStandings(
      competitionFilteredStandings.map((r) => ({ played: r.played, groupNameEn: r.groupNameEn ?? null })),
      allLeagueGames,
    );
    if (!shouldDerive) return sortStandings(competitionFilteredStandings);

    const teamsForDerivation = competitionFilteredStandings.map((r) => ({
      id: r.team.id,
      nameEn: r.team.nameEn,
      nameHe: r.team.nameHe ?? r.team.nameEn,
      logoUrl: r.team.logoUrl ?? null,
    }));
    const adjustments = competitionFilteredStandings.map((r) => ({
      teamId: r.teamId,
      pointsAdjustment: r.pointsAdjustment,
      pointsAdjustmentNoteHe: r.pointsAdjustmentNoteHe,
    }));
    const derived = buildStandingsFromGames(teamsForDerivation, allLeagueGames, adjustments);
    // Re-shape rows to match the `sortStandings` return type used downstream
    // (display fields + a `team` object + `id`/`teamId`).
    return derived.map((row, index) => {
      const t = teamsForDerivation.find((x) => x.id === row.teamId)!;
      const adjustedPoints = row.points + row.pointsAdjustment;
      return {
        id: row.id,
        position: row.position,
        played: row.played,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goalsFor,
        goalsAgainst: row.goalsAgainst,
        points: row.points,
        pointsAdjustment: row.pointsAdjustment,
        pointsAdjustmentNoteHe: row.pointsAdjustmentNoteHe,
        adjustedPoints,
        goalDifference: row.goalsFor - row.goalsAgainst,
        displayPosition: index + 1,
        teamId: row.teamId,
        team: { id: t.id, nameEn: t.nameEn, nameHe: t.nameHe, logoUrl: t.logoUrl },
        groupNameEn: row.groupNameEn ?? null,
      };
    });
  })() as unknown as Array<{
    id: string;
    teamId: string;
    team: { id: string; nameEn: string; nameHe: string | null; logoUrl: string | null };
    position: number;
    played: number;
    wins: number;
    draws: number;
    losses: number;
    goalsFor: number;
    goalsAgainst: number;
    points: number;
    pointsAdjustment: number;
    pointsAdjustmentNoteHe: string | null;
    adjustedPoints: number;
    goalDifference: number;
    displayPosition: number;
    groupNameEn: string | null;
  }>;
  const standing = sortedStandings.find((row) => row.teamId === team.id) || null;
  const standingIndex = sortedStandings.findIndex((row) => row.teamId === team.id);
  const nearbyStandings =
    standingIndex >= 0
      ? sortedStandings.slice(Math.max(0, standingIndex - 2), Math.min(sortedStandings.length, standingIndex + 3))
      : sortedStandings.slice(0, 5);
  const derived = deriveTeamDeepStats(team.id, teamGames);
  const seasonTeamStat = team.teamStats.find((stat) => stat.seasonId === team.seasonId) || team.teamStats[0] || null;
  const completedGames = teamGames.filter((game) => game.status === 'COMPLETED');
  const upcomingGames = teamGames.filter((game) => game.status === 'SCHEDULED' && game.dateTime >= now).sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
  const nextGame = upcomingGames[0] || null;
  const lastGame = completedGames[0] || null;
  const recentGames = completedGames.slice(0, 5);
  const topScorers = team.players
    .map((player) => {
      const totals = derivePlayerDeepStats(player.id, teamGames);
      return {
        id: player.canonicalPlayerId || player.id,
        name: formatPlayerName(player),
        goals: totals.goals,
        assists: totals.assists,
        minutes: totals.minutesPlayed,
        photo: player.photoUrl || player.uploads[0]?.filePath || null,
      };
    })
    .sort((left, right) => right.goals - left.goals || right.assists - left.assists)
    .slice(0, 6);

  return {
    team: {
      id: team.id,
      apiFootballId: team.apiFootballId,
      name: getTeamLabel(team),
      nameEn: team.nameEn,
      logoUrl: team.logoUrl,
      coach: team.coachHe || team.coach || null,
      aiSummary: team.aiSummary,
      wikiInfo: team.wikiInfo,
      season: {
        id: team.season.id,
        name: team.season.name,
        year: team.season.year,
      },
    },
    summary: {
      standingPosition: standing?.displayPosition ?? null,
      points: standing?.adjustedPoints ?? seasonTeamStat?.points ?? 0,
      record: `${derived.wins}-${derived.draws}-${derived.losses}`,
      goals: { for: derived.goalsFor, against: derived.goalsAgainst },
      matchesPlayed: derived.matchesPlayed,
      averagePossession: Number(derived.averagePossession.toFixed(1)),
    },
    sections: {
      nextMatch: nextGame
        ? {
            id: nextGame.id,
            href: `/games/${nextGame.id}`,
            competition: getCompetitionDisplayName(nextGame.competition),
            round: getRoundDisplayName(nextGame.roundNameHe, nextGame.roundNameEn),
            homeTeamName: getTeamLabel(nextGame.homeTeam),
            awayTeamName: getTeamLabel(nextGame.awayTeam),
            dateTime: nextGame.dateTime.toISOString(),
            predictionLabel: nextGame.prediction?.winnerTeamNameHe || nextGame.prediction?.winnerTeamNameEn || null,
          }
        : null,
      lastMatch: lastGame
        ? {
            id: lastGame.id,
            href: `/games/${lastGame.id}`,
            competition: getCompetitionDisplayName(lastGame.competition),
            round: getRoundDisplayName(lastGame.roundNameHe, lastGame.roundNameEn),
            homeTeamName: getTeamLabel(lastGame.homeTeam),
            awayTeamName: getTeamLabel(lastGame.awayTeam),
            dateTime: lastGame.dateTime.toISOString(),
            score: getGameScoreDisplay(lastGame),
          }
        : null,
      standings: nearbyStandings.map((row) => ({
        id: row.id,
        teamId: row.teamId,
        teamName: row.team.nameHe || row.team.nameEn,
        position: row.displayPosition,
        points: row.adjustedPoints,
        isCurrentTeam: row.teamId === team.id,
      })),
      recentForm: recentGames.map((game) => ({
        id: game.id,
        href: `/games/${game.id}`,
        result: getTeamResult(game, team.id),
        date: formatHeDate(game.dateTime),
        score: `${game.homeScore ?? 0}-${game.awayScore ?? 0}`,
        opponent: getOpponentName(game, team.id),
      })),
      upcomingMatches: upcomingGames.slice(0, 5).map((game) => ({
        id: game.id,
        href: `/games/${game.id}`,
        competition: getCompetitionDisplayName(game.competition),
        homeTeamName: getTeamLabel(game.homeTeam),
        awayTeamName: getTeamLabel(game.awayTeam),
        dateTime: game.dateTime.toISOString(),
        displayDate: formatHeDate(game.dateTime, true),
      })),
      seasonSummary: {
        wins: derived.wins,
        draws: derived.draws,
        losses: derived.losses,
        goalsFor: derived.goalsFor,
        goalsAgainst: derived.goalsAgainst,
        cleanSheets: derived.cleanSheets,
        corners: derived.corners,
        offsides: derived.offsides,
      },
      minuteBuckets: derived.bucketSummaries,
      topScorers,
      squad: team.players.map((player) => ({
        id: player.canonicalPlayerId || player.id,
        name: formatPlayerName(player),
        jerseyNumber: player.jerseyNumber,
        position: player.position,
        photo: player.photoUrl || player.uploads[0]?.filePath || null,
      })),
    },
  };
}

export async function getMobileGamePayload(gameId: string) {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    include: {
      homeTeam: true,
      awayTeam: true,
      competition: true,
      gameStats: true,
      sofascoreMatchStats: true,
      fotmobData: true,
      events: {
        include: {
          player: true,
          relatedPlayer: true,
        },
        orderBy: [{ minute: 'asc' }, { sortOrder: 'asc' }],
      },
      lineupEntries: {
        include: {
          player: true,
          team: true,
        },
        orderBy: [{ role: 'asc' }, { positionGrid: 'asc' }, { jerseyNumber: 'asc' }, { participantName: 'asc' }],
      },
    },
  });

  if (!game) return null;

  const eventSummary = buildEventSummary(game);
  const homeLineup = buildTeamLineup(game, game.homeTeamId);
  const awayLineup = buildTeamLineup(game, game.awayTeamId);
  const comparisonRows = buildComparisonRows(game.gameStats, eventSummary);

  // Hydrate coach photo + Hebrew via CoachAlias — same logic as the web's
  // enrichCoaches(). Single query for both teams' coaches.
  const coachAliases = [homeLineup.coachName, awayLineup.coachName].filter((n): n is string => !!n);
  let homeCoach: { id: string | null; nameHe: string | null; photoUrl: string | null } = { id: null, nameHe: null, photoUrl: null };
  let awayCoach = homeCoach;
  if (coachAliases.length > 0) {
    const rows = await prisma.coachAlias.findMany({
      where: { alias: { in: coachAliases } },
      select: { alias: true, coach: { select: { id: true, nameHe: true, photoUrl: true } } },
    });
    const byAlias = new Map(rows.map((r) => [r.alias, r.coach]));
    if (homeLineup.coachName) {
      const c = byAlias.get(homeLineup.coachName);
      if (c) homeCoach = { id: c.id, nameHe: c.nameHe, photoUrl: c.photoUrl };
    }
    if (awayLineup.coachName) {
      const c = byAlias.get(awayLineup.coachName);
      if (c) awayCoach = { id: c.id, nameHe: c.nameHe, photoUrl: c.photoUrl };
    }
  }

  return {
    game: {
      id: game.id,
      status: game.status,
      dateTime: game.dateTime.toISOString(),
      displayDate: formatHeDate(game.dateTime, true),
      competition: getCompetitionDisplayName(game.competition),
      round: getRoundDisplayName(game.roundNameHe, game.roundNameEn),
      score: getGameScoreDisplay(game),
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      additionalInfo: game.additionalInfo,
      homeTeam: {
        id: game.homeTeam.id,
        name: getTeamLabel(game.homeTeam),
        logoUrl: game.homeTeam.logoUrl,
      },
      awayTeam: {
        id: game.awayTeam.id,
        name: getTeamLabel(game.awayTeam),
        logoUrl: game.awayTeam.logoUrl,
      },
    },
    sections: {
      stats: comparisonRows,
      events: game.events.map((event) => ({
        id: event.id,
        // Raw enum value (GOAL / YELLOW_CARD / SUBSTITUTION_OUT / ...) — kept
        // so the mobile API mapper can translate to its own type taxonomy.
        // The previous Hebrew display label is exposed as typeLabel for any
        // call site that still wants the human-readable string.
        type: event.type,
        typeLabel: getEventDisplayLabel(event.type),
        minute: event.minute,
        extraMinute: event.extraMinute,
        displayMinute: `${event.minute}${event.extraMinute ? `+${event.extraMinute}` : ''}'`,
        playerName: event.player ? formatPlayerName(event.player) : (event.participantName || 'שחקן לא משויך'),
        relatedPlayerName: event.relatedPlayer ? formatPlayerName(event.relatedPlayer) : (event.relatedParticipantName || null),
        notes: event.notesHe || null,
        teamId: event.teamId,
      })),
      lineups: {
        home: {
          formation: homeLineup.formation,
          coachName: homeLineup.coachName,
          coachNameHe: homeCoach.nameHe,
          coachPhotoUrl: homeCoach.photoUrl,
          coachId: homeCoach.id,
          starters: homeLineup.starters,
          formationRows: buildFormationRows(homeLineup.starters, 'home'),
          substitutes: homeLineup.substitutes,
        },
        away: {
          formation: awayLineup.formation,
          coachName: awayLineup.coachName,
          coachNameHe: awayCoach.nameHe,
          coachPhotoUrl: awayCoach.photoUrl,
          coachId: awayCoach.id,
          starters: awayLineup.starters,
          formationRows: buildFormationRows(awayLineup.starters, 'away'),
          substitutes: awayLineup.substitutes,
        },
      },
      eventSummary,
      sofascoreStats: Array.isArray(game.sofascoreMatchStats?.payload)
        ? (game.sofascoreMatchStats!.payload as Array<{
            section: string; label: string; home: string; away: string;
            homeExtra?: string | null; awayExtra?: string | null;
          }>)
        : [],
      fotmob: game.fotmobData
        ? {
            shotmap: Array.isArray(game.fotmobData.shotmap) ? (game.fotmobData.shotmap as unknown[]) : [],
            momentum: (game.fotmobData.momentum as { data?: unknown[]; goals?: unknown[] } | null) ?? null,
            playerStats: Array.isArray(game.fotmobData.playerStats) ? (game.fotmobData.playerStats as unknown[]) : [],
            matchInfo: (game.fotmobData.matchInfo as unknown) ?? null,
            homeXg: game.gameStats?.homeXg ?? null,
            awayXg: game.gameStats?.awayXg ?? null,
          }
        : null,
    },
    h2h: await buildMobileH2H(game.homeTeamId, game.awayTeamId, game.id),
    xg: {
      available: false,
      reason: 'אין כרגע נתוני בעיטה מפורטים מספיק כדי לחשב Expected Goals אמיתי.',
    },
  };
}

async function buildMobileH2H(homeTeamId: string, awayTeamId: string, currentGameId: string) {
  const { buildH2H } = await import('@/lib/h2h');
  const summary = await buildH2H(homeTeamId, awayTeamId, 5);
  if (!summary || summary.totalGames === 0) return null;
  return {
    totalGames: summary.totalGames,
    winsA: summary.winsA,
    draws: summary.draws,
    winsB: summary.winsB,
    goalsA: summary.goalsA,
    goalsB: summary.goalsB,
    meetings: summary.meetings.filter((m) => m.gameId !== currentGameId).slice(0, 5).map((m) => ({
      gameId: m.gameId,
      date: m.date,
      competitionNameHe: m.competitionNameHe,
      homeTeamName: m.homeTeamName,
      awayTeamName: m.awayTeamName,
      homeScore: m.homeScore,
      awayScore: m.awayScore,
      resultFromA: m.resultFromA,
    })),
  };
}

export async function getMobilePlayerPayload(playerId: string, options?: { season?: string; view?: string }) {
  const matchedPlayer = await prisma.player.findFirst({
    where: {
      OR: [{ id: playerId }, { canonicalPlayerId: playerId }],
    },
    include: {
      canonicalPlayer: true,
      team: {
        include: {
          season: true,
        },
      },
    },
  });

  if (!matchedPlayer) return null;

  const canonicalPlayerId = matchedPlayer.canonicalPlayerId || matchedPlayer.id;
  const linkedPlayers = await prisma.player.findMany({
    where: {
      OR: [{ id: canonicalPlayerId }, { canonicalPlayerId }],
    },
    include: {
      team: {
        include: {
          season: true,
        },
      },
      uploads: {
        orderBy: [{ createdAt: 'asc' }],
      },
      playerStats: {
        where: { seasonId: { not: null } },
        include: {
          season: true,
          competition: true,
        },
        orderBy: [{ season: { year: 'desc' } }, { competition: { nameHe: 'asc' } }],
      },
    },
    orderBy: [{ team: { season: { year: 'desc' } } }, { updatedAt: 'desc' }],
  });

  const canonicalPlayer = linkedPlayers.find((player) => player.id === canonicalPlayerId) || linkedPlayers[0];
  const latestSeasonEntry = [...linkedPlayers].sort(
    (left, right) => right.team.season.year - left.team.season.year || +new Date(right.updatedAt) - +new Date(left.updatedAt)
  )[0];
  const availableSeasons = Array.from(
    linkedPlayers
      .map((player) => ({
        id: player.team.season.id,
        name: player.team.season.name,
        year: player.team.season.year,
      }))
      .reduce((map, season) => map.set(season.id, season), new Map<string, { id: string; name: string; year: number }>())
      .values()
  ).sort((left, right) => right.year - left.year);
  const selectedSeasonId =
    options?.season && availableSeasons.some((season) => season.id === options.season) ? options.season : latestSeasonEntry.team.season.id;
  const selectedSeason = availableSeasons.find((season) => season.id === selectedSeasonId) || availableSeasons[0];
  const seasonPlayers = linkedPlayers.filter((player) => player.team.season.id === selectedSeasonId);
  const displayPlayerEntry =
    seasonPlayers.find((player) => player.id === matchedPlayer.id) ||
    seasonPlayers.find((player) => player.id === canonicalPlayerId) ||
    seasonPlayers[0] ||
    latestSeasonEntry;
  const teamIds = Array.from(new Set(seasonPlayers.map((player) => player.teamId)));
  const allGames = await prisma.game.findMany({
    where: {
      seasonId: selectedSeasonId,
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    },
    include: {
      competition: true,
      homeTeam: true,
      awayTeam: true,
      events: {
        select: {
          minute: true,
          extraMinute: true,
          type: true,
          playerId: true,
          relatedPlayerId: true,
          teamId: true,
        },
      },
      lineupEntries: {
        select: {
          playerId: true,
          role: true,
          teamId: true,
        },
      },
      gameStats: {
        select: {
          homeTeamPossession: true,
          awayTeamPossession: true,
          homeShotsOnTarget: true,
          awayShotsOnTarget: true,
          homeShotsTotal: true,
          awayShotsTotal: true,
          homeCorners: true,
          awayCorners: true,
          homeFouls: true,
          awayFouls: true,
          homeOffsides: true,
          awayOffsides: true,
          homeYellowCards: true,
          awayYellowCards: true,
          homeRedCards: true,
          awayRedCards: true,
        },
      },
    },
    orderBy: { dateTime: 'desc' },
  });

  const derivedTotals = seasonPlayers.reduce(
    (acc, player) => {
      const playerGames = allGames.filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId);
      const derived = derivePlayerDeepStats(player.id, playerGames);

      return {
        goals: acc.goals + derived.goals,
        assists: acc.assists + derived.assists,
        yellowCards: acc.yellowCards + derived.yellowCards,
        redCards: acc.redCards + derived.redCards,
        starts: acc.starts + derived.starts,
        gamesPlayed: acc.gamesPlayed + derived.gamesPlayed,
        minutesPlayed: acc.minutesPlayed + derived.minutesPlayed,
        benchAppearances: acc.benchAppearances + derived.benchAppearances,
        substituteAppearances: acc.substituteAppearances + derived.substituteAppearances,
        timesSubbedOff: acc.timesSubbedOff + derived.timesSubbedOff,
      };
    },
    {
      goals: 0,
      assists: 0,
      yellowCards: 0,
      redCards: 0,
      starts: 0,
      gamesPlayed: 0,
      minutesPlayed: 0,
      benchAppearances: 0,
      substituteAppearances: 0,
      timesSubbedOff: 0,
    }
  );

  const aggregatedStats = Array.from(
    seasonPlayers
      .flatMap((player) => player.playerStats)
      .reduce((map, stat) => {
        const key = `${stat.seasonId || 'all'}-${stat.competitionId || 'all'}`;
        const existing = map.get(key);

        if (!existing) {
          map.set(key, {
            key,
            seasonName: stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || '-',
            competitionName: stat.competition?.nameHe || stat.competition?.nameEn || 'כולל',
            goals: stat.goals,
            assists: stat.assists,
            minutesPlayed: stat.minutesPlayed,
            starts: stat.starts,
            substituteAppearances: stat.substituteAppearances,
            timesSubbedOff: stat.timesSubbedOff,
            yellowCards: stat.yellowCards,
            redCards: stat.redCards,
            gamesPlayed: stat.gamesPlayed,
          });
          return map;
        }

        existing.goals += stat.goals;
        existing.assists += stat.assists;
        existing.minutesPlayed += stat.minutesPlayed;
        existing.starts += stat.starts;
        existing.substituteAppearances += stat.substituteAppearances;
        existing.timesSubbedOff += stat.timesSubbedOff;
        existing.yellowCards += stat.yellowCards;
        existing.redCards += stat.redCards;
        existing.gamesPlayed += stat.gamesPlayed;
        return map;
      }, new Map<string, {
        key: string;
        seasonName: string;
        competitionName: string;
        goals: number;
        assists: number;
        minutesPlayed: number;
        starts: number;
        substituteAppearances: number;
        timesSubbedOff: number;
        yellowCards: number;
        redCards: number;
        gamesPlayed: number;
      }>())
      .values()
  )
    // Drop frameworks the player didn't actually appear in (all-zero rows) —
    // e.g. a top-division player showing an empty "Liga Leumit" row.
    .filter((row) => row.gamesPlayed > 0 || row.minutesPlayed > 0 || row.goals > 0 || row.assists > 0)
    .sort((left, right) => right.seasonName.localeCompare(left.seasonName) || left.competitionName.localeCompare(right.competitionName));

  const uploads = linkedPlayers
    .flatMap((player) => player.uploads)
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || +new Date(left.createdAt) - +new Date(right.createdAt));
  const displayPhoto = displayPlayerEntry.photoUrl || uploads.find((upload) => upload.isPrimary)?.filePath || uploads[0]?.filePath || null;
  const activeGameFilter = normalizeGameFilter(options?.view);
  const playerGameRows = seasonPlayers
    .flatMap((player) =>
      allGames
        .filter((game) => game.homeTeamId === player.teamId || game.awayTeamId === player.teamId)
        .map((game) => buildPlayerGameRow(player, game))
        .filter((row): row is Exclude<typeof row, null> => Boolean(row))
    )
    .sort((left, right) => +new Date(right.dateTime) - +new Date(left.dateTime));
  const filteredPlayerGameRows = playerGameRows.filter((row) => matchesGameFilter(row, activeGameFilter));

  // Trophy cabinet — same source as the web player page. Done after the
  // big aggregations so we share canonicalPlayerId without duplicating it.
  const trophyGroups = await buildPlayerTrophies(canonicalPlayerId);

  // AI overview lives on the canonical Player's additionalInfo. The fetcher
  // script writes there so all season-linked rows share one summary.
  const canonicalAdditional = (canonicalPlayer.additionalInfo as { aiSummary?: { text?: string; wiki?: { summary?: string; thumbnail?: string; sourceUrl?: string } } } | null) || null;
  const aiOverview = canonicalAdditional?.aiSummary
    ? {
        text: canonicalAdditional.aiSummary.text || null,
        wikiSummary: canonicalAdditional.aiSummary.wiki?.summary || null,
        wikiThumbnail: canonicalAdditional.aiSummary.wiki?.thumbnail || null,
        wikiSourceUrl: canonicalAdditional.aiSummary.wiki?.sourceUrl || null,
      }
    : null;

  return {
    player: {
      id: canonicalPlayerId,
      // Prefer the selected-season player's name — the canonical record can
      // hold an older spelling (e.g. "אליל פרץ" while 2025 has "אליאל פרץ").
      name: formatPlayerName(displayPlayerEntry) || formatPlayerName(canonicalPlayer),
      nameEn: displayPlayerEntry.nameEn || canonicalPlayer.nameEn,
      photoUrl: displayPhoto,
      teamId: displayPlayerEntry.teamId,
      teamName: displayPlayerEntry.team.nameHe || displayPlayerEntry.team.nameEn,
      teamLogoUrl: displayPlayerEntry.team.logoUrl ?? null,
      position: displayPlayerEntry.position || null,
      jerseyNumber: displayPlayerEntry.jerseyNumber,
      season: selectedSeason
        ? {
            id: selectedSeason.id,
            name: selectedSeason.name,
            year: selectedSeason.year,
          }
        : null,
      aiOverview,
    },
    filters: {
      availableSeasons,
      activeView: activeGameFilter,
    },
    summary: derivedTotals,
    sections: {
      profile: {
        nationality: canonicalPlayer.nationalityHe || canonicalPlayer.nationalityEn || null,
        teamsInCareer: new Set(linkedPlayers.map((player) => player.teamId)).size,
        seasonsInSystem: new Set(linkedPlayers.map((player) => player.team.seasonId)).size,
        uploadsCount: uploads.length,
      },
      seasonEntries: seasonPlayers.map((player) => ({
        id: player.id,
        seasonName: player.team.season.name,
        teamName: player.team.nameHe || player.team.nameEn,
        jerseyNumber: player.jerseyNumber,
        position: player.position,
        hasPhoto: Boolean(player.photoUrl),
      })),
      aggregatedStats,
      games: filteredPlayerGameRows,
      gameFilterCounts: {
        all: playerGameRows.length,
        starts: playerGameRows.filter((row) => row.isStarter).length,
        bench: playerGameRows.filter((row) => row.onBench).length,
        subIn: playerGameRows.filter((row) => row.wasSubbedIn).length,
        subOff: playerGameRows.filter((row) => row.wasSubbedOff).length,
      },
      gallery: uploads.map((upload) => ({
        id: upload.id,
        filePath: upload.filePath,
        title: upload.title || null,
        isPrimary: upload.isPrimary,
      })),
      trophies: trophyGroups,
    },
  };
}
