// Mock the prisma singleton BEFORE importing the module under test.
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { standing: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { getStandings } from '@/lib/ai-tools';

const findMany = (prisma as unknown as { standing: { findMany: jest.Mock } }).standing.findMany;

const row = (over: Record<string, unknown> = {}) => ({
  position: 1, played: 36, wins: 24, draws: 7, losses: 5,
  goalsFor: 60, goalsAgainst: 28, goalsDiff: 32, points: 79,
  team: { nameHe: 'הפועל באר שבע' }, competition: { nameHe: 'ליגת העל' }, ...over,
});

describe('getStandings (AI tool) — league tier', () => {
  beforeEach(() => findMany.mockReset());

  it('defaults to Ligat haAl (apiFootballId 383) when no league is given', async () => {
    findMany.mockResolvedValue([row()]);
    const res = await getStandings({ seasonYear: 2024 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { season: { year: 2024 }, competition: { apiFootballId: 383 } },
      }),
    );
    expect(res.competition).toBe('ליגת העל');
    expect(res.standings[0].team).toBe('הפועל באר שבע');
    expect(res.standings[0].position).toBe(1);
  });

  it('uses Liga Leumit (apiFootballId 382) when league=NATIONAL', async () => {
    findMany.mockResolvedValue([
      row({ team: { nameHe: 'מכבי פתח תקווה' }, competition: { nameHe: 'ליגה לאומית' } }),
    ]);
    const res = await getStandings({ seasonYear: 2024, league: 'NATIONAL' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { season: { year: 2024 }, competition: { apiFootballId: 382 } },
      }),
    );
    expect(res.competition).toBe('ליגה לאומית');
    expect(res.standings[0].team).toBe('מכבי פתח תקווה');
  });
});
