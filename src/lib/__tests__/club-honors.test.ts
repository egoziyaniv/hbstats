jest.mock('@/lib/history/seasons-spine', () => ({
  __esModule: true,
  getSeasonsSpine: jest.fn(),
}));

jest.mock('@/lib/history/club-identity', () => ({
  __esModule: true,
  getClubFamily: jest.fn(),
  getClubFamilies: jest.fn(),
  getClubTeamIndex: jest.fn(),
}));

jest.mock('@/lib/history/cup-finals', () => ({
  __esModule: true,
  getCupFinals: jest.fn(),
  clearCupFinalsCache: jest.fn(),
}));

import { getSeasonsSpine } from '@/lib/history/seasons-spine';
import { getClubFamily, getClubFamilies, getClubTeamIndex } from '@/lib/history/club-identity';
import { getCupFinals, clearCupFinalsCache } from '@/lib/history/cup-finals';
import { getClubHonors, getAllHonors, clearHonorsCache } from '@/lib/history/club-honors';

const mockSpine = getSeasonsSpine as jest.Mock;
const mockFamily = getClubFamily as jest.Mock;
const mockFamilies = getClubFamilies as jest.Mock;
const mockTeamIndex = getClubTeamIndex as jest.Mock;
const mockCupFinals = getCupFinals as jest.Mock;
const mockClearCupFinalsCache = clearCupFinalsCache as jest.Mock;

function family(clubKey: string, nameHe: string) {
  return { clubKey, nameHe, nameEn: '', logoUrl: null, latestTeamId: `t_${clubKey}`, teamIds: [`t_${clubKey}`], seasons: [] };
}

