jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: { team: { findMany: jest.fn() } },
}));

import prisma from '@/lib/prisma';
import { getClubFamilies, getClubFamilyByTeamId, _clearClubCacheForTests } from '@/lib/history/club-identity';

const findMany = (prisma as unknown as { team: { findMany: jest.Mock } }).team.findMany;

const t = (id: string, nameHe: string, seasonId: string, apiFootballId: number | null = null, over: Record<string, unknown> = {}) => ({
  id, nameHe, nameEn: nameHe, seasonId, apiFootballId, logoUrl: null,
  season: { id: seasonId, year: Number(seasonId.replace('s', '')) },
  ...over,
});

describe('club-identity', () => {
  beforeEach(() => { _clearClubCacheForTests(); findMany.mockReset(); });

  it('groups team rows across seasons by normalized Hebrew name', async () => {
    findMany.mockResolvedValue([
      t('a1', 'מכבי תל אביב', 's2023', 604),
      t('a2', 'מכבי תל-אביב', 's2024', 604),   // punctuation variant
      t('b1', 'הפועל באר שבע', 's2024', 610),
    ]);
    const fams = await getClubFamilies();
    expect(fams).toHaveLength(2);
    const mta = fams.find((f) => f.teamIds.includes('a1'))!;
    expect(mta.teamIds.sort()).toEqual(['a1', 'a2']);
    expect(mta.seasons).toHaveLength(2);
  });

  it('unions families that share an apiFootballId despite different name spellings', async () => {
    findMany.mockResolvedValue([
      t('m1', 'הפועל marmorek', 's2010', 4498),
      t('m2', 'הפועל מרמורק', 's2011', 4498),
    ]);
    const fams = await getClubFamilies();
    expect(fams).toHaveLength(1);
    expect(fams[0].teamIds.sort()).toEqual(['m1', 'm2']);
  });

  it('prefers the newest season for display name/logo and exposes a stable clubKey', async () => {
    findMany.mockResolvedValue([
      t('c1', 'הפועל ירושלים', 's2010', 700, { logoUrl: null }),
      t('c2', 'הפועל ירושלים', 's2024', 700, { logoUrl: 'new.png' }),
    ]);
    const [fam] = await getClubFamilies();
    expect(fam.clubKey).toBe('api-700');
    expect(fam.logoUrl).toBe('new.png');
    expect(fam.latestTeamId).toBe('c2');
  });

  it('resolves a family by any member teamId', async () => {
    findMany.mockResolvedValue([
      t('a1', 'מכבי חיפה', 's2023', 601),
      t('a2', 'מכבי חיפה', 's2024', 601),
    ]);
    const fam = await getClubFamilyByTeamId('a1');
    expect(fam?.teamIds).toContain('a2');
  });
});
