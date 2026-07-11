jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    game: { findMany: jest.fn() },
  },
}));

jest.mock('@/lib/history/club-identity', () => ({
  __esModule: true,
  getClubTeamIndex: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { getClubTeamIndex } from '@/lib/history/club-identity';
import { getCupFinals, _clearCupFinalsCacheForTests } from '@/lib/history/cup-finals';

const p = prisma as unknown as {
  $queryRaw: jest.Mock;
  game: { findMany: jest.Mock };
};
const mockGetClubTeamIndex = getClubTeamIndex as jest.Mock;

function family(clubKey: string, nameHe: string) {
  return { clubKey, nameHe, nameEn: '', logoUrl: null, latestTeamId: `t_${clubKey}`, teamIds: [], seasons: [] };
}

describe('getCupFinals', () => {
  beforeEach(() => {
    _clearCupFinalsCacheForTests();
    p.$queryRaw.mockReset();
    p.game.findMany.mockReset();
    mockGetClubTeamIndex.mockReset();
  });

  it('decisive final: winner/loser resolved by 90-min score', async () => {
    p.$queryRaw.mockResolvedValue([{ id: 'g1' }]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g1', homeScore: 2, awayScore: 1, homePenalty: null, awayPenalty: null,
        homeTeamId: 'home1', awayTeamId: 'away1', competitionId: 'comp_state_cup', dateTime: new Date('2020-05-01'),
        season: { year: 2019 }, competition: { nameHe: 'גביע המדינה' },
      },
    ]);
    mockGetClubTeamIndex.mockResolvedValue(new Map([
      ['home1', family('api-1', 'מכבי תל אביב')],
      ['away1', family('api-2', 'הפועל חיפה')],
    ]));

    const rows = await getCupFinals();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      seasonYear: 2019,
      competitionId: 'comp_state_cup',
      winner: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' },
      loser: { clubKey: 'api-2', nameHe: 'הפועל חיפה' },
      scoreLabel: '2–1',
    });
  });

  it('away win resolves winner to the away club', async () => {
    p.$queryRaw.mockResolvedValue([{ id: 'g2' }]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g2', homeScore: 0, awayScore: 3, homePenalty: null, awayPenalty: null,
        homeTeamId: 'home1', awayTeamId: 'away1', competitionId: 'comp_toto_cup_al', dateTime: new Date('2021-05-01'),
        season: { year: 2020 }, competition: { nameHe: 'גביע הטוטו ליגת העל' },
      },
    ]);
    mockGetClubTeamIndex.mockResolvedValue(new Map([
      ['home1', family('api-1', 'מכבי תל אביב')],
      ['away1', family('api-2', 'הפועל חיפה')],
    ]));

    const rows = await getCupFinals();
    expect(rows[0].winner).toMatchObject({ clubKey: 'api-2' });
    expect(rows[0].loser).toMatchObject({ clubKey: 'api-1' });
  });

  it('drawn final WITH penalty data resolves winner by the shootout', async () => {
    p.$queryRaw.mockResolvedValue([{ id: 'g3' }]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g3', homeScore: 1, awayScore: 1, homePenalty: 4, awayPenalty: 5,
        homeTeamId: 'home1', awayTeamId: 'away1', competitionId: 'comp_state_cup', dateTime: new Date('2022-05-01'),
        season: { year: 2021 }, competition: { nameHe: 'גביע המדינה' },
      },
    ]);
    mockGetClubTeamIndex.mockResolvedValue(new Map([
      ['home1', family('api-1', 'מכבי תל אביב')],
      ['away1', family('api-2', 'הפועל חיפה')],
    ]));

    const rows = await getCupFinals();
    expect(rows[0].winner).toMatchObject({ clubKey: 'api-2' });
    expect(rows[0].scoreLabel).toBe('1–1 (4–5 בפנדלים)');
  });

  it('drawn final WITHOUT penalty data is included with a null winner (never guesses)', async () => {
    p.$queryRaw.mockResolvedValue([{ id: 'g4' }]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g4', homeScore: 1, awayScore: 1, homePenalty: null, awayPenalty: null,
        homeTeamId: 'home1', awayTeamId: 'away1', competitionId: 'comp_state_cup', dateTime: new Date('1950-05-01'),
        season: { year: 1949 }, competition: { nameHe: 'גביע המדינה' },
      },
    ]);
    mockGetClubTeamIndex.mockResolvedValue(new Map([
      ['home1', family('api-1', 'מכבי תל אביב')],
      ['away1', family('api-2', 'הפועל חיפה')],
    ]));

    const rows = await getCupFinals();
    expect(rows).toHaveLength(1);
    expect(rows[0].winner).toBeNull();
    expect(rows[0].loser).toBeNull();
    expect(rows[0].scoreLabel).toBe('1–1');
  });

  it('drops finals whose teams have no resolvable club family', async () => {
    p.$queryRaw.mockResolvedValue([{ id: 'g5' }]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g5', homeScore: 2, awayScore: 0, homePenalty: null, awayPenalty: null,
        homeTeamId: 'unknown1', awayTeamId: 'unknown2', competitionId: 'comp_state_cup', dateTime: new Date('1946-05-01'),
        season: { year: 1945 }, competition: { nameHe: 'גביע המדינה' },
      },
    ]);
    mockGetClubTeamIndex.mockResolvedValue(new Map());

    const rows = await getCupFinals();
    expect(rows).toHaveLength(0);
  });

  it('caches for repeated calls until cleared', async () => {
    p.$queryRaw.mockResolvedValue([{ id: 'g1' }]);
    p.game.findMany.mockResolvedValue([
      {
        id: 'g1', homeScore: 2, awayScore: 1, homePenalty: null, awayPenalty: null,
        homeTeamId: 'home1', awayTeamId: 'away1', competitionId: 'comp_state_cup', dateTime: new Date('2020-05-01'),
        season: { year: 2019 }, competition: { nameHe: 'גביע המדינה' },
      },
    ]);
    mockGetClubTeamIndex.mockResolvedValue(new Map([
      ['home1', family('api-1', 'מכבי תל אביב')],
      ['away1', family('api-2', 'הפועל חיפה')],
    ]));

    await getCupFinals();
    await getCupFinals();
    expect(p.$queryRaw).toHaveBeenCalledTimes(1);

    _clearCupFinalsCacheForTests();
    await getCupFinals();
    expect(p.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