describe('club-honors', () => {
  beforeEach(() => {
    clearHonorsCache();
    mockClearCupFinalsCache.mockClear();
    mockSpine.mockReset();
    mockFamily.mockReset();
    mockFamilies.mockReset();
    mockTeamIndex.mockReset();
    mockCupFinals.mockReset();
    mockCupFinals.mockResolvedValue([]);
    mockFamilies.mockResolvedValue([family('api-1', 'מכבי תל אביב'), family('api-2', 'הפועל חיפה')]);
    // getClubHonors() falls back to getClubFamily() for clubs with zero honors
    // (not present in the aggregated list) — default resolves the two known
    // fixture clubs and treats anything else as unknown.
    mockFamily.mockImplementation(async (clubKey: string) => {
      if (clubKey === 'api-1') return family('api-1', 'מכבי תל אביב');
      if (clubKey === 'api-2') return family('api-2', 'הפועל חיפה');
      return null;
    });
  });

  it('(a) counts league titles per club family from spine champions', async () => {
    mockSpine.mockResolvedValue([
      { seasonId: 's1', year: 2020, name: '2020/21', champion: { teamId: 't_api-1', nameHe: 'מכבי תל אביב', logoUrl: null }, runnerUp: null, topScorer: null, relegated: [] },
      { seasonId: 's2', year: 2021, name: '2021/22', champion: { teamId: 't_api-1', nameHe: 'מכבי תל אביב', logoUrl: null }, runnerUp: null, topScorer: null, relegated: [] },
      { seasonId: 's3', year: 2022, name: '2022/23', champion: { teamId: 't_api-2', nameHe: 'הפועל חיפה', logoUrl: null }, runnerUp: null, topScorer: null, relegated: [] },
    ]);
    mockTeamIndex.mockResolvedValue(new Map([
      ['t_api-1', family('api-1', 'מכבי תל אביב')],
      ['t_api-2', family('api-2', 'הפועל חיפה')],
    ]));

    const honors = await getClubHonors('api-1');
    expect(honors).toMatchObject({ leagueTitles: { count: 2, years: [2020, 2021] } });
  });

  it('(b) a decisive strict final assigns the win to the winning club', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    mockCupFinals.mockResolvedValue([
      {
        seasonYear: 2018, competitionId: 'comp_state_cup', competitionNameHe: 'גביע המדינה', gameId: 'g1',
        winner: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' }, loser: { clubKey: 'api-2', nameHe: 'הפועל חיפה' },
        scoreLabel: '2–1',
      },
    ]);

    const honors = await getClubHonors('api-1');
    expect(honors).toMatchObject({ stateCup: { count: 1, years: [2018] } });
    const loser = await getClubHonors('api-2');
    expect(loser).toMatchObject({ stateCup: { count: 0, years: [] } });
  });

  it('(c) a drawn final with no penalty data (winner: null) is excluded from every tally', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    mockCupFinals.mockResolvedValue([
      {
        seasonYear: 1949, competitionId: 'comp_state_cup', competitionNameHe: 'גביע המדינה', gameId: 'g0',
        winner: null, loser: null, scoreLabel: '1–1',
      },
    ]);

    const a = await getClubHonors('api-1');
    const b = await getClubHonors('api-2');
    expect(a?.stateCup).toEqual({ count: 0, years: [] });
    expect(b?.stateCup).toEqual({ count: 0, years: [] });
  });

  it('(d) a drawn final resolved by penalties (winner set) counts as a normal win', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    mockCupFinals.mockResolvedValue([
      {
        seasonYear: 2015, competitionId: 'comp_state_cup', competitionNameHe: 'גביע המדינה', gameId: 'g2',
        winner: { clubKey: 'api-2', nameHe: 'הפועל חיפה' }, loser: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' },
        scoreLabel: '1–1 (5–4 בפנדלים)',
      },
    ]);

    const honors = await getClubHonors('api-2');
    expect(honors).toMatchObject({ stateCup: { count: 1, years: [2015] } });
  });

  it('totoCup counts ONLY comp_toto_cup_al, never comp_toto_cup_leumit', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    mockCupFinals.mockResolvedValue([
      {
        seasonYear: 2019, competitionId: 'comp_toto_cup_al', competitionNameHe: 'גביע הטוטו ליגת העל', gameId: 'g3',
        winner: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' }, loser: { clubKey: 'api-2', nameHe: 'הפועל חיפה' },
        scoreLabel: '3–0',
      },
      {
        seasonYear: 2019, competitionId: 'comp_toto_cup_leumit', competitionNameHe: 'גביע הטוטו ליגה לאומית', gameId: 'g4',
        winner: { clubKey: 'api-2', nameHe: 'הפועל חיפה' }, loser: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' },
        scoreLabel: '1–0',
      },
    ]);

    const mta = await getClubHonors('api-1');
    const hh = await getClubHonors('api-2');
    expect(mta?.totoCup).toEqual({ count: 1, years: [2019] });
    expect(hh?.totoCup).toEqual({ count: 0, years: [] }); // leumit win does NOT count
  });

  it('dedupes duplicate final imports — same cup, season and winner counts once', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    // Observed data shape: the 2020 Super Cup stored twice with mirrored home/away.
    mockCupFinals.mockResolvedValue([
      {
        seasonYear: 2020, competitionId: 'comp_super_cup', competitionNameHe: 'גביע העל', gameId: 'g6',
        winner: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' }, loser: { clubKey: 'api-2', nameHe: 'הפועל חיפה' },
        scoreLabel: '2–0',
      },
      {
        seasonYear: 2020, competitionId: 'comp_super_cup', competitionNameHe: 'גביע העל', gameId: 'g7',
        winner: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' }, loser: { clubKey: 'api-2', nameHe: 'הפועל חיפה' },
        scoreLabel: '0–2',
      },
    ]);

    const honors = await getClubHonors('api-1');
    expect(honors?.superCup).toEqual({ count: 1, years: [2020] });
  });

  it('getClubHonors returns null for an unknown clubKey with no honors and no family', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    mockCupFinals.mockResolvedValue([]);
    mockFamily.mockResolvedValue(null);

    expect(await getClubHonors('api-999')).toBeNull();
  });

  it('getClubHonors returns a zeroed shell for a real club with zero honors', async () => {
    mockSpine.mockResolvedValue([]);
    mockTeamIndex.mockResolvedValue(new Map());
    mockCupFinals.mockResolvedValue([]);
    mockFamily.mockResolvedValue(family('api-3', 'בית"ר ירושלים'));

    const honors = await getClubHonors('api-3');
    expect(honors).toMatchObject({
      clubKey: 'api-3', nameHe: 'בית"ר ירושלים',
      leagueTitles: { count: 0, years: [] }, stateCup: { count: 0, years: [] },
      totoCup: { count: 0, years: [] }, superCup: { count: 0, years: [] },
    });
  });

  it('getAllHonors ranks the most decorated club first', async () => {
    mockSpine.mockResolvedValue([
      { seasonId: 's1', year: 2020, name: '2020/21', champion: { teamId: 't_api-1', nameHe: 'מכבי תל אביב', logoUrl: null }, runnerUp: null, topScorer: null, relegated: [] },
    ]);
    mockTeamIndex.mockResolvedValue(new Map([['t_api-1', family('api-1', 'מכבי תל אביב')]]));
    mockCupFinals.mockResolvedValue([
      {
        seasonYear: 2019, competitionId: 'comp_super_cup', competitionNameHe: 'גביע העל', gameId: 'g5',
        winner: { clubKey: 'api-2', nameHe: 'הפועל חיפה' }, loser: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' },
        scoreLabel: '2–0',
      },
    ]);

    const all = await getAllHonors();
    expect(all[0].clubKey).toBe('api-1'); // 1 league title beats 1 super cup
  });

  it('clearHonorsCache also clears the cup-finals cache it builds on', () => {
    clearHonorsCache();
    expect(mockClearCupFinalsCache).toHaveBeenCalled();
  });
});
