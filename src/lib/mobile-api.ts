import { getCompetitionDisplayName, getRoundDisplayName } from '@/lib/competition-display';
import {
  getCurrentSeasonStartYear,
  getHomepageLiveSnapshots,
  getIsraeliTeamApiFootballIds,
  snapshotInvolvesIsraeliTeam,
  type HomepageLiveSnapshot,
} from '@/lib/home-live';
import { getOnThisDay } from '@/lib/on-this-day';
import { resolveHomeLeagueScope } from '@/lib/home-league-scope';
import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import { buildStandingsFromGames, shouldDeriveStandings } from '@/lib/standings-from-games';
import {
  DEFAULT_TELEGRAM_SOURCES,
  fetchTelegramMessagesFromSources,
  normalizeTelegramSource,
} from '@/lib/telegram';

type MobileSearchParams = {
  team?: string | string[] | undefined;
  league?: string | string[] | undefined;
  /** Optional authenticated user ID — used by mobile routes that resolve the user via Bearer JWT */
  userId?: string | null;
};

function parseSearchValues(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value];
  return [];
}

function getTeamLabel(team: { nameHe: string | null; nameEn: string }) {
  return team.nameHe || team.nameEn;
}

function getRoundLabel(game: { roundNameHe: string | null; roundNameEn: string | null }) {
  return getRoundDisplayName(game.roundNameHe, game.roundNameEn);
}

function gameMatchesPreferredTeam(
  game: { homeTeamId?: string; awayTeamId?: string; game?: { homeTeamId: string; awayTeamId: string } | null } | null,
  selectedTeamIds: string[]
) {
  if (!selectedTeamIds.length || !game) return true;
  if (game.game) return selectedTeamIds.includes(game.game.homeTeamId) || selectedTeamIds.includes(game.game.awayTeamId);
  return selectedTeamIds.includes(game.homeTeamId || '') || selectedTeamIds.includes(game.awayTeamId || '');
}

