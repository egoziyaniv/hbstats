jest.mock('@/lib/prisma', () => ({
  prisma: { competitionLeaderboardEntry: { groupBy: jest.fn() }, game: { findMany: jest.fn() } },
}));
jest.mock('@/lib/history/club-identity', () => ({ getClubFamily: jest.fn(), getClubTeamIndex: jest.fn() }));
import { prisma } from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';
import { clubAllTimeTopScorers, clubTopOpponents } from '@/lib/stats-qa/aggregations';

it('sums TOP_SCORERS by player across the club teams, desc', async () => {
  (getClubFamily as jest.Mock).mockResolvedValue({ teamIds: ['t1', 't2'], nameHe: 'הפועל ב"ש' });
  (prisma.competitionLeaderboardEntry.groupBy as jest.Mock).mockResolvedValue([
    { playerId: 'p1', playerNameHe: 'ברדה', _sum: { value: 94 } },
    { playerId: 'p2', playerNameHe: 'אוחיון', _sum: { value: 71 } },
  ]);
  const rows = await clubAllTimeTopScorers('api-563', 6);
  expect(prisma.competitionLeaderboardEntry.groupBy).toHaveBeenCalledWith(
    expect.objectContaining({ by: ['playerId', 'playerNameHe'], where: { category: 'TOP_SCORERS', teamId: { in: ['t1', 't2'] } } })
  );
  expect(rows[0]).toEqual({ playerId: 'p1', nameHe: 'ברדה', goals: 94 });
  expect(rows).toHaveLength(2);
});

it('tallies wins/draws/losses per opponent club, deduped by clubKey', async () => {
  (getClubFamily as jest.Mock).mockResolvedValue({ teamIds: ['t1'], clubKey: 'api-563', nameHe: 'ב"ש' });
  (getClubTeamIndex as jest.Mock).mockResolvedValue(
    new Map([['t9', { clubKey: 'api-99', nameHe: 'יריבה' }]])
  );
  (prisma.game.findMany as jest.Mock).mockResolvedValue([
    { homeTeamId: 't1', awayTeamId: 't9', homeScore: 3, awayScore: 1 },
  ]);
  const rows = await clubTopOpponents('api-563', 5);
  expect(rows).toEqual([
    { clubKey: 'api-99', nameHe: 'יריבה', games: 1, wins: 1, draws: 0, losses: 0 },
  ]);
});
