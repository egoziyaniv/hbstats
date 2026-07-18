jest.mock('@/lib/prisma', () => ({ prisma: { recordEntry: { findMany: jest.fn() } } }));
jest.mock('@/lib/stats-qa/aggregations', () => ({
  clubAllTimeTopScorers: jest.fn(),
  leagueAllTimeTopScorers: jest.fn(),
  clubTopOpponents: jest.fn(),
  topRivalries: jest.fn(),
}));
jest.mock('@/lib/history/club-honors', () => ({ getClubHonors: jest.fn(), getAllHonors: jest.fn() }));
jest.mock('@/lib/history/club-identity', () => ({ getClubFamily: jest.fn() }));
jest.mock('@/lib/h2h', () => ({ buildFullH2H: jest.fn() }));
jest.mock('@/lib/history/seasons-spine', () => ({ getSeasonsSpine: jest.fn() }));
jest.mock('@/lib/history/all-time-table', () => ({ buildAllTimeTable: jest.fn() }));

import { prisma } from '@/lib/prisma';
import { clubAllTimeTopScorers } from '@/lib/stats-qa/aggregations';
import { getClubHonors } from '@/lib/history/club-honors';
import { getClubFamily } from '@/lib/history/club-identity';
import { buildFullH2H } from '@/lib/h2h';
import {
  recordResolver,
  clubTopScorerResolver,
  clubHonorsResolver,
  h2hRivalResolver,
} from '@/lib/stats-qa/resolvers';

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

describe('clubTopScorerResolver', () => {
  it('maps the top scorer row into a leaderboard StatAnswer', async () => {
    (clubAllTimeTopScorers as jest.Mock).mockResolvedValue([
      { playerId: 'p1', nameHe: 'ברדה', goals: 94 },
      { playerId: 'p2', nameHe: 'אוחיון', goals: 71 },
    ]);
    const r = await clubTopScorerResolver({ clubKey: 'api-563' });
    expect(r.headline).toEqual({ label: 'ברדה', value: '94', unit: 'שערים' });
    expect(r.top?.[0]).toEqual({ name: 'ברדה', value: '94', href: '/players/p1' });
    expect(r.href).toBe('/players/p1');
  });

  it('returns empty-state headline:null when no rows', async () => {
    (clubAllTimeTopScorers as jest.Mock).mockResolvedValue([]);
    const r = await clubTopScorerResolver({ clubKey: 'api-563' });
    expect(r.headline).toBeNull();
  });
});

describe('clubHonorsResolver', () => {
  it('sums the four honor counts into the headline and lists them in top', async () => {
    (getClubHonors as jest.Mock).mockResolvedValue({
      clubKey: 'api-563',
      nameHe: 'הפועל באר שבע',
      logoUrl: null,
      latestTeamId: 't1',
      leagueTitles: { count: 3, years: [2015, 2016, 2017] },
      stateCup: { count: 2, years: [2014, 2018] },
      totoCup: { count: 1, years: [2019] },
      superCup: { count: 0, years: [] },
    });
    const r = await clubHonorsResolver({ clubKey: 'api-563' });
    expect(r.headline?.value).toBe('6');
    expect(r.top).toHaveLength(4);
  });

  it('returns empty-state headline:null when club unknown', async () => {
    (getClubHonors as jest.Mock).mockResolvedValue(null);
    const r = await clubHonorsResolver({ clubKey: 'unknown' });
    expect(r.headline).toBeNull();
  });
});

describe('h2hRivalResolver', () => {
  it('builds the headline from H2H totals and an href using the real __ route format', async () => {
    (getClubFamily as jest.Mock).mockImplementation(async (clubKey: string) => ({
      clubKey,
      nameHe: clubKey,
      nameEn: clubKey,
      logoUrl: null,
      latestTeamId: `team-${clubKey}`,
      teamIds: [`team-${clubKey}`],
      seasons: [],
    }));
    (buildFullH2H as jest.Mock).mockResolvedValue({
      teamAName: 'הפועל באר שבע',
      teamBName: 'מכבי חיפה',
      totals: { games: 10, winsA: 6, draws: 2, winsB: 2, goalsA: 20, goalsB: 12 },
    });
    const r = await h2hRivalResolver({ clubKey: 'api-563', rivalKey: 'api-548' });
    expect(r.headline).toEqual({ label: 'הפועל באר שבע מול מכבי חיפה', value: '6-2-2' });
    expect(r.href).toBe('/history/h2h/api-563__api-548');
  });

  it('returns empty-state headline:null when clubKey or rivalKey missing', async () => {
    const r = await h2hRivalResolver({ clubKey: 'api-563' });
    expect(r.headline).toBeNull();
  });

  it('returns empty-state headline:null when the clubs have never met', async () => {
    (getClubFamily as jest.Mock).mockImplementation(async (clubKey: string) => ({
      clubKey,
      nameHe: clubKey,
      nameEn: clubKey,
      logoUrl: null,
      latestTeamId: `team-${clubKey}`,
      teamIds: [`team-${clubKey}`],
      seasons: [],
    }));
    (buildFullH2H as jest.Mock).mockResolvedValue({
      teamAName: 'א', teamBName: 'ב',
      totals: { games: 0, winsA: 0, draws: 0, winsB: 0, goalsA: 0, goalsB: 0 },
    });
    const r = await h2hRivalResolver({ clubKey: 'api-563', rivalKey: 'api-548' });
    expect(r.headline).toBeNull();
  });
});
