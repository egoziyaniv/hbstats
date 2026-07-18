import { getDataVersion } from '@/lib/stats-qa/narrative';

jest.mock('@/lib/prisma', () => ({
  prisma: { siteSetting: { findUnique: jest.fn() } },
}));
import { prisma } from '@/lib/prisma';

describe('getDataVersion', () => {
  it('returns the stored stat_data_version value', async () => {
    (prisma.siteSetting.findUnique as jest.Mock).mockResolvedValue({ valueJson: 'v-123' });
    expect(await getDataVersion()).toBe('v-123');
  });
  it('falls back to "0" when unset', async () => {
    (prisma.siteSetting.findUnique as jest.Mock).mockResolvedValue(null);
    expect(await getDataVersion()).toBe('0');
  });
});
