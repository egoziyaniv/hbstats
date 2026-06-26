// Mock the prisma singleton BEFORE importing the module under test.
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { game: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { searchGames } from '@/lib/ai-tools';

const findMany = (prisma as unknown as { game: { findMany: jest.Mock } }).game.findMany;

describe('searchGames (AI tool)', () => {
  beforeEach(() => findMany.mockReset());

  it('includes the whole day for a single-date query (dateTo = end of day)', async () => {
    findMany.mockResolvedValue([]);
    await searchGames({ dateFrom: '2025-08-30', dateTo: '2025-08-30' });
    const where = findMany.mock.calls[0][0].where;
    expect(where.dateTime.gte).toEqual(new Date('2025-08-30'));
    expect((where.dateTime.lte as Date).toISOString()).toBe('2025-08-30T23:59:59.999Z');
  });

  it('builds a head-to-head OR (either side home/away) when opponentName is given', async () => {
    findMany.mockResolvedValue([]);
    await searchGames({ teamName: 'הפועל באר שבע', opponentName: 'עירוני טבריה' });
    const where = findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(2);
    expect(where.OR[0].AND).toHaveLength(2); // home=team AND away=opponent
    expect(where.OR[1].AND).toHaveLength(2); // home=opponent AND away=team
  });

  it('returns a full season worth of games (take >= 40)', async () => {
    findMany.mockResolvedValue([]);
    await searchGames({ teamName: 'הפועל באר שבע', seasonYear: 2025 });
    expect(findMany.mock.calls[0][0].take).toBeGreaterThanOrEqual(40);
  });
});
