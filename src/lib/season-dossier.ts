import prisma from '@/lib/prisma';
import {
  calculateSeasonMetrics,
  competitionBucket,
  resolveTeamScore,
  type SeasonDossierGameInput,
} from '@/lib/season-dossier-metrics';
import type {
  MatchStatus,
  SeasonDossierCoverage,
  SeasonDossierEvidenceGame,
  SeasonDossierPayload,
  SeasonDossierSource,
  TeamSummary,
} from '@shared/types/mobile-api';

const BEER_SHEVA_API_FOOTBALL_ID = 563;
const LIGAT_HAAL_API_FOOTBALL_ID = 383;
// Historical imports use this stable canonical id when apiFootballId is absent.
const LIGAT_HAAL_CANONICAL_ID = 'comp_liga_haal';
const FRIENDLY_API_FOOTBALL_ID = 667;
const PILOT_YEARS = new Set([2025, 2026]);

type BuildSeasonDossierOptions = {
  includeDrafts?: boolean;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function teamSummary(team: {
  id: string;
  apiFootballId: number | null;
  nameEn: string;
  nameHe: string;
  logoUrl: string | null;
}): TeamSummary {
  return {
    id: team.id,
    apiId: team.apiFootballId,
    nameEn: team.nameEn,
    nameHe: team.nameHe,
    logoUrl: team.logoUrl,
  };
}

function matchStatus(status: string): MatchStatus {
  switch (status) {
    case 'ONGOING':
      return 'live';
    case 'COMPLETED':
      return 'finished';
    case 'CANCELLED':
      return 'cancelled';
    default:
      return 'scheduled';
  }
}

function mapSource(source: {
  id: string;
  momentId: string | null;
  labelHe: string;
  provider: string;
  url: string;
  scope: 'METRICS' | 'EDITORIAL' | 'BOTH';
  competitionId: string | null;
  coverageStatus: 'COMPLETE' | 'PARTIAL' | 'UNKNOWN';
  coverageFrom: Date | null;
  coverageTo: Date | null;
  verifiedAt: Date | null;
  noteHe: string | null;
}): SeasonDossierSource {
  return {
    id: source.id,
    momentId: source.momentId,
    labelHe: source.labelHe,
    provider: source.provider,
    url: source.url,
    scope: source.scope,
    competitionId: source.competitionId,
    coverageStatus: source.coverageStatus,
    coverageFrom: iso(source.coverageFrom),
    coverageTo: iso(source.coverageTo),
    verifiedAt: iso(source.verifiedAt),
    noteHe: source.noteHe,
  };
}

export async function buildSeasonDossier(
  seasonId: string,
  { includeDrafts = false }: BuildSeasonDossierOptions = {},
): Promise<SeasonDossierPayload | null> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { id: true, year: true, name: true },
  });
  if (!season || !PILOT_YEARS.has(season.year)) return null;

  const team = await prisma.team.findFirst({
    where: { seasonId: season.id, apiFootballId: BEER_SHEVA_API_FOOTBALL_ID },
    select: {
      id: true,
      apiFootballId: true,
      nameEn: true,
      nameHe: true,
      logoUrl: true,
    },
  });
  if (!team) return null;

  const [dossier, rawGames, standingRows, players, coachAssignment, honorRows] = await Promise.all([
    prisma.clubSeasonDossier.findUnique({
      where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
      select: {
        id: true,
        introHe: true,
        summaryHe: true,
        heroImageUrl: true,
        isPublished: true,
        moments: {
          select: {
            id: true,
            eventDate: true,
            titleHe: true,
            bodyHe: true,
            imageUrl: true,
            displayOrder: true,
            isPublished: true,
            gameId: true,
            mediaAsset: { select: { filePath: true } },
          },
          orderBy: [{ eventDate: 'asc' }, { displayOrder: 'asc' }],
        },
        sources: {
          select: {
            id: true,
            momentId: true,
            labelHe: true,
            provider: true,
            url: true,
            scope: true,
            competitionId: true,
            coverageStatus: true,
            coverageFrom: true,
            coverageTo: true,
            verifiedAt: true,
            noteHe: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    }),
    prisma.game.findMany({
      where: {
        seasonId: season.id,
        status: { in: ['SCHEDULED', 'ONGOING', 'COMPLETED'] },
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        competition: {
          is: {
            OR: [
              { apiFootballId: null },
              { apiFootballId: { not: FRIENDLY_API_FOOTBALL_ID } },
            ],
          },
        },
      },
      select: {
        id: true,
        dateTime: true,
        status: true,
        homeTeamId: true,
        awayTeamId: true,
        homeScore: true,
        awayScore: true,
        homeScoreRegular: true,
        awayScoreRegular: true,
        homePenalty: true,
        awayPenalty: true,
        roundNameHe: true,
        roundNameEn: true,
        competitionId: true,
        competition: {
          select: {
            id: true,
            apiFootballId: true,
            nameHe: true,
            nameEn: true,
            logoUrl: true,
            type: true,
          },
        },
        homeTeam: {
          select: { id: true, apiFootballId: true, nameEn: true, nameHe: true, logoUrl: true },
        },
        awayTeam: {
          select: { id: true, apiFootballId: true, nameEn: true, nameHe: true, logoUrl: true },
        },
      },
      orderBy: { dateTime: 'asc' },
    }),
    prisma.standing.findMany({
      where: {
        seasonId: season.id,
        teamId: team.id,
        OR: [
          { competition: { apiFootballId: LIGAT_HAAL_API_FOOTBALL_ID } },
          { competitionId: LIGAT_HAAL_CANONICAL_ID },
        ],
      },
      select: {
        position: true,
        played: true,
        wins: true,
        draws: true,
        losses: true,
        goalsFor: true,
        goalsAgainst: true,
        points: true,
        competitionId: true,
        competition: { select: { id: true, apiFootballId: true, nameHe: true } },
      },
    }),
    prisma.player.findMany({
      where: { teamId: team.id },
      select: {
        id: true,
        nameHe: true,
        nameEn: true,
        photoUrl: true,
        position: true,
        jerseyNumber: true,
        playerStats: {
          where: { seasonId: season.id },
          select: {
            appearances: true,
            gamesPlayed: true,
            starts: true,
            minutesPlayed: true,
            goals: true,
            assists: true,
            position: true,
          },
        },
      },
      orderBy: [{ jerseyNumber: 'asc' }, { nameHe: 'asc' }],
    }),
    prisma.teamCoachAssignment.findFirst({
      where: { teamId: team.id, seasonId: season.id },
      select: {
        coachId: true,
        apiFootballCoachId: true,
        coachNameEn: true,
        coachNameHe: true,
        startDate: true,
        endDate: true,
        coach: { select: { id: true, nameEn: true, nameHe: true, photoUrl: true } },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.clubHonor.findMany({
      where: { year: season.year },
      select: { competitionHe: true, place: true },
      orderBy: { displayOrder: 'asc' },
    }),
  ]);

  const visibleDossier = dossier && (includeDrafts || dossier.isPublished) ? dossier : null;
  const visibleMoments = (visibleDossier?.moments ?? []).filter(
    (moment) => includeDrafts || moment.isPublished,
  );
  const visibleMomentIds = new Set(visibleMoments.map((moment) => moment.id));
  const visibleSources = (visibleDossier?.sources ?? []).filter(
    (source) => source.momentId === null || visibleMomentIds.has(source.momentId),
  );
  const dossierSources = visibleSources.filter((source) => source.momentId === null).map(mapSource);
  const metricSources = dossierSources.filter(
    (source) => source.scope === 'METRICS' || source.scope === 'BOTH',
  );

  const officialGames = rawGames.filter(
    (game) =>
      game.status !== 'CANCELLED' &&
      competitionBucket(game.competition as SeasonDossierGameInput['competition']) !== null,
  );
  const evidenceGames = new Map<string, SeasonDossierEvidenceGame>();
  for (const game of officialGames) {
    const isHome = game.homeTeamId === team.id;
    const score = game.status === 'COMPLETED' ? resolveTeamScore(team.id, game) : null;
    evidenceGames.set(game.id, {
      id: game.id,
      dateTime: game.dateTime.toISOString(),
      status: matchStatus(game.status),
      competitionId: game.competitionId,
      competitionNameHe: game.competition?.nameHe ?? null,
      roundNameHe: game.roundNameHe ?? game.roundNameEn,
      isHome,
      opponent: teamSummary(isHome ? game.awayTeam : game.homeTeam),
      goalsFor: score?.goalsFor ?? null,
      goalsAgainst: score?.goalsAgainst ?? null,
      result: score?.result ?? null,
    });
  }

  const standing =
    standingRows.find((row) => row.competition.apiFootballId === LIGAT_HAAL_API_FOOTBALL_ID) ??
    standingRows.find((row) => row.competitionId === LIGAT_HAAL_CANONICAL_ID) ??
    null;
  const asOf = new Date();
  const metrics = calculateSeasonMetrics(
    team.id,
    officialGames as SeasonDossierGameInput[],
    { position: standing?.position ?? null, competitionId: standing?.competitionId ?? null },
    metricSources,
    asOf,
  );
  const leaguePositionCoverage = metrics[3].coverage as SeasonDossierCoverage;

  const competitionsById = new Map<string, SeasonDossierPayload['competitions'][number]>();
  const gameGroups = new Map<string, SeasonDossierPayload['games'][number]>();
  for (const game of officialGames) {
    if (!game.competition || !game.competitionId) continue;
    if (!competitionsById.has(game.competitionId)) {
      competitionsById.set(game.competitionId, {
        id: game.competition.id,
        nameHe: game.competition.nameHe,
        nameEn: game.competition.nameEn,
        logoUrl: game.competition.logoUrl,
        type: game.competition.type,
      });
    }
    const evidence = evidenceGames.get(game.id);
    if (!evidence) continue;
    const labelHe = game.roundNameHe ?? game.roundNameEn ?? game.competition.nameHe;
    const groupKey = `${game.competitionId}\u0000${labelHe}`;
    const group = gameGroups.get(groupKey) ?? {
      competitionId: game.competitionId,
      labelHe,
      games: [],
    };
    group.games.push(evidence);
    gameGroups.set(groupKey, group);
  }

  const sumStats = (
    stats: typeof players[number]['playerStats'],
    field: 'starts' | 'minutesPlayed' | 'goals' | 'assists',
  ) => (stats.length ? stats.reduce((total, row) => total + row[field], 0) : null);

  return {
    season: { id: season.id, year: season.year, name: season.name },
    team: teamSummary(team),
    status: season.year === 2026 ? 'CURRENT' : 'FINAL',
    asOf: asOf.toISOString(),
    editorial: visibleDossier
      ? {
          introHe: visibleDossier.introHe,
          summaryHe: visibleDossier.summaryHe,
          heroImageUrl: visibleDossier.heroImageUrl,
        }
      : null,
    metrics,
    sources: dossierSources,
    moments: visibleMoments.map((moment) => ({
      id: moment.id,
      eventDate: moment.eventDate.toISOString(),
      titleHe: moment.titleHe,
      bodyHe: moment.bodyHe,
      imageUrl: moment.imageUrl ?? moment.mediaAsset?.filePath ?? null,
      displayOrder: moment.displayOrder,
      game: moment.gameId ? evidenceGames.get(moment.gameId) ?? null : null,
      sources: visibleSources
        .filter((source) => source.momentId === moment.id)
        .map(mapSource),
    })),
    squad: players.map((player) => ({
      playerId: player.id,
      nameHe: player.nameHe,
      nameEn: player.nameEn,
      photoUrl: player.photoUrl,
      position: player.position ?? player.playerStats[0]?.position ?? null,
      jerseyNumber: player.jerseyNumber,
      appearances: player.playerStats.length
        ? player.playerStats.reduce(
            (total, stat) => total + (stat.appearances ?? stat.gamesPlayed),
            0,
          )
        : null,
      starts: sumStats(player.playerStats, 'starts'),
      minutes: sumStats(player.playerStats, 'minutesPlayed'),
      goals: sumStats(player.playerStats, 'goals'),
      assists: sumStats(player.playerStats, 'assists'),
    })),
    coach: coachAssignment
      ? {
          id: coachAssignment.coach?.id ?? coachAssignment.coachId ?? null,
          nameHe:
            coachAssignment.coach?.nameHe ??
            coachAssignment.coachNameHe ??
            coachAssignment.coachNameEn,
          nameEn: coachAssignment.coach?.nameEn ?? coachAssignment.coachNameEn ?? null,
          photoUrl:
            coachAssignment.coach?.photoUrl ??
            (coachAssignment.apiFootballCoachId
              ? `https://media.api-sports.io/football/coachs/${coachAssignment.apiFootballCoachId}.png`
              : null),
          startDate: iso(coachAssignment.startDate),
          endDate: iso(coachAssignment.endDate),
        }
      : null,
    standing: standing
      ? {
          competitionId: standing.competitionId,
          competitionNameHe: standing.competition.nameHe,
          position: standing.position,
          played: standing.played,
          wins: standing.wins,
          draws: standing.draws,
          losses: standing.losses,
          goalsFor: standing.goalsFor,
          goalsAgainst: standing.goalsAgainst,
          points: standing.points,
          coverage: leaguePositionCoverage,
        }
      : null,
    honors: honorRows,
    competitions: [...competitionsById.values()],
    games: [...gameGroups.values()],
  };
}
