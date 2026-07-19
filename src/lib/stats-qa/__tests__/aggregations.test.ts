jest.mock('@/lib/prisma', () => ({
  prisma: {
    competitionLeaderboardEntry: { findMany: jest.fn() },
    gameEvent: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
  },
}));
jest.mock('@/lib/history/club-identity', () => ({ getClubFamily: jest.fn(), getClubTeamIndex: jest.fn() }));
import { prisma } from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';
import { clubAllTimeTopScorers, leagueAllTimeTopScorers, clubTopOpponents } from '@/lib/stats-qa/aggregations';

it('folds club GOAL events by canonical player, desc', async () => {
  (getClubFamily as jest.Mock).mockResolvedValue({ teamIds: ['t1', 't2'], nameHe: 'הפועל ב"ש' });
  // Each row is one goal event. The same real player appears under two per-season
  // Player rows (p1a/p1b) sharing canonical 'P1' → must count as one scorer.
  (prisma.gameEvent.findMany as jest.Mock).mockResolvedValue([
    { playerId: 'p1a', player: { canonicalPlayerId: 'P1', nameHe: 'סהר', canonicalPlayer: { nameHe: 'בן סהר' } } },
    { playerId: 'p1a', player: { canonicalPlayerId: 'P1', nameHe: 'סהר', canonicalPlayer: { nameHe: 'בן סהר' } } },
    { playerId: 'p1b', player: { canonicalPlayerId: 'P1', nameHe: 'ב. סהר', canonicalPlayer: { nameHe: 'בן סהר' } } },
    { playerId: 'p2', player: { canonicalPlayerId: null, nameHe: 'אחר', canonicalPlayer: null } },
  ]);
  const rows = await clubAllTimeTopScorers('api-563', 6);
  expect(prisma.gameEvent.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: expect.objectContaining({ type: { in: ['GOAL', 'PENALTY_GOAL'] }, teamId: { in: ['t1', 't2'] } }) })
  );
  expect(rows[0]).toEqual({ playerId: 'P1', nameHe: 'בן סהר', goals: 3 });
  expect(rows[1]).toEqual({ playerId: 'p2', nameHe: 'אחר', goals: 1 });
});

it('folds league TOP_SCORERS leaderboard rows by canonical player, desc', async () => {
  (prisma.competitionLeaderboardEntry.findMany as jest.Mock).mockResolvedValue([
    { playerId: 'p1a', playerNameHe: 'מכנס', value: 70, player: { canonicalPlayerId: 'P1', nameHe: 'מכנס', canonicalPlayer: { nameHe: 'עודד מכנס' } } },
    { playerId: 'p1b', playerNameHe: 'ע. מכנס', value: 50, player: { canonicalPlayerId: 'P1', nameHe: 'ע. מכנס', canonicalPlayer: { nameHe: 'עודד מכנס' } } },
    { playerId: null, playerNameHe: 'שחקן ישן', value: 90, player: null },
  ]);
  const rows = await leagueAllTimeTopScorers(6);
  expect(rows[0]).toEqual({ playerId: 'P1', nameHe: 'עודד מכנס', goals: 120 });
  expect(rows[1]).toEqual({ playerId: null, nameHe: 'שחקן ישן', goals: 90 });
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
