import { buildMatchdaySummary } from '@/lib/matchday-summary';

describe('buildMatchdaySummary', () => {
  it('counts only completed Hapoel Beer Sheva games toward the personal record', () => {
    expect(buildMatchdaySummary([
      { status: 'COMPLETED', homeScore: 2, awayScore: 1, homeTeamApiId: 563, awayTeamApiId: 2 },
      { status: 'COMPLETED', homeScore: 0, awayScore: 0, homeTeamApiId: 4, awayTeamApiId: 563 },
      { status: 'SCHEDULED', homeScore: null, awayScore: null, homeTeamApiId: 563, awayTeamApiId: 5 },
      { status: 'COMPLETED', homeScore: 1, awayScore: 0, homeTeamApiId: 6, awayTeamApiId: 7 },
    ])).toMatchObject({ attended: 4, completed: 3, hbsGames: 2, wins: 1, draws: 1, losses: 0 });
  });
});

it('orients goals, counts home/away games and skips unknown/duplicate venues', () => {
  const summary = buildMatchdaySummary([
    { status: 'COMPLETED', homeScore: 2, awayScore: 1, homeTeamApiId: 563, awayTeamApiId: 2, venueId: 'turner' },
    { status: 'COMPLETED', homeScore: 3, awayScore: 1, homeTeamApiId: 4, awayTeamApiId: 563, venueId: 'turner' },
    { status: 'COMPLETED', homeScore: 0, awayScore: 0, homeTeamApiId: 563, awayTeamApiId: 5, venueId: null },
    { status: 'SCHEDULED', homeScore: 9, awayScore: 9, homeTeamApiId: 563, awayTeamApiId: 5, venueId: 'future' },
    { status: 'COMPLETED', homeScore: 9, awayScore: 9, homeTeamApiId: 1, awayTeamApiId: 2, venueId: 'other' },
    { status: 'COMPLETED', homeScore: null, awayScore: 1, homeTeamApiId: 563, awayTeamApiId: 2, venueId: 'missing-score' },
  ]);
  expect(summary).toMatchObject({ goalsFor: 3, goalsAgainst: 4, homeGames: 2, awayGames: 1, venues: 1 });
});

it('excludes negative scores from every completed-match metric', () => {
  expect(buildMatchdaySummary([
    { status: 'COMPLETED', homeScore: -1, awayScore: 0, homeTeamApiId: 563, awayTeamApiId: 2, venueId: 'bad-home' },
    { status: 'COMPLETED', homeScore: 0, awayScore: -1, homeTeamApiId: 2, awayTeamApiId: 563, venueId: 'bad-away' },
  ])).toEqual({ attended: 2, completed: 0, hbsGames: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, homeGames: 0, awayGames: 0, venues: 0 });
});
