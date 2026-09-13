import {
  calculateSeasonMetrics,
  competitionBucket,
  isOfficialCompletedGame,
  resolveTeamScore,
} from '@/lib/season-dossier-metrics';

const TEAM_ID = 'team-season';

function game(overrides: Record<string, unknown> = {}) {
  return {
    id: 'game-1',
    status: 'COMPLETED' as const,
    homeTeamId: TEAM_ID,
    awayTeamId: 'opponent',
    homeScore: 2,
    awayScore: 1,
    homeScoreRegular: null,
    awayScoreRegular: null,
    homePenalty: null,
    awayPenalty: null,
    competition: {
      id: 'league',
      nameHe: 'ליגת העל',
      type: 'LEAGUE' as const,
      apiFootballId: 383,
    },
    ...overrides,
  };
}

const completeMetricSource = {
  scope: 'METRICS' as const,
  competitionId: null,
  coverageStatus: 'COMPLETE' as const,
};

describe('season dossier metric game qualification', () => {
  it('accepts a completed official match with a valid canonical score', () => {
    expect(isOfficialCompletedGame(game())).toBe(true);
  });

  it.each([
    ['missing home score', { homeScore: null }],
    ['missing away score', { awayScore: null }],
    ['scheduled', { status: 'SCHEDULED' }],
    ['cancelled', { status: 'CANCELLED' }],
    [
      'API-Football friendly',
      {
        competition: {
          id: 'friendly',
          nameHe: 'משחק ידידות',
          type: 'CUP',
          apiFootballId: 667,
        },
      },
    ],
  ])('rejects %s games', (_label, overrides) => {
    expect(isOfficialCompletedGame(game(overrides))).toBe(false);
  });

  it('groups only official competition types', () => {
    expect(competitionBucket(game().competition)).toBe('LEAGUE');
    expect(
      competitionBucket({ id: 'cup', nameHe: 'גביע המדינה', type: 'CUP', apiFootballId: 384 }),
    ).toBe('CUP');
    expect(
      competitionBucket({ id: 'europe', nameHe: 'הליגה האירופית', type: 'EUROPE', apiFootballId: 3 }),
    ).toBe('EUROPE');
    expect(
      competitionBucket({ id: 'friendly', nameHe: 'ידידות', type: 'CUP', apiFootballId: 667 }),
    ).toBeNull();
  });
});

describe('resolveTeamScore', () => {
  it('resolves a home win from the canonical score', () => {
    expect(resolveTeamScore(TEAM_ID, game())).toEqual({ goalsFor: 2, goalsAgainst: 1, result: 'W' });
  });

  it('resolves an away win from the canonical score', () => {
    expect(
      resolveTeamScore(
        TEAM_ID,
        game({ homeTeamId: 'opponent', awayTeamId: TEAM_ID, homeScore: 0, awayScore: 2 }),
      ),
    ).toEqual({ goalsFor: 2, goalsAgainst: 0, result: 'W' });
  });

  it('treats a canonical draw as a draw even when the team wins the shootout', () => {
    expect(
      resolveTeamScore(
        TEAM_ID,
        game({
          homeScore: 1,
          awayScore: 1,
          homePenalty: 5,
          awayPenalty: 4,
        }),
      ),
    ).toEqual({ goalsFor: 1, goalsAgainst: 1, result: 'D' });
  });

  it('returns a valid zero score for a 0-0 draw', () => {
    expect(resolveTeamScore(TEAM_ID, game({ homeScore: 0, awayScore: 0 }))).toEqual({
      goalsFor: 0,
      goalsAgainst: 0,
      result: 'D',
    });
  });

  it('returns null for incomplete scores and unrelated teams', () => {
    expect(resolveTeamScore(TEAM_ID, game({ awayScore: null }))).toBeNull();
    expect(resolveTeamScore('different-team', game())).toBeNull();
  });
});

