import { buildMatchdaySummary } from '@/lib/matchday-summary';

describe('buildMatchdaySummary', () => {
  it('counts only completed Hapoel Beer Sheva games toward the personal record', () => {
    expect(buildMatchdaySummary([
      { status: 'COMPLETED', homeScore: 2, awayScore: 1, homeTeamApiId: 563, awayTeamApiId: 2 },
      { status: 'COMPLETED', homeScore: 0, awayScore: 0, homeTeamApiId: 4, awayTeamApiId: 563 },
      { status: 'SCHEDULED', homeScore: null, awayScore: null, homeTeamApiId: 563, awayTeamApiId: 5 },
      { status: 'COMPLETED', homeScore: 1, awayScore: 0, homeTeamApiId: 6, awayTeamApiId: 7 },
    ])).toEqual({ attended: 4, completed: 3, hbsGames: 2, wins: 1, draws: 1, losses: 0 });
  });
});
