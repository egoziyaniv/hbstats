jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    season: { findMany: jest.fn() },
    standing: { findMany: jest.fn() },
    competitionLeaderboardEntry: { findMany: jest.fn() },
    game: { findMany: jest.fn() },
  },
}));

// The spine's cupWinner column reads finals from cup-finals.ts and resolves
// club families via club-identity.ts — mocked here (both have their own unit
// tests) so this file stays focused on spine composition logic.
jest.mock('@/lib/history/cup-finals', () => ({
  __esModule: true,
  getCupFinals: jest.fn(),
}));
jest.mock('@/lib/history/club-identity', () => ({
  __esModule: true,
  getClubFamilies: jest.fn(),
}));

import prisma from '@/lib/prisma';
import { getSeasonsSpine, _clearSpineCacheForTests } from '@/lib/history/seasons-spine';
import { getCupFinals } from '@/lib/history/cup-finals';
import { getClubFamilies } from '@/lib/history/club-identity';

const p = prisma as unknown as {
  season: { findMany: jest.Mock };
  standing: { findMany: jest.Mock };
  competitionLeaderboardEntry: { findMany: jest.Mock };
  game: { findMany: jest.Mock };
};
const mockGetCupFinals = getCupFinals as jest.Mock;
const mockGetClubFamilies = getClubFamilies as jest.Mock;

/** Standing fixture with the full field set the service selects (sortStandings needs the numeric fields). */
function standing(
  seasonId: string,
  teamId: string,
  nameHe: string,
  over: Partial<{
    position: number; points: number; goalsFor: number; goalsAgainst: number;
    wins: number; draws: number; losses: number; played: number;
    pointsAdjustment: number; pointsAdjustmentNoteHe: string | null;
    statusHe: string | null; descriptionHe: string | null; groupNameEn: string | null;
  }> = {},
) {
  return {
    id: `st_${seasonId}_${teamId}`,
    seasonId,
    teamId,
    position: 0,
    played: 26,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    pointsAdjustment: 0,
    pointsAdjustmentNoteHe: null,
    statusHe: null,
    descriptionHe: null,
    groupNameEn: null,
    team: { id: teamId, nameHe, logoUrl: null },
    ...over,
  };
}

