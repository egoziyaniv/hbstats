export {};
const { planRoundBackfill } = require('../../../scripts/lib/rsssf-round-match');

const row = (round: string, home = 'הפועל באר שבע', away = 'מכבי חיפה', hs = 1, as = 0) =>
  ({ year: 1993, homeNameHe: home, awayNameHe: away, homeScore: hs, awayScore: as, round });
const game = (id: string, home = 'הפועל באר שבע', away = 'מכבי חיפה', hs = 1, as = 0) =>
  ({ id, year: 1993, homeNameHe: home, awayNameHe: away, homeScore: hs, awayScore: as });

it('copies the round of the RSSSF row with the same season, teams and score', () => {
  expect(planRoundBackfill([row('Round 4'), row('Round 9', 'מכבי חיפה', 'הפועל באר שבע', 2, 0)], [game('g1')]))
    .toEqual({ updates: [{ gameId: 'g1', roundNameEn: 'Round 4' }], skipped: [] });
});
it('hands out rounds in order when a pairing repeats with the same score', () => {
  const { updates } = planRoundBackfill([row('Round 25'), row('Round 3')], [game('b'), game('a')]);
  expect(updates).toEqual([{ gameId: 'a', roundNameEn: 'Round 3' }, { gameId: 'b', roundNameEn: 'Round 25' }]);
});
it('writes nothing for a key whose row and game counts differ', () => {
  expect(planRoundBackfill([row('Round 3')], [game('a'), game('b')]))
    .toEqual({ updates: [], skipped: [{ key: '1993|הפועל באר שבע|מכבי חיפה|1|0', rows: 1, games: 2 }] });
  expect(planRoundBackfill([], [game('a')]).updates).toEqual([]);
});
it('does not match across seasons or scores', () => {
  expect(planRoundBackfill([{ ...row('Round 3'), year: 1994 }, row('Round 5', undefined, undefined, 2, 2)], [game('a')]).updates).toEqual([]);
});
