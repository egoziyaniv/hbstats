jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    season: { findMany: jest.fn() },
    standing: { findMany: jest.fn() },
    competitionLeaderboardEntry: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { getSeasonsSpine, _clearSpineCacheForTests } from '@/lib/history/seasons-spine';

const p = prisma as unknown as {
  season: { findMany: jest.Mock };
  standing: { findMany: jest.Mock };
  competitionLeaderboardEntry: { findMany: jest.Mock };
};

describe('getSeasonsSpine', () => {
  beforeEach(() => {
    _clearSpineCacheForTests();
    p.season.findMany.mockReset();
    p.standing.findMany.mockReset();
    p.competitionLeaderboardEntry.findMany.mockReset();
  });

  it('builds one row per season with champion, runner-up, top scorer, relegated', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's24', year: 2024, name: '2024/25' }]);
    p.standing.findMany.mockResolvedValue([
      { seasonId: 's24', position: 1, teamId: 't1', statusHe: null, descriptionHe: null, team: { id: 't1', nameHe: 'מכבי תל אביב', logoUrl: null } },
      { seasonId: 's24', position: 2, teamId: 't2', statusHe: null, descriptionHe: null, team: { id: 't2', nameHe: 'הפועל באר שבע', logoUrl: null } },
      { seasonId: 's24', position: 13, teamId: 't3', statusHe: null, descriptionHe: null, team: { id: 't3', nameHe: 'קריית שמונה', logoUrl: null } },
      { seasonId: 's24', position: 14, teamId: 't4', statusHe: null, descriptionHe: null, team: { id: 't4', nameHe: 'הפועל פ"ת', logoUrl: null } },
    ]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([
      { seasonId: 's24', rank: 1, playerId: 'pl1', playerNameHe: 'דור תורג\'מן', value: 18 },
    ]);

    const rows = await getSeasonsSpine();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      year: 2024,
      name: '2024/25',
      champion: { teamId: 't1', nameHe: 'מכבי תל אביב' },
      runnerUp: { teamId: 't2', nameHe: 'הפועל באר שבע' },
      topScorer: { playerId: 'pl1', nameHe: 'דור תורג\'מן', goals: 18 },
    });
    expect(rows[0].relegated.map((r) => r.nameHe)).toEqual(['קריית שמונה', 'הפועל פ"ת']);
  });

  it('omits seasons with no league standings', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's26', year: 2026, name: '2026/27' }]);
    p.standing.findMany.mockResolvedValue([]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);
    expect(await getSeasonsSpine()).toHaveLength(0);
  });
});
