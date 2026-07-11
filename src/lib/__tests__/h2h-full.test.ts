jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { team: { findMany: jest.fn() }, game: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { buildFullH2H, _clearH2HCacheForTests } from '@/lib/h2h';

const p = prisma as unknown as { team: { findMany: jest.Mock }; game: { findMany: jest.Mock } };

const game = (id: string, homeTeamId: string, awayTeamId: string, hs: number, as: number, comp: string, year: number) => ({
  id, homeTeamId, awayTeamId, homeScore: hs, awayScore: as,
  dateTime: new Date(`${year}-03-01T18:00:00Z`), status: 'COMPLETED',
  competition: { id: comp, nameHe: comp, apiFootballId: comp === 'league' ? 383 : 384 },
  homeTeam: { nameHe: homeTeamId }, awayTeam: { nameHe: awayTeamId },
});

describe('buildFullH2H', () => {
  beforeEach(() => { _clearH2HCacheForTests(); p.team.findMany.mockReset(); p.game.findMany.mockReset(); });

  it('aggregates totals, per-competition split, venue split and biggest wins', async () => {
    // buildFullH2H mirrors buildH2H's resolution exactly: a combined base-info
    // lookup for both input ids (1 call), then one family-by-name lookup per
    // team (2 more calls) — 3 team.findMany calls total, not 2. (The plan's
    // draft test assumed 2; adapted here to match buildH2H's real call
    // pattern — see report.)
    p.team.findMany
      .mockResolvedValueOnce([{ id: 'a1', nameHe: 'A', nameEn: 'A' }, { id: 'b1', nameHe: 'B', nameEn: 'B' }])
      .mockResolvedValueOnce([{ id: 'a1' }, { id: 'a2' }])
      .mockResolvedValueOnce([{ id: 'b1' }]);
    p.game.findMany.mockResolvedValue([
      game('g1', 'a1', 'b1', 5, 0, 'league', 2014),  // biggest A win, A home
      game('g2', 'b1', 'a2', 2, 1, 'league', 2018),  // B win, A away
      game('g3', 'a2', 'b1', 1, 1, 'cup', 2020),     // draw, cup
    ]);
    const res = await buildFullH2H('a1', 'b1');
    expect(res).not.toBeNull();
    expect(res!.totals).toMatchObject({ games: 3, winsA: 1, draws: 1, winsB: 1, goalsA: 7, goalsB: 3 });
    expect(res!.byCompetition.find((c) => c.competitionNameHe === 'league')!.games).toBe(2);
    expect(res!.atAHome).toMatchObject({ games: 2, winsA: 1, draws: 1, winsB: 0 });
    expect(res!.atBHome).toMatchObject({ games: 1, winsB: 1 });
    expect(res!.biggestAWin!.gameId).toBe('g1');
    expect(res!.meetings).toHaveLength(3);
    expect(res!.meetings[0].gameId).toBe('g3'); // newest first
  });
});
