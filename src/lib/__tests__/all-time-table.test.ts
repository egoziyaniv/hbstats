jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { team: { findMany: jest.fn() }, standing: { findMany: jest.fn() }, game: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { buildAllTimeTable, _clearAllTimeCacheForTests, _cacheSizeForTests } from '@/lib/history/all-time-table';

const p = prisma as unknown as {
  team: { findMany: jest.Mock };
  standing: { findMany: jest.Mock };
  game: { findMany: jest.Mock };
};

const team = (id: string, nameHe: string, seasonId: string, api: number | null = null) => ({
  id, nameHe, nameEn: nameHe, seasonId, apiFootballId: api, logoUrl: null,
  season: { id: seasonId, year: Number(seasonId.replace('s', '')) },
});
const st = (teamId: string, seasonId: string, over: Record<string, unknown> = {}) => ({
  teamId, seasonId, played: 30, wins: 15, draws: 10, losses: 5, goalsFor: 50, goalsAgainst: 30, points: 55, pointsAdjustment: 0, ...over,
});

describe('buildAllTimeTable', () => {
  beforeEach(() => {
    _clearAllTimeCacheForTests();
    p.team.findMany.mockReset(); p.standing.findMany.mockReset(); p.game.findMany.mockReset();
  });

  it('aggregates standings per club family across seasons (scope=all), respecting point deductions', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2023', 1), team('a2', 'מכבי', 's2024', 1), team('b1', 'הפועל', 's2024', 2)]);
    p.standing.findMany.mockResolvedValue([
      st('a1', 's2023'),
      st('a2', 's2024', { pointsAdjustment: -2 }),
      st('b1', 's2024', { points: 70, wins: 22, draws: 4, losses: 4 }),
    ]);
    const rows = await buildAllTimeTable({});
    expect(rows).toHaveLength(2);
    const maccabi = rows.find((r) => r.nameHe === 'מכבי')!;
    expect(maccabi.seasons).toBe(2);
    expect(maccabi.played).toBe(60);
    expect(maccabi.points).toBe(108); // 55 + (55 − 2 deduction)
    expect(rows[0].nameHe).toBe('מכבי'); // sorted by points desc: 108 > 70
  });

  it('applies a season-year range filter', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2023', 1), team('a2', 'מכבי', 's2024', 1)]);
    p.standing.findMany.mockResolvedValue([st('a1', 's2023'), st('a2', 's2024')]);
    const rows = await buildAllTimeTable({ fromYear: 2024, toYear: 2024 });
    expect(rows[0].seasons).toBe(1);
    expect(rows[0].played).toBe(30);
  });

  it('home scope aggregates games (one leg only)', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2024', 1), team('b1', 'הפועל', 's2024', 2)]);
    p.standing.findMany.mockResolvedValue([]);
    p.game.findMany.mockResolvedValue([
      { homeTeamId: 'a1', awayTeamId: 'b1', homeScore: 2, awayScore: 0, season: { year: 2024 } },
      { homeTeamId: 'b1', awayTeamId: 'a1', homeScore: 1, awayScore: 1, season: { year: 2024 } },
    ]);
    const rows = await buildAllTimeTable({ scope: 'home' });
    const maccabi = rows.find((r) => r.nameHe === 'מכבי')!;
    expect(maccabi.played).toBe(1);
    expect(maccabi.wins).toBe(1);
    expect(maccabi.points).toBe(3);
  });

  it('treats absurd year params as unfiltered (canonicalized cache key)', async () => {
    p.team.findMany.mockResolvedValue([team('a1', 'מכבי', 's2023', 1), team('a2', 'מכבי', 's2024', 1)]);
    p.standing.findMany.mockResolvedValue([st('a1', 's2023'), st('a2', 's2024')]);
    const unfiltered = await buildAllTimeTable({});
    const absurd = await buildAllTimeTable({ fromYear: 1e300, toYear: Number.NaN });
    // Same canonical key → same cached result object, with nothing filtered out.
    expect(absurd).toBe(unfiltered);
    expect(absurd[0].seasons).toBe(2);
    expect(absurd[0].played).toBe(60);
  });

  it('caps the result cache at 32 entries (FIFO eviction)', async () => {
    p.team.findMany.mockResolvedValue([]);
    p.standing.findMany.mockResolvedValue([]);
    for (let year = 1950; year < 1990; year++) {
      await buildAllTimeTable({ fromYear: year, toYear: year });
    }
    expect(_cacheSizeForTests()).toBeLessThanOrEqual(32);
  });
});
