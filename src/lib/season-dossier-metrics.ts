import type {
  SeasonDossierCoverage,
  SeasonDossierMetrics,
  SeasonDossierSource,
} from '@shared/types/mobile-api';

export type SeasonDossierCompetitionInput = {
  id: string;
  nameHe: string;
  type: 'LEAGUE' | 'CUP' | 'EUROPE';
  apiFootballId: number | null;
};

export type SeasonDossierGameInput = {
  id: string;
  status: 'SCHEDULED' | 'ONGOING' | 'COMPLETED' | 'CANCELLED';
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  homeScoreRegular?: number | null;
  awayScoreRegular?: number | null;
  homePenalty?: number | null;
  awayPenalty?: number | null;
  competition: SeasonDossierCompetitionInput | null;
};

export type SeasonDossierMetricSourceInput = Pick<
  SeasonDossierSource,
  'scope' | 'competitionId' | 'coverageStatus'
>;

export type ResolvedTeamScore = {
  goalsFor: number;
  goalsAgainst: number;
  result: 'W' | 'D' | 'L';
};

const OFFICIAL_COMPETITION_TYPES = new Set(['LEAGUE', 'CUP', 'EUROPE']);
const FRIENDLY_API_FOOTBALL_ID = 667;

function isValidScore(value: number | null): value is number {
  return Number.isInteger(value) && value >= 0;
}

export function competitionBucket(
  competition: SeasonDossierCompetitionInput | null | undefined,
): SeasonDossierCompetitionInput['type'] | null {
  if (
    !competition ||
    competition.apiFootballId === FRIENDLY_API_FOOTBALL_ID ||
    !OFFICIAL_COMPETITION_TYPES.has(competition.type)
  ) {
    return null;
  }

  return competition.type;
}

export function isOfficialCompletedGame(game: SeasonDossierGameInput): boolean {
  return (
    game.status === 'COMPLETED' &&
    competitionBucket(game.competition) !== null &&
    isValidScore(game.homeScore) &&
    isValidScore(game.awayScore)
  );
}

export function resolveTeamScore(
  teamId: string,
  game: Pick<
    SeasonDossierGameInput,
    'homeTeamId' | 'awayTeamId' | 'homeScore' | 'awayScore'
  >,
): ResolvedTeamScore | null {
  if (!isValidScore(game.homeScore) || !isValidScore(game.awayScore)) return null;

  let goalsFor: number;
  let goalsAgainst: number;

  if (game.homeTeamId === teamId) {
    goalsFor = game.homeScore;
    goalsAgainst = game.awayScore;
  } else if (game.awayTeamId === teamId) {
    goalsFor = game.awayScore;
    goalsAgainst = game.homeScore;
  } else {
    return null;
  }

  return {
    goalsFor,
    goalsAgainst,
    result: goalsFor > goalsAgainst ? 'W' : goalsFor < goalsAgainst ? 'L' : 'D',
  };
}

function metricSources(sources: readonly SeasonDossierMetricSourceInput[]) {
  return sources.filter((source) => source.scope === 'METRICS' || source.scope === 'BOTH');
}

function hasCompleteCoverage(
  sources: readonly SeasonDossierMetricSourceInput[],
  competitionId: string,
): boolean {
  return metricSources(sources).some(
    (source) =>
      source.coverageStatus === 'COMPLETE' &&
      (source.competitionId === null || source.competitionId === competitionId),
  );
}

function coverageForBasis(hasBasis: boolean, complete: boolean): SeasonDossierCoverage {
  if (!hasBasis) return 'UNKNOWN';
  return complete ? 'COMPLETE' : 'PARTIAL';
}

export function calculateSeasonMetrics(
  teamId: string,
  games: readonly SeasonDossierGameInput[],
  leaguePosition: number | null,
  sources: readonly SeasonDossierMetricSourceInput[],
  asOf: Date | string,
): SeasonDossierMetrics {
  const basis = games.flatMap((game) => {
    if (!isOfficialCompletedGame(game) || !game.competition) return [];
    const score = resolveTeamScore(teamId, game);
    return score ? [{ game, competition: game.competition, score }] : [];
  });

  const competitionGroups = new Map<
    string,
    {
      competition: SeasonDossierCompetitionInput;
      matches: number;
      wins: number;
      goalsFor: number;
    }
  >();

  for (const item of basis) {
    const current = competitionGroups.get(item.competition.id) ?? {
      competition: item.competition,
      matches: 0,
      wins: 0,
      goalsFor: 0,
    };
    current.matches += 1;
    current.wins += item.score.result === 'W' ? 1 : 0;
    current.goalsFor += item.score.goalsFor;
    competitionGroups.set(item.competition.id, current);
  }

  const hasGameBasis = basis.length > 0;
  const allCompetitionCoverageComplete =
    hasGameBasis &&
    [...competitionGroups.keys()].every((competitionId) =>
      hasCompleteCoverage(sources, competitionId),
    );
  const aggregateCoverage = coverageForBasis(hasGameBasis, allCompetitionCoverageComplete);
  const evidenceGameIds = basis.map(({ game }) => game.id);
  const computedAt = new Date(asOf).toISOString();

  const breakdown = (field: 'matches' | 'wins' | 'goalsFor') =>
    [...competitionGroups.values()].map((group) => ({
      competitionId: group.competition.id,
      competitionNameHe: group.competition.nameHe,
      value: group[field],
      coverage: coverageForBasis(
        group.matches > 0,
        hasCompleteCoverage(sources, group.competition.id),
      ),
    }));

  const leagueCompetitionIds = [...competitionGroups.values()]
    .filter((group) => competitionBucket(group.competition) === 'LEAGUE')
    .map((group) => group.competition.id);
  const globalCoverageComplete = metricSources(sources).some(
    (source) => source.competitionId === null && source.coverageStatus === 'COMPLETE',
  );
  const leaguePositionCoverageComplete =
    globalCoverageComplete ||
    leagueCompetitionIds.some((competitionId) => hasCompleteCoverage(sources, competitionId));

  return [
    {
      key: 'matches',
      definitionHe: 'כל המשחקים הרשמיים שנכללו בכיסוי.',
      value: hasGameBasis ? basis.length : null,
      coverage: aggregateCoverage,
      computedAt,
      competitionBreakdown: breakdown('matches'),
      evidenceGameIds,
    },
    {
      key: 'wins',
      definitionHe: 'משחקים רשמיים שהסתיימו בניצחון.',
      value: hasGameBasis
        ? basis.reduce((total, item) => total + (item.score.result === 'W' ? 1 : 0), 0)
        : null,
      coverage: aggregateCoverage,
      computedAt,
      competitionBreakdown: breakdown('wins'),
      evidenceGameIds,
    },
    {
      key: 'goalsFor',
      definitionHe: 'שערי הקבוצה במשחקים הרשמיים שנכללו בכיסוי.',
      value: hasGameBasis
        ? basis.reduce((total, item) => total + item.score.goalsFor, 0)
        : null,
      coverage: aggregateCoverage,
      computedAt,
      competitionBreakdown: breakdown('goalsFor'),
      evidenceGameIds,
    },
    {
      key: 'leaguePosition',
      definitionHe: 'המיקום האחרון בטבלת הליגה.',
      value: leaguePosition,
      coverage: coverageForBasis(leaguePosition !== null, leaguePositionCoverageComplete),
      computedAt,
      competitionBreakdown: [],
      evidenceGameIds: [],
    },
  ];
}
