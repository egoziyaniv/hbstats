jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    venue: { findUnique: jest.fn() },
    team: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { buildVenueStats } from '@/lib/venue-stats';

const mockedPrisma = prisma as unknown as {
  venue: { findUnique: jest.Mock };
  team: { findMany: jest.Mock };
  game: { findMany: jest.Mock };
};

describe('buildVenueStats Beer Sheva identity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedPrisma.venue.findUnique.mockResolvedValue({
      id: 'venue', nameHe: 'טרנר', nameEn: 'Turner', cityHe: 'באר שבע', cityEn: 'Beer Sheva',
      capacity: 16126, imageUrl: null,
    });
    mockedPrisma.team.findMany.mockResolvedValue([]);
    mockedPrisma.game.findMany.mockResolvedValue([]);
  });

  test('includes the 2015/16 Beer Sheva row that has no API-Football id', async () => {
    await buildVenueStats('venue');

    expect(mockedPrisma.team.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { apiFootballId: 563 },
          { nameHe: { in: ['הפועל באר שבע', 'הפועל ב״ש'] } },
          { nameEn: { equals: 'Hapoel Beer Sheva', mode: 'insensitive' } },
        ],
      },
    }));
  });
});