function gameMatchesPreferredCompetition(
  game: { competition?: { apiFootballId: number | null } | null; game?: { competition?: { apiFootballId: number | null } | null } | null } | null,
  selectedCompetitionApiIds: number[]
) {
  if (!selectedCompetitionApiIds.length || !game) return true;
  const competitionApiFootballId = game.game?.competition?.apiFootballId ?? game.competition?.apiFootballId ?? null;
  // Always surface pre-season friendlies (667) + Israeli teams' European ties
  // (Champions League 2 / Europa 3 / Conference 848) — a league-only follower
  // still wants to see e.g. HBS's Champions League qualifier.
  if (competitionApiFootballId !== null && [667, 2, 3, 848].includes(competitionApiFootballId)) return true;
  return competitionApiFootballId !== null && selectedCompetitionApiIds.includes(competitionApiFootballId);
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}...`;
}

function parseScoreLabel(scoreLabel: string) {
  const match = scoreLabel.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return { homeScore: 0, awayScore: 0 };
  return {
    homeScore: Number(match[1]),
    awayScore: Number(match[2]),
  };
}

function parseGameIdFromHref(gameHref: string) {
  const match = gameHref.match(/\/games\/([^/?#]+)/);
  return match?.[1] || gameHref;
}

function mapHomepageLiveSnapshot(snapshot: HomepageLiveSnapshot) {
  const { homeScore, awayScore } = parseScoreLabel(snapshot.scoreLabel);

  return {
    id: snapshot.id,
    gameId: parseGameIdFromHref(snapshot.gameHref),
    homeTeamName: snapshot.homeTeamName,
    awayTeamName: snapshot.awayTeamName,
    homeScore,
    awayScore,
    minuteLabel: snapshot.minuteLabel,
    statusLabel: snapshot.statusLabel,
    countryLabel: snapshot.countryLabel,
    countryFlagUrl: snapshot.countryFlagUrl,
    leagueLabel: snapshot.leagueLabel,
    eventCount: snapshot.eventCount,
  };
}

async function getConfiguredTelegramSources() {
  const telegramSourcesSetting = await prisma.siteSetting.findUnique({
    where: { key: 'telegram_sources' },
  });

  const configuredTelegramSourcesRaw = Array.isArray(telegramSourcesSetting?.valueJson)
    ? (telegramSourcesSetting.valueJson as Array<Record<string, unknown>>)
    : [];

  const telegramSources =
    configuredTelegramSourcesRaw
      .map((source) =>
        normalizeTelegramSource({
          slug: typeof source.slug === 'string' ? source.slug : null,
          url: typeof source.url === 'string' ? source.url : null,
          label: typeof source.label === 'string' ? source.label : '',
          teamLabel: typeof source.teamLabel === 'string' ? source.teamLabel : '',
        })
      )
      .filter((source): source is NonNullable<typeof source> => Boolean(source)) || [];

  return telegramSources.length ? telegramSources : DEFAULT_TELEGRAM_SOURCES;
}

function mapTelegramMessage(message: {
  id: string;
  sourceLabel: string;
  teamLabel: string;
  url: string;
  imageUrl?: string | null;
  publishedAt: Date | null;
  text: string;
}) {
  // Shape MUST match shared NewsCard { id, source, team, imageUrl, preview,
  // publishedAt, url } — the mobile news screen + home render item.preview / item.team.
  return {
    id: message.id,
    source: message.sourceLabel,
    team: message.teamLabel || null,
    imageUrl: message.imageUrl || null,
    preview: truncateText(message.text.replace(/\s+/g, ' ').trim(), 160),
    publishedAt: message.publishedAt ? message.publishedAt.toISOString() : null,
    url: message.url,
  };
}

function normalizeIdArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0)
    )
  );
}

export async function getMobileHomePayload(searchParams?: MobileSearchParams) {
  // Resolve the viewer: accept an explicit userId (mobile/Bearer) or fall back to getCurrentUser() (web/cookie).
  let viewer: { id: string } | null = null;
  if (searchParams?.userId !== undefined) {
    viewer = searchParams.userId ? { id: searchParams.userId } : null;
  } else {
    const { getCurrentUser } = await import('@/lib/auth');
    viewer = await getCurrentUser();
  }

  const latestSeason = await prisma.season.findFirst({
    where: {
      year: {
        lte: getCurrentSeasonStartYear(),
      },
    },
    orderBy: { year: 'desc' },
  });

  if (!latestSeason) {
    return {
      season: null,
      filters: {
        favoriteTeams: [],
        favoriteCompetitionApiIds: [],
      },
      summary: {
        hasData: false,
        message: 'אין עדיין נתונים להצגה.',
      },
      sections: {
        nextMatch: null,
        lastMatch: null,
        standings: [],
        predictions: [],
        headToHead: [],
        upcomingMatches: [],
        live: [],
        news: [],
      },
    };
  }

  const now = new Date();

  // Feature the UPCOMING season (table + fixtures + team filter) while player
  // stats / last result come from the most recently PLAYED season — mirrors the
  // web home. In the summer gap these differ (e.g. 2026/27 table at 0 points
  // while the last game is from 2025/26); once the new season kicks off they
  // converge back on latestSeason.
  const [upcomingGame, lastCompletedGame] = await Promise.all([
    prisma.game.findFirst({
      where: { status: 'SCHEDULED', dateTime: { gte: now } },
      orderBy: { dateTime: 'asc' },
      select: { season: { select: { id: true, year: true, name: true } } },
    }),
    prisma.game.findFirst({
      where: { status: 'COMPLETED' },
      orderBy: { dateTime: 'desc' },
      select: { season: { select: { id: true, year: true, name: true } } },
    }),
  ]);
  const featuredSeason = upcomingGame?.season ?? latestSeason;
  const statsSeason = lastCompletedGame?.season ?? latestSeason;

  const [storedUser, seasonTeams, rawStandings, effectiveTelegramSources] = await Promise.all([
    viewer
      ? prisma.user.findUnique({
          where: { id: viewer.id },
          select: { favoriteTeamApiIds: true, favoriteCompetitionApiIds: true, homeLeagueScope: true },
        })
      : Promise.resolve(null),
    prisma.team.findMany({
      where: { seasonId: featuredSeason.id },
      orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }],
      select: { id: true, apiFootballId: true, nameHe: true, nameEn: true, logoUrl: true },
    }),
    // Restrict standings to a single competition. Mobile shows the Israeli
    // Premier League (Ligat HaAl) by default; without this filter the row set
    // contains standings from every competition in the season (Leumit / cups)
    // and the home screen mixes teams across leagues.
    prisma.standing.findMany({
      where: { seasonId: featuredSeason.id, competitionId: 'comp_liga_haal' },
      include: {
        team: true,
        competition: {
          select: {
            id: true,
            nameHe: true,
            nameEn: true,
            apiFootballId: true,
          },
        },
      },
    }),
    getConfiguredTelegramSources(),
  ]);

  const queryTeamIds = parseSearchValues(searchParams?.team);
  const queryLeagueIds = parseSearchValues(searchParams?.league)
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);

  const favoriteTeamIds =
    queryTeamIds.length > 0
      ? queryTeamIds
      : seasonTeams
          .filter((team) => team.apiFootballId !== null && (storedUser?.favoriteTeamApiIds || []).includes(team.apiFootballId))
          .map((team) => team.id);
  const selectedCompetitionApiIds =
    queryLeagueIds.length > 0
      ? queryLeagueIds
      : resolveHomeLeagueScope(storedUser?.homeLeagueScope, storedUser?.favoriteCompetitionApiIds || []);
  const selectedTeams = seasonTeams.filter((team) => favoriteTeamIds.includes(team.id));
  const selectedTeamIds = selectedTeams.map((team) => team.id);

  // Stored standings reflect end-of-regular-season totals. Once playoff starts,
  // derive a live table from the actual games so the mobile home matches the
  // live web /standings view (championship vs relegation groups, current pts).
  const competitionGamesForStandings = await prisma.game.findMany({
    where: {
      seasonId: featuredSeason.id,
      competitionId: 'comp_liga_haal',
      status: { in: ['COMPLETED', 'ONGOING'] },
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true,
      roundNameEn: true,
      dateTime: true,
    },
    orderBy: { dateTime: 'asc' },
  });

  // Compute last-5 results per team for the home table preview form column.
  function lastFiveFor(teamId: string): string {
    return competitionGamesForStandings
      .filter((g) => (g.homeTeamId === teamId || g.awayTeamId === teamId) && g.homeScore != null && g.awayScore != null)
      .sort((a, b) => (b.dateTime?.getTime() ?? 0) - (a.dateTime?.getTime() ?? 0))
      .slice(0, 5)
      .map((g) => {
        const isHome = g.homeTeamId === teamId;
        const teamGoals = isHome ? g.homeScore! : g.awayScore!;
        const oppGoals = isHome ? g.awayScore! : g.homeScore!;
        if (teamGoals > oppGoals) return 'נ';
        if (teamGoals < oppGoals) return 'ה';
        return 'ת';
      })
      .join('');
  }

  const teamsForDerivation = seasonTeams.map((t) => ({
    id: t.id,
    nameEn: t.nameEn,
    nameHe: t.nameHe,
    logoUrl: t.logoUrl,
  }));

  const standingsAdjustments = rawStandings.map((r) => ({
    teamId: r.teamId,
    pointsAdjustment: r.pointsAdjustment,
    pointsAdjustmentNoteHe: r.pointsAdjustmentNoteHe,
  }));
  const sortedStandings = shouldDeriveStandings(
    rawStandings.map((r) => ({ played: r.played, groupNameEn: r.groupNameEn ?? null })),
    competitionGamesForStandings,
  )
    ? buildStandingsFromGames(teamsForDerivation, competitionGamesForStandings, standingsAdjustments)
    : sortStandings(rawStandings);
  const compactStandings = (() => {
    if (!sortedStandings.length) return [];
    if (!selectedTeamIds.length) return sortedStandings.slice(0, 6);
    if (selectedTeamIds.length > 1) return sortedStandings.filter((row) => selectedTeamIds.includes(row.teamId)).slice(0, 8);
    const selectedIndex = sortedStandings.findIndex((row) => row.teamId === selectedTeamIds[0]);
    if (selectedIndex === -1) return sortedStandings.slice(0, 6);
    const start = Math.max(0, selectedIndex - 2);
    return sortedStandings.slice(start, Math.min(sortedStandings.length, start + 5));
  })();

  const [
    nextGamesRaw,
    lastGamesRaw,
    predictionsRaw,
    headToHeadEntriesRaw,
    nextRoundGamesRaw,
    telegramMessages,
    liveItems,
    israeliTeamApiIds,
    onThisDayData,
  ] = await Promise.all([
    prisma.game.findMany({
      where: {
        seasonId: featuredSeason.id,
        status: 'SCHEDULED',
        dateTime: { gte: now },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
        prediction: true,
      },
      orderBy: [{ dateTime: 'asc' }],
      take: 24,
    }),
    prisma.game.findMany({
      where: {
        seasonId: statsSeason.id,
        status: 'COMPLETED',
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
      },
      orderBy: [{ dateTime: 'desc' }],
      take: 24,
    }),
    prisma.gamePrediction.findMany({
      // Only UPCOMING fixtures — without this the section surfaced the season's
      // oldest, already-played games.
      where: { seasonId: latestSeason.id, game: { status: 'SCHEDULED', dateTime: { gte: now } } },
      include: {
        game: {
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
          },
        },
      },
      orderBy: { game: { dateTime: 'asc' } },
      take: 12,
    }),
    prisma.gameHeadToHeadEntry.findMany({
      // Tie H2H to upcoming fixtures (not arbitrary cuid order over the whole season).
      where: { seasonId: latestSeason.id, game: { status: 'SCHEDULED', dateTime: { gte: now } } },
      include: {
        game: {
          include: {
            homeTeam: true,
            awayTeam: true,
            competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
          },
        },
      },
      orderBy: [{ game: { dateTime: 'asc' } }, { relatedDate: 'desc' }],
      take: 60,
    }),
    prisma.game.findMany({
      where: {
        seasonId: featuredSeason.id,
        status: 'SCHEDULED',
        dateTime: { gte: now },
      },
      include: {
        homeTeam: true,
        awayTeam: true,
        competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
        prediction: true,
      },
      orderBy: [{ dateTime: 'asc' }],
      take: 24,
    }),
    fetchTelegramMessagesFromSources(effectiveTelegramSources, 5).catch(() => []),
    // Fetch a bigger pool, then trim to Israel below — the global feed returns
    // worldwide matches and the live-countries admin setting isn't always set.
    getHomepageLiveSnapshots(null, { limit: 24 }),
    getIsraeliTeamApiFootballIds(),
    getOnThisDay(new Date(), storedUser?.favoriteTeamApiIds || []).catch((e) => { console.error('[on-this-day]', e); return null; }),
  ]);

  // Only surface Israeli-team games (a foreign-vs-foreign European qualifier our
  // feeds pull in is noise), and rank the user's selected team(s) first, then
  // their selected league(s), then any other Israeli game. Mirrors the web home.
  const involvesIsraeliTeam = (g: { homeTeam?: { apiFootballId: number | null } | null; awayTeam?: { apiFootballId: number | null } | null }) =>
    (g.homeTeam?.apiFootballId != null && israeliTeamApiIds.has(g.homeTeam.apiFootballId)) ||
    (g.awayTeam?.apiFootballId != null && israeliTeamApiIds.has(g.awayTeam.apiFootballId));
  const inSelectedLeague = (g: { competition?: { apiFootballId: number | null } | null }) =>
    selectedCompetitionApiIds.length > 0 && g.competition?.apiFootballId != null && selectedCompetitionApiIds.includes(g.competition.apiFootballId);
  const prefRank = (g: { homeTeamId: string; awayTeamId: string; competition?: { apiFootballId: number | null } | null }) => {
    if (selectedTeamIds.length && gameMatchesPreferredTeam(g, selectedTeamIds)) return 0;
    if (inSelectedLeague(g)) return 1;
    return 2;
  };
  const rankedUpcoming = nextGamesRaw
    .filter(involvesIsraeliTeam)
    .sort((a, b) => prefRank(a) - prefRank(b) || +new Date(a.dateTime) - +new Date(b.dateTime));
  // A team follower keeps their team's next game; everyone else gets the
  // best-ranked Israeli game (selected league first, then soonest).
  const nextGame = selectedTeamIds.length
    ? rankedUpcoming.find((game) => gameMatchesPreferredTeam(game, selectedTeamIds)) || null
    : rankedUpcoming[0] || null;
  // The take:24 window over ALL clubs' completed games can drop a selected
  // team's real last game once ≥24 other-club games are newer. When a team is
  // selected, query ITS last completed game directly so lastMatch is accurate.
  const teamScopedLastGame = selectedTeamIds.length
    ? await prisma.game.findFirst({
        where: {
          seasonId: statsSeason.id,
          status: 'COMPLETED',
          OR: [{ homeTeamId: { in: selectedTeamIds } }, { awayTeamId: { in: selectedTeamIds } }],
        },
        include: {
          homeTeam: true,
          awayTeam: true,
          competition: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } },
        },
        orderBy: { dateTime: 'desc' },
      })
    : null;
  // A followed team's genuine last game is shown as-is, NOT filtered by the
  // competition preference: it's already scoped to the team the user cares
  // about, and applying the pref would perversely hide an important cup game
  // (e.g. the Super Cup, comp 659) in favour of a force-surfaced friendly
  // (comp 667) for a league-only follower. The pref still applies to the
  // no-team fallback below.
  const lastGame =
    teamScopedLastGame ||
    lastGamesRaw
      .filter((game) => gameMatchesPreferredTeam(game, selectedTeamIds))
      .filter((game) => gameMatchesPreferredCompetition(game, selectedCompetitionApiIds))[0] || null;

  const predictions = predictionsRaw
    .filter((prediction) => prediction.game.status !== 'CANCELLED')
    .filter((prediction) => gameMatchesPreferredTeam(prediction, selectedTeamIds))
    .filter((prediction) => gameMatchesPreferredCompetition(prediction, selectedCompetitionApiIds))
    .slice(0, 4);

  const headToHeadEntries = headToHeadEntriesRaw
    .filter((entry) => gameMatchesPreferredTeam(entry, selectedTeamIds))
    .filter((entry) => gameMatchesPreferredCompetition(entry, selectedCompetitionApiIds));

  const nextRoundLabel = nextGame ? getRoundLabel(nextGame) : null;
  const nextRoundCompetitionId = nextGame?.competitionId || null;
  const nextRoundGames = nextGame
    ? nextRoundGamesRaw
        .filter((game) => (nextRoundCompetitionId ? game.competitionId === nextRoundCompetitionId : true) && getRoundLabel(game) === nextRoundLabel)
        .filter(involvesIsraeliTeam)
        .slice(0, 6)
    : [];

  const groupedHeadToHeadMap = new Map<
    string,
    {
      fixtureLabel: string;
      fixtureHref: string;
      roundLabel: string | null;
      items: Array<{
        id: string;
        date: Date | null;
        homeTeamName: string;
        awayTeamName: string;
        scoreLabel: string;
      }>;
    }
  >();

  for (const entry of headToHeadEntries) {
    if (!groupedHeadToHeadMap.has(entry.gameId)) {
      groupedHeadToHeadMap.set(entry.gameId, {
        fixtureLabel: `${getTeamLabel(entry.game.homeTeam)} - ${getTeamLabel(entry.game.awayTeam)}`,
        fixtureHref: `/games/${entry.game.id}`,
        roundLabel: getRoundLabel(entry.game),
        items: [],
      });
    }

    const group = groupedHeadToHeadMap.get(entry.gameId);
    if (!group || group.items.length >= 3) continue;

    group.items.push({
      id: entry.id,
      date: entry.relatedDate,
      homeTeamName: entry.homeTeamNameHe || entry.homeTeamNameEn || 'לא ידוע',
      awayTeamName: entry.awayTeamNameHe || entry.awayTeamNameEn || 'לא ידוע',
      scoreLabel: entry.homeScore !== null && entry.awayScore !== null ? `${entry.homeScore} - ${entry.awayScore}` : 'ללא תוצאה',
    });
  }

  return {
    season: {
      id: featuredSeason.id,
      year: featuredSeason.year,
      label: featuredSeason.name,
    },
    filters: {
      favoriteTeams: selectedTeams.map((team) => ({
        id: team.id,
        apiFootballId: team.apiFootballId,
        name: getTeamLabel(team),
      })),
      favoriteCompetitionApiIds: selectedCompetitionApiIds,
    },
    summary: {
      hasData: true,
      selectedTeamCount: selectedTeams.length,
      selectedCompetitionCount: selectedCompetitionApiIds.length,
      liveCount: liveItems.length,
      newsCount: telegramMessages.length,
    },
    sections: {
      nextMatch: nextGame
        ? {
            id: nextGame.id,
            apiId: nextGame.apiFootballId ?? null,
            href: `/games/${nextGame.id}`,
            competition: getCompetitionDisplayName(nextGame.competition),
            competitionId: nextGame.competition?.id ?? null,
            competitionName: getCompetitionDisplayName(nextGame.competition),
            homeTeam: {
              id: nextGame.homeTeam.id,
              apiId: nextGame.homeTeam.apiFootballId ?? null,
              nameEn: nextGame.homeTeam.nameEn,
              nameHe: nextGame.homeTeam.nameHe || nextGame.homeTeam.nameEn,
              logoUrl: nextGame.homeTeam.logoUrl ?? null,
            },
            awayTeam: {
              id: nextGame.awayTeam.id,
              apiId: nextGame.awayTeam.apiFootballId ?? null,
              nameEn: nextGame.awayTeam.nameEn,
              nameHe: nextGame.awayTeam.nameHe || nextGame.awayTeam.nameEn,
              logoUrl: nextGame.awayTeam.logoUrl ?? null,
            },
            homeTeamName: getTeamLabel(nextGame.homeTeam),
            awayTeamName: getTeamLabel(nextGame.awayTeam),
            dateTime: nextGame.dateTime.toISOString(),
            status: nextGame.status,
            homeScore: nextGame.homeScore ?? null,
            awayScore: nextGame.awayScore ?? null,
            predictionLabel: nextGame.prediction?.winnerTeamNameHe || nextGame.prediction?.winnerTeamNameEn || null,
          }
        : null,
      lastMatch: lastGame
        ? {
            id: lastGame.id,
            apiId: lastGame.apiFootballId ?? null,
            href: `/games/${lastGame.id}`,
            competition: getCompetitionDisplayName(lastGame.competition),
            competitionId: lastGame.competition?.id ?? null,
            competitionName: getCompetitionDisplayName(lastGame.competition),
            homeTeam: {
              id: lastGame.homeTeam.id,
              apiId: lastGame.homeTeam.apiFootballId ?? null,
              nameEn: lastGame.homeTeam.nameEn,
              nameHe: lastGame.homeTeam.nameHe || lastGame.homeTeam.nameEn,
              logoUrl: lastGame.homeTeam.logoUrl ?? null,
            },
            awayTeam: {
              id: lastGame.awayTeam.id,
              apiId: lastGame.awayTeam.apiFootballId ?? null,
              nameEn: lastGame.awayTeam.nameEn,
              nameHe: lastGame.awayTeam.nameHe || lastGame.awayTeam.nameEn,
              logoUrl: lastGame.awayTeam.logoUrl ?? null,
            },
            homeTeamName: getTeamLabel(lastGame.homeTeam),
            awayTeamName: getTeamLabel(lastGame.awayTeam),
            dateTime: lastGame.dateTime.toISOString(),
            status: lastGame.status,
            homeScore: lastGame.homeScore ?? null,
            awayScore: lastGame.awayScore ?? null,
          }
        : null,
      standings: compactStandings.map((row) => ({
        id: row.id,
        teamId: row.teamId,
        teamName: row.team.nameHe || row.team.nameEn,
        teamLogoUrl: row.team.logoUrl ?? null,
        position: row.displayPosition,
        played: row.played,
        goalsDiff: row.goalsFor - row.goalsAgainst,
        points: row.adjustedPoints,
        form: lastFiveFor(row.teamId),
        isFavorite: selectedTeamIds.includes(row.teamId),
      })),
      predictions: predictions.map((prediction) => ({
        id: prediction.id,
        gameId: prediction.game.id,
        href: `/games/${prediction.game.id}`,
        competition: getCompetitionDisplayName(prediction.game.competition),
        homeTeamName: getTeamLabel(prediction.game.homeTeam),
        awayTeamName: getTeamLabel(prediction.game.awayTeam),
        dateTime: prediction.game.dateTime.toISOString(),
        winnerLabel: prediction.winnerTeamNameHe || prediction.winnerTeamNameEn || null,
        percentHome: prediction.percentHome,
        percentDraw: prediction.percentDraw,
        percentAway: prediction.percentAway,
      })),
      headToHead: Array.from(groupedHeadToHeadMap.entries())
        .slice(0, 3)
        .map(([gameId, group]) => ({
          gameId,
          fixtureLabel: group.fixtureLabel,
          fixtureHref: group.fixtureHref,
          roundLabel: group.roundLabel,
          items: group.items.map((item) => ({
            ...item,
            dateTime: item.date ? item.date.toISOString() : null,
          })),
        })),
      upcomingMatches: nextRoundGames.map((game) => ({
        id: game.id,
        href: `/games/${game.id}`,
        competition: getCompetitionDisplayName(game.competition),
        homeTeamName: getTeamLabel(game.homeTeam),
        awayTeamName: getTeamLabel(game.awayTeam),
        dateTime: game.dateTime.toISOString(),
      })),
      // Mobile only surfaces Israeli matches. Filter on the RAW country ("Israel")
      // — NOT countryLabel, which is translated to "ישראל" and would match nothing.
      // Israeli teams' friendlies are tagged country="World", so also keep a game
      // where one side is an Israeli team we track.
      live: liveItems
        .filter((snapshot) => snapshot.country === 'Israel' || snapshotInvolvesIsraeliTeam(snapshot, israeliTeamApiIds))
        .slice(0, 6)
        .map(mapHomepageLiveSnapshot),
      news: telegramMessages.slice(0, 5).map((message) => ({
        id: message.id,
        source: message.sourceLabel,
        team: message.teamLabel || null,
        imageUrl: message.imageUrl || null,
        preview: truncateText(message.text.replace(/\s+/g, ' ').trim(), 160),
        publishedAt: message.publishedAt ? message.publishedAt.toISOString() : null,
        url: message.url,
      })),
    },
    // Null only when there is nothing at all — birthdays alone still render
    // (off-season days often have zero anniversary matches).
    onThisDay:
      onThisDayData && (onThisDayData.match || onThisDayData.birthdays.length)
        ? {
            match: onThisDayData.match
              ? {
                  gameId: onThisDayData.match.gameId,
                  yearsAgo: onThisDayData.match.yearsAgo,
                  headline: onThisDayData.match.headline,
                  competitionName: onThisDayData.match.competitionName,
                }
              : null,
            birthdays: onThisDayData.birthdays.map((b) => ({ playerId: b.playerId, nameHe: b.nameHe, age: b.age, currentTeam: b.currentTeam })),
          }
        : null,
  };
}

export async function getMobileLivePayload(limit = 50) {
  const items = await getHomepageLiveSnapshots(null, { limit });
  const mobileItems = items.map(mapHomepageLiveSnapshot);

  const groups = mobileItems.reduce(
    (map, item) => {
      const key = `${item.countryLabel}__${item.leagueLabel}`;
      if (!map[key]) {
        map[key] = {
          key,
          countryLabel: item.countryLabel,
          countryFlagUrl: item.countryFlagUrl,
          leagueLabel: item.leagueLabel,
          matches: [],
        };
      }

      map[key].matches.push(item);
      return map;
    },
    {} as Record<
      string,
      {
        key: string;
        countryLabel: string;
        countryFlagUrl: string | null;
        leagueLabel: string;
        matches: ReturnType<typeof mapHomepageLiveSnapshot>[];
      }
    >
  );

  return {
    updatedAt: new Date().toISOString(),
    hasLive: mobileItems.length > 0,
    message: mobileItems.length > 0 ? null : 'נכון לעכשיו אין משחקים בלייב',
    items: mobileItems,
    groups: Object.values(groups),
  };
}
