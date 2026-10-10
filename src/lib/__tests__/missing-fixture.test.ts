const { planMissingFixture } = require('../../../scripts/lib/missing-fixture');

const fixture = {
  fixture: { id: 1001, date: '2026-10-10T17:00:00+00:00', timestamp: 1791651600, timezone: 'UTC', status: { short: 'NS', long: 'Not Started' }, venue: { name: 'Turner Stadium' }, referee: null },
  league: { round: 'Regular Season - 6' },
  teams: { home: { id: 563, name: 'Hapoel Beer Sheva' }, away: { id: 604, name: 'Maccabi Tel Aviv' } },
  goals: { home: null, away: null },
};
const base = { fixture, homeTeamId: 'home', awayTeamId: 'away' };

it('creates a fixture we hold no row for, with the Hebrew round label', () => {
  const plan = planMissingFixture(base);
  expect(plan.action).toBe('create');
  expect(plan.data).toMatchObject({
    apiFootballId: 1001, homeTeamId: 'home', awayTeamId: 'away', status: 'SCHEDULED',
    roundNameEn: 'Regular Season - 6', roundNameHe: 'מחזור 6', homeScore: null, awayScore: null,
  });
  expect(plan.data.dateTime.toISOString()).toBe('2026-10-10T17:00:00.000Z');
});
it('prefers the round label the existing rows use', () => {
  expect(planMissingFixture({ ...base, roundNameHe: 'מחזור 6 (ליגה)' }).data.roundNameHe).toBe('מחזור 6 (ליגה)');
});
it('links an unlinked row for the same teams on a placeholder date instead of duplicating it', () => {
  const plan = planMissingFixture({ ...base, candidates: [{ id: 'g1', apiFootballId: null, dateTime: new Date('2026-10-12T17:00:00Z') }] });
  expect(plan).toEqual({ action: 'link', gameId: 'g1', data: { apiFootballId: 1001, dateTime: new Date('2026-10-10T17:00:00Z') } });
});
it('creates rather than links when the only same-teams rows are other fixtures', () => {
  expect(planMissingFixture({ ...base, candidates: [
    { id: 'g1', apiFootballId: 999, dateTime: new Date('2026-10-05T17:00:00Z') },
    { id: 'g2', apiFootballId: null, dateTime: new Date('2027-03-01T17:00:00Z') },
  ] }).action).toBe('create');
});
it('skips when it cannot tell which unlinked row is this fixture', () => {
  const near = (id: string) => ({ id, apiFootballId: null, dateTime: new Date('2026-10-11T17:00:00Z') });
  expect(planMissingFixture({ ...base, candidates: [near('a'), near('b')] }).action).toBe('skip');
});
it('skips when a team is not in our DB for the season', () => {
  expect(planMissingFixture({ ...base, awayTeamId: null }).action).toBe('skip');
});
it('stores the score only for a finished fixture', () => {
  const ft = { ...fixture, fixture: { ...fixture.fixture, status: { short: 'FT', long: 'Match Finished' } }, goals: { home: 2, away: 1 } };
  expect(planMissingFixture({ ...base, fixture: ft }).data).toMatchObject({ status: 'COMPLETED', homeScore: 2, awayScore: 1 });
});