describe('calculateSeasonMetrics', () => {
  it('calculates the exact tuple, competition breakdowns, and evidence from one official basis', () => {
    const games = [
      game({ id: 'league-home-win' }),
      game({
        id: 'cup-shootout-draw',
        homeTeamId: 'cup-opponent',
        awayTeamId: TEAM_ID,
        homeScore: 1,
        awayScore: 1,
        homePenalty: 3,
        awayPenalty: 4,
        competition: { id: 'cup', nameHe: 'גביע המדינה', type: 'CUP', apiFootballId: 384 },
      }),
      game({
        id: 'europe-away-win',
        homeTeamId: 'europe-opponent',
        awayTeamId: TEAM_ID,
        homeScore: 0,
        awayScore: 2,
        competition: { id: 'europe', nameHe: 'הליגה האירופית', type: 'EUROPE', apiFootballId: 3 },
      }),
      game({ id: 'league-nil-draw', homeScore: 0, awayScore: 0 }),
      game({ id: 'missing-score', awayScore: null }),
      game({ id: 'scheduled', status: 'SCHEDULED' }),
      game({ id: 'cancelled', status: 'CANCELLED' }),
      game({
        id: 'friendly',
        homeScore: 9,
        awayScore: 0,
        competition: { id: 'friendly', nameHe: 'ידידות', type: 'CUP', apiFootballId: 667 },
      }),
    ];

    const metrics = calculateSeasonMetrics(
      TEAM_ID,
      games,
      2,
      [completeMetricSource],
      '2026-09-13T12:34:56+03:00',
    );

    expect(metrics.map(({ key, value, coverage }) => ({ key, value, coverage }))).toEqual([
      { key: 'matches', value: 4, coverage: 'COMPLETE' },
      { key: 'wins', value: 2, coverage: 'COMPLETE' },
      { key: 'goalsFor', value: 5, coverage: 'COMPLETE' },
      { key: 'leaguePosition', value: 2, coverage: 'COMPLETE' },
    ]);
    expect(metrics.every((metric) => metric.computedAt === '2026-09-13T09:34:56.000Z')).toBe(true);
    expect(metrics.every((metric) => metric.definitionHe.length > 0)).toBe(true);

    const evidenceIds = [
      'league-home-win',
      'cup-shootout-draw',
      'europe-away-win',
      'league-nil-draw',
    ];
    expect(metrics[0].evidenceGameIds).toEqual(evidenceIds);
    expect(metrics[1].evidenceGameIds).toEqual(evidenceIds);
    expect(metrics[2].evidenceGameIds).toEqual(evidenceIds);
    expect(metrics[3].evidenceGameIds).toEqual([]);

    expect(metrics[0].competitionBreakdown).toEqual([
      { competitionId: 'league', competitionNameHe: 'ליגת העל', value: 2, coverage: 'COMPLETE' },
      { competitionId: 'cup', competitionNameHe: 'גביע המדינה', value: 1, coverage: 'COMPLETE' },
      { competitionId: 'europe', competitionNameHe: 'הליגה האירופית', value: 1, coverage: 'COMPLETE' },
    ]);
    expect(metrics[1].competitionBreakdown.map((item) => item.value)).toEqual([1, 0, 1]);
    expect(metrics[2].competitionBreakdown.map((item) => item.value)).toEqual([2, 1, 2]);
    expect(metrics[3].competitionBreakdown).toEqual([]);
  });

  it('returns unknown null aggregates when no valid completed official match establishes coverage', () => {
    const metrics = calculateSeasonMetrics(
      TEAM_ID,
      [
        game({ id: 'scheduled', status: 'SCHEDULED', homeScore: 0, awayScore: 0 }),
        game({ id: 'missing-score', awayScore: null }),
      ],
      null,
      [completeMetricSource],
      new Date('2026-09-13T09:00:00.000Z'),
    );

    expect(metrics.map((metric) => metric.value)).toEqual([null, null, null, null]);
    expect(metrics.map((metric) => metric.coverage)).toEqual([
      'UNKNOWN',
      'UNKNOWN',
      'UNKNOWN',
      'UNKNOWN',
    ]);
    expect(metrics.every((metric) => metric.evidenceGameIds.length === 0)).toBe(true);
    expect(metrics.every((metric) => metric.competitionBreakdown.length === 0)).toBe(true);
  });

  it('uses a valid 0-0 to establish partial zero-valued aggregates', () => {
    const metrics = calculateSeasonMetrics(
      TEAM_ID,
      [game({ id: 'nil-draw', homeScore: 0, awayScore: 0 })],
      null,
      [],
      '2026-09-13T09:00:00.000Z',
    );

    expect(metrics.slice(0, 3).map(({ value, coverage }) => ({ value, coverage }))).toEqual([
      { value: 1, coverage: 'PARTIAL' },
      { value: 0, coverage: 'PARTIAL' },
      { value: 0, coverage: 'PARTIAL' },
    ]);
    expect(metrics[3]).toMatchObject({ value: null, coverage: 'UNKNOWN', evidenceGameIds: [] });
  });

  it('requires complete coverage for every represented competition', () => {
    const metrics = calculateSeasonMetrics(
      TEAM_ID,
      [
        game({ id: 'league-game' }),
        game({
          id: 'cup-game',
          competition: { id: 'cup', nameHe: 'גביע המדינה', type: 'CUP', apiFootballId: 384 },
        }),
      ],
      1,
      [
        { ...completeMetricSource, competitionId: 'league' },
        { ...completeMetricSource, competitionId: 'cup', coverageStatus: 'PARTIAL' as const },
      ],
      '2026-09-13T09:00:00.000Z',
    );

    expect(metrics.slice(0, 3).map((metric) => metric.coverage)).toEqual([
      'PARTIAL',
      'PARTIAL',
      'PARTIAL',
    ]);
    expect(metrics[0].competitionBreakdown.map((item) => item.coverage)).toEqual([
      'COMPLETE',
      'PARTIAL',
    ]);
    expect(metrics[3]).toMatchObject({ value: 1, coverage: 'COMPLETE', evidenceGameIds: [] });
  });
});
