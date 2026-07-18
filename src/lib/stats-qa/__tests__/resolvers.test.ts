jest.mock('@/lib/prisma', () => ({ prisma: { recordEntry: { findMany: jest.fn() } } }));
import { prisma } from '@/lib/prisma';
import { recordResolver } from '@/lib/stats-qa/resolvers';

describe('recordResolver', () => {
  it('maps the rank-1 RecordEntry into a hero StatAnswer', async () => {
    (prisma.recordEntry.findMany as jest.Mock).mockResolvedValue([
      { rank: 1, valueNum: 8, labelHe: 'הפועל ב"ש 8-0 בני יהודה', detailHe: '2015', gameId: 'g1', playerId: null, seasonYear: 2015 },
    ]);
    const r = await recordResolver('biggest_win', 'hero', 'game')({ clubKey: 'api-563' });
    expect(prisma.recordEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { category: 'biggest_win', scope: 'club:api-563' } })
    );
    expect(r.headline).toEqual({ label: 'הפועל ב"ש 8-0 בני יהודה', value: '2015' });
    expect(r.href).toBe('/games/g1');
  });

  it('returns empty-state headline:null when no rows', async () => {
    (prisma.recordEntry.findMany as jest.Mock).mockResolvedValue([]);
    const r = await recordResolver('biggest_win', 'hero', 'game')({ clubKey: 'api-563' });
    expect(r.headline).toBeNull();
  });
});
