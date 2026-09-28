const { buildCoverageReport } = require('../../../scripts/audit-club-archive');
const season = { id: 's', year: 2005, name: '2005-2006' };
const team = { id: 'bs', seasonId: 's', standings: [{ competitionId: 'comp_liga_leumit', played: 2 }] };
const game = { id: 'g', seasonId: 's', competitionId: 'comp_liga_leumit', homeTeamId: 'bs', awayTeamId: 'x', dateTime: '2005-09-01', status: 'COMPLETED', homeScore: 1, awayScore: 0 };
const build = (overrides: object = {}) => buildCoverageReport({ seasons: [season], teams: [team], games: [game], scrapedMatches: [], scrapedStandings: [], ...overrides }, { from: 2005, to: 2006 });
test('reports entirely absent years and missing league fixtures', () => {
  const rows = build().seasons;
  expect(rows[0]).toMatchObject({ year: 2005, expectedPlayed: 2, completedLeagueGames: 1, missingGames: 1 });
  expect(rows[1]).toMatchObject({ year: 2006, issues: ['MISSING_SEASON'] });
});
test('cup and unclassified games do not fill a league coverage gap', () => {
  const row = build({ games: [game, { ...game, id: 'cup', competitionId: 'cup' }, { ...game, id: 'unknown', competitionId: null }] }).seasons[0];
  expect(row.completedLeagueGames).toBe(1);
  expect(row.unclassifiedGames).toBe(1);
});
test('duplicate fixtures are counted once and flagged', () => {
  const row = build({ games: [game, { ...game, id: 'duplicate' }] }).seasons[0];
  expect(row.completedLeagueGames).toBe(1);
  expect(row.duplicateGames).toBe(1);
});
test('unknown standings cannot be declared complete', () => {
  const row = build({ teams: [{ ...team, standings: [] }] }).seasons[0];
  expect(row.expectedPlayed).toBeNull();
  expect(row.issues).toContain('MISSING_STANDING');
});
test('null scores are not complete results; raw sources are grouped by league and source', () => {
  const row = build({ games: [{ ...game, awayScore: null }], scrapedMatches: [{ season: '2005/2006', source: 'ifa', leagueNameHe: 'ליגה לאומית', homeTeamName: 'הפועל באר שבע', awayTeamName: 'אחרת' }] }).seasons[0];
  expect(row.completedLeagueGames).toBe(0);
  expect(row.rawSources).toEqual([{ source: 'ifa', league: 'ליגה לאומית', matches: 1, standings: 0 }]);
});
test('uses maximum played across split standings without summing phases', () => {
  const row = build({ teams: [{ ...team, standings: [...team.standings, { competitionId: 'comp_liga_leumit', played: 33 }] }] }).seasons[0];
  expect(row.expectedPlayed).toBe(33);
});

export {};
test('recognizes IFA club abbreviation but excludes Maccabi Beer Sheva', () => {
  const row = build({ scrapedMatches: [
    { season: '2005/2006', source: 'footballOrgIl', leagueNameHe: 'ליגה לאומית', homeTeamName: 'הפועל ב"ש', awayTeamName: 'אחרת' },
    { season: '2005/2006', source: 'footballOrgIl', leagueNameHe: 'ליגה לאומית', homeTeamName: 'מכבי ב"ש', awayTeamName: 'אחרת' },
  ] }).seasons[0];
  expect(row.rawSources[0].matches).toBe(1);
});
