import { buildLeaguePositionSeries, filterCompletedGames } from '@/lib/team-chart-data';

const teams = [
  { id: 'hbs', name: 'הפועל באר שבע' },
  { id: 'mta', name: 'מכבי תל אביב' },
  { id: 'mha', name: 'מכבי חיפה' },
];

const games = [
  { id: '1', homeTeamId: 'hbs', awayTeamId: 'mta', homeScore: 2, awayScore: 0, status: 'COMPLETED', round: 1, dateTime: new Date('2026-08-01') },
  { id: '2', homeTeamId: 'mha', awayTeamId: 'hbs', homeScore: 1, awayScore: 1, status: 'COMPLETED', round: 2, dateTime: new Date('2026-08-08') },
  { id: '3', homeTeamId: 'mta', awayTeamId: 'mha', homeScore: null, awayScore: null, status: 'SCHEDULED', round: 2, dateTime: new Date('2026-08-09') },
];

describe('team chart data', () => {
  it('keeps only completed games with a score', () => {
    expect(filterCompletedGames(games).map((game) => game.id)).toEqual(['1', '2']);
  });

  it('builds positions after each completed league round', () => {
    expect(buildLeaguePositionSeries(teams, games, ['hbs', 'mta'])).toEqual([
      { מחזור: '1', 'הפועל באר שבע': 1, 'מכבי תל אביב': 3 },
      { מחזור: '2', 'הפועל באר שבע': 1, 'מכבי תל אביב': 3 },
    ]);
  });
});