describe('getSeasonsSpine', () => {
  beforeEach(() => {
    _clearSpineCacheForTests();
    p.season.findMany.mockReset();
    p.standing.findMany.mockReset();
    p.competitionLeaderboardEntry.findMany.mockReset();
    p.game.findMany.mockReset();
    p.game.findMany.mockResolvedValue([]); // default: no unfinished league games
    mockGetCupFinals.mockReset();
    mockGetCupFinals.mockResolvedValue([]); // default: no cup finals
    mockGetClubFamilies.mockReset();
    mockGetClubFamilies.mockResolvedValue([]);
  });

  it('builds one row per season with champion, runner-up, top scorer, relegated', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's24', year: 2024, name: '2024/25' }]);
    p.standing.findMany.mockResolvedValue([
      standing('s24', 't1', 'מכבי תל אביב', { position: 1, points: 70, goalsFor: 60, goalsAgainst: 20 }),
      standing('s24', 't2', 'הפועל באר שבע', { position: 2, points: 65, goalsFor: 55, goalsAgainst: 25 }),
      standing('s24', 't3', 'קריית שמונה', { position: 13, points: 28, goalsFor: 25, goalsAgainst: 45 }),
      standing('s24', 't4', 'הפועל פ"ת', { position: 14, points: 22, goalsFor: 20, goalsAgainst: 50 }),
    ]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([
      { seasonId: 's24', rank: 1, playerId: 'pl1', playerNameHe: 'דור תורג\'מן', playerNameEn: 'Dor Turgeman', value: 18 },
    ]);

    const rows = await getSeasonsSpine();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      year: 2024,
      name: '2024/25',
      champion: { teamId: 't1', nameHe: 'מכבי תל אביב' },
      runnerUp: { teamId: 't2', nameHe: 'הפועל באר שבע' },
      topScorer: { playerId: 'pl1', nameHe: 'דור תורג\'מן', goals: 18 },
      cupWinner: null, // no cup finals mocked for this season
    });
    expect(rows[0].relegated.map((r) => r.nameHe)).toEqual(['קריית שמונה', 'הפועל פ"ת']);
  });

  it('omits seasons with no league standings', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's26', year: 2026, name: '2026/27' }]);
    p.standing.findMany.mockResolvedValue([]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);
    expect(await getSeasonsSpine()).toHaveLength(0);
  });

  it('playoff season: champion from the championship group, relegated from the relegation group tail', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's19', year: 2019, name: '2019/20' }]);
    // Both groups contain a position:1 row — the relegation-group winner is
    // listed FIRST to reproduce the "find(position === 1)" bug shape.
    p.standing.findMany.mockResolvedValue([
      standing('s19', 'by', 'בני יהודה', { position: 1, points: 42, goalsFor: 35, goalsAgainst: 30, groupNameEn: 'Ligat HaAl Relegation Round' }),
      standing('s19', 'mta', 'מכבי תל אביב', { position: 1, points: 71, goalsFor: 62, goalsAgainst: 18, groupNameEn: 'Ligat HaAl Championship Round' }),
      standing('s19', 'mh', 'מכבי חיפה', { position: 2, points: 64, goalsFor: 50, goalsAgainst: 24, groupNameEn: 'Ligat HaAl Championship Round' }),
      standing('s19', 'hta', 'הפועל תל אביב', { position: 13, points: 25, goalsFor: 22, goalsAgainst: 44, groupNameEn: 'Ligat HaAl Relegation Round' }),
      standing('s19', 'sk', 'סקציה נס ציונה', { position: 14, points: 19, goalsFor: 18, goalsAgainst: 52, groupNameEn: 'Ligat HaAl Relegation Round' }),
    ]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);

    const rows = await getSeasonsSpine();
    expect(rows).toHaveLength(1);
    expect(rows[0].champion).toMatchObject({ teamId: 'mta', nameHe: 'מכבי תל אביב' });
    expect(rows[0].runnerUp).toMatchObject({ teamId: 'mh', nameHe: 'מכבי חיפה' });
    expect(rows[0].relegated.map((r) => r.nameHe)).toEqual(['הפועל תל אביב', 'סקציה נס ציונה']);
  });

  it('single-table season: relegated follow the OFFICIAL stored positions, not points order', async () => {
    p.season.findMany.mockResolvedValue([{ id: 's73', year: 1973, name: '1973/74' }]);
    // Historical shape: withdrawn teams officially ranked 5-6 despite having
    // fewer points than the teams stored at the bottom positions.
    p.standing.findMany.mockResolvedValue([
      standing('s73', 'mn', 'מכבי נתניה', { position: 1, points: 44, goalsFor: 50, goalsAgainst: 18 }),
      standing('s73', 'hpt', 'הפועל פ"ת', { position: 2, points: 40, goalsFor: 42, goalsAgainst: 22 }),
      standing('s73', 'hh', 'הפועל חיפה', { position: 5, points: 4, goalsFor: 8, goalsAgainst: 30 }),
      standing('s73', 'bt', 'בית"ר ת"א', { position: 6, points: 1, goalsFor: 5, goalsAgainst: 35 }),
      standing('s73', 'hrg', 'הכח רמת גן', { position: 15, points: 20, goalsFor: 25, goalsAgainst: 33 }),
      standing('s73', 'mh', 'מכבי חיפה', { position: 16, points: 18, goalsFor: 22, goalsAgainst: 36 }),
    ]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);

    const rows = await getSeasonsSpine();
    expect(rows).toHaveLength(1);
    expect(rows[0].champion).toMatchObject({ teamId: 'mn', nameHe: 'מכבי נתניה' });
    expect(rows[0].runnerUp).toMatchObject({ teamId: 'hpt', nameHe: 'הפועל פ"ת' });
    // Bottom STORED positions relegate — not the points-poorest (positions 5-6).
    expect(rows[0].relegated.map((r) => r.nameHe)).toEqual(['הכח רמת גן', 'מכבי חיפה']);
  });

  it('omits unfinished seasons (any SCHEDULED/ONGOING league game)', async () => {
    p.season.findMany.mockResolvedValue([
      { id: 's25', year: 2025, name: '2025/26' },
      { id: 's24', year: 2024, name: '2024/25' },
    ]);
    p.standing.findMany.mockResolvedValue([
      standing('s25', 't1', 'מכבי תל אביב', { position: 1, points: 30 }),
      standing('s25', 't2', 'הפועל באר שבע', { position: 2, points: 28 }),
      standing('s24', 't1', 'מכבי תל אביב', { position: 1, points: 70 }),
      standing('s24', 't2', 'הפועל באר שבע', { position: 2, points: 65 }),
    ]);
    p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);
    p.game.findMany.mockResolvedValue([{ seasonId: 's25' }]); // 2025/26 still has unplayed games

    const rows = await getSeasonsSpine();
    expect(rows.map((r) => r.seasonId)).toEqual(['s24']);
  });

  describe('cupWinner column', () => {
    beforeEach(() => {
      p.season.findMany.mockResolvedValue([{ id: 's24', year: 2024, name: '2024/25' }]);
      p.standing.findMany.mockResolvedValue([
        standing('s24', 't1', 'מכבי תל אביב', { position: 1, points: 70 }),
        standing('s24', 't2', 'הפועל באר שבע', { position: 2, points: 65 }),
      ]);
      p.competitionLeaderboardEntry.findMany.mockResolvedValue([]);
    });

    it('resolves the State Cup winner for the matching season year via the club family', async () => {
      mockGetCupFinals.mockResolvedValue([
        {
          seasonYear: 2024, competitionId: 'comp_state_cup', competitionNameHe: 'גביע המדינה', gameId: 'g1',
          winner: { clubKey: 'api-2', nameHe: 'הפועל באר שבע' }, loser: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' },
          scoreLabel: '2–1',
        },
      ]);
      mockGetClubFamilies.mockResolvedValue([
        { clubKey: 'api-1', nameHe: 'מכבי תל אביב', nameEn: '', logoUrl: null, latestTeamId: 't1', teamIds: ['t1'], seasons: [] },
        { clubKey: 'api-2', nameHe: 'הפועל באר שבע', nameEn: '', logoUrl: 'logo.png', latestTeamId: 't2', teamIds: ['t2'], seasons: [] },
      ]);

      const rows = await getSeasonsSpine();
      expect(rows[0].cupWinner).toEqual({ teamId: 't2', nameHe: 'הפועל באר שבע', logoUrl: 'logo.png' });
    });

    it('ignores Toto Cup finals for the cupWinner column (State Cup only)', async () => {
      mockGetCupFinals.mockResolvedValue([
        {
          seasonYear: 2024, competitionId: 'comp_toto_cup_al', competitionNameHe: 'גביע הטוטו ליגת העל', gameId: 'g2',
          winner: { clubKey: 'api-1', nameHe: 'מכבי תל אביב' }, loser: { clubKey: 'api-2', nameHe: 'הפועל באר שבע' },
          scoreLabel: '1–0',
        },
      ]);
      mockGetClubFamilies.mockResolvedValue([]);

      const rows = await getSeasonsSpine();
      expect(rows[0].cupWinner).toBeNull();
    });

    it('is null when the final was an undecidable draw (winner: null)', async () => {
      mockGetCupFinals.mockResolvedValue([
        {
          seasonYear: 2024, competitionId: 'comp_state_cup', competitionNameHe: 'גביע המדינה', gameId: 'g3',
          winner: null, loser: null, scoreLabel: '1–1',
        },
      ]);
      mockGetClubFamilies.mockResolvedValue([]);

      const rows = await getSeasonsSpine();
      expect(rows[0].cupWinner).toBeNull();
    });
  });
});
