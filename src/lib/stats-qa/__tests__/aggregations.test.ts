jest.mock('@/lib/prisma', () => ({
  prisma: { competitionLeaderboardEntry: { findMany: jest.fn() }, game: { findMany: jest.fn() } },
}));
jest.mock('@/lib/history/club-identity', () => ({ getClubFamily: jest.fn(), getClubTeamIndex: jest.fn() }));
import { prisma } from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';
import { clubAllTimeTopScorers, clubTopOpponents } from '@/lib/stats-qa/aggregations';

it('folds TOP_SCORERS by canonical player across seasons, desc', async () => {
  (getClubFamily as jest.Mock).mockResolvedValue({ teamIds: ['t1', 't2'], nameHe: 'הפועל ב"ש' });
  (prisma.competitionLeaderboardEntry.findMany as jest.Mock).mockResolvedValue([
    // Same real player under two per-season Player rows → must merge under canonical 'P1'.
    { playerId: 'p1a', playerNameHe: 'ברדה', value: 50, player: { canonicalPlayerId: 'P1', nameHe: 'ברדה', canonicalPlayer: { nameHe: 'אליניב ברדה' } } },
    { playerId: 'p1b', playerNameHe: 'א. ברדה', value: 44, player: { canonicalPlayerId: 'P1', nameHe: 'א. ברדה', canonicalPlayer: { nameHe: 'אליניב ברדה' } } },
    // A player that is its own canonical head (canonicalPlayerId null) → keyed by own id.
    { playerId: 'p2', playerNameHe: 'אוחיון', value: 71, player: { canonicalPlayerId: null, nameHe: 'אוחיון', canonicalPlayer: null } },
  ]);
  const rows = await clubAllTimeTopScorers('api-563', 6);
  expect(prisma.competitionLeaderboardEntry.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { category: 'TOP_SCORERS', teamId: { in: ['t1', 't2'] } } })
  );
  // 50 + 44 fold into one canonical row (94), beating the 71 row; display name + link use the canonical head.
  expect(rows[0]).toEqual({ playerId: 'P1', nameHe: 'אליניב ברדה', goals: 94 });
  expect(rows[1]).toEqual({ playerId: 'p2', nameHe: 'אוחיון', goals: 71 });
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
