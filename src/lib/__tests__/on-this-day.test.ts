// Mock the prisma singleton BEFORE importing the module under test.
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    game: { findMany: jest.fn() },
    player: { findMany: jest.fn() },
    season: { findFirst: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { pickAnniversaryMatch, getOnThisDay, _clearOnThisDayMemoForTests } from '@/lib/on-this-day';

const p = prisma as unknown as {
  $queryRaw: jest.Mock;
  game: { findMany: jest.Mock };
  player: { findMany: jest.Mock };
  season: { findFirst: jest.Mock };
};

const mkGame = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  dateTime: new Date('2012-07-10T18:00:00Z'),
  homeScore: 1, awayScore: 0,
  roundNameEn: 'Round 12',
  homeTeam: { id: 'a', nameHe: 'מכבי חיפה', apiFootballId: 100 },
  awayTeam: { id: 'b', nameHe: 'הפועל תל אביב', apiFootballId: 200 },
  competition: { nameHe: 'ליגת העל' },
  ...over,
});

describe('pickAnniversaryMatch scoring', () => {
  const now = new Date('2026-07-10T09:00:00Z');

  it('prefers a cup final over a high-scoring league game', () => {
    const final = mkGame({ id: 'final', roundNameEn: 'Final', homeScore: 1, awayScore: 0 });
    const goalfest = mkGame({ id: 'goals', homeScore: 4, awayScore: 3 });
    expect(pickAnniversaryMatch([goalfest, final], now)!.id).toBe('final');
  });

  it('prefers a derby over an ordinary game with equal goals', () => {
    const derby = mkGame({
      id: 'derby',
      homeTeam: { id: 'a', nameHe: 'מכבי תל אביב' },
      awayTeam: { id: 'b', nameHe: 'הפועל תל אביב' },
    });
    const plain = mkGame({ id: 'plain' });
    expect(pickAnniversaryMatch([plain, derby], now)!.id).toBe('derby');
  });

  it('does NOT give the final bonus to semi-finals', () => {
    // Strict /^finals?$/ regex: a 1-0 semi-final (5 pts) must lose to a 3-3
    // league goalfest (30 pts). A loose /final/i would score the semi 105.
    const semi = mkGame({ id: 'semi', roundNameEn: 'Semi-finals', homeScore: 1, awayScore: 0 });
    const goalfest = mkGame({ id: 'goals', homeScore: 3, awayScore: 3 });
    expect(pickAnniversaryMatch([semi, goalfest], now)!.id).toBe('goals');
  });

  it('falls back to the highest-scoring game', () => {
    const g1 = mkGame({ id: 'g1', homeScore: 2, awayScore: 1 });
    const g2 = mkGame({ id: 'g2', homeScore: 3, awayScore: 3 });
    expect(pickAnniversaryMatch([g1, g2], now)!.id).toBe('g2');
  });

  it('returns null on empty input', () => {
    expect(pickAnniversaryMatch([], now)).toBeNull();
  });

  it('prefers a favourite-team game over a higher-scoring non-favourite one', () => {
    const fav = mkGame({ id: 'fav', homeScore: 1, awayScore: 0, homeTeam: { id: 'x', nameHe: 'הפועל באר שבע', apiFootballId: 563 }, awayTeam: { id: 'y', nameHe: 'מכבי נתניה', apiFootballId: 999 } });
    const goalfest = mkGame({ id: 'goals', homeScore: 4, awayScore: 3 });
    // Without favourites the goalfest (35) beats fav (5); with 563 favourited, fav gets +60.
    expect(pickAnniversaryMatch([goalfest, fav], now)!.id).toBe('goals');
    expect(pickAnniversaryMatch([goalfest, fav], now, [563])!.id).toBe('fav');
  });
});

describe('getOnThisDay', () => {
  beforeEach(() => { _clearOnThisDayMemoForTests(); });

  it('assembles match + birthdays payload', async () => {
    p.$queryRaw.mockResolvedValueOnce([{ id: 'g1' }]);   // game ids for the day
    p.game.findMany.mockResolvedValue([mkGame()]);
    p.$queryRaw.mockResolvedValueOnce([{ id: 'p1' }]);   // birthday player ids
    p.player.findMany.mockResolvedValue([
      { id: 'p1', canonicalPlayerId: null, nameHe: 'יוסי בניון', birthDate: new Date('1980-07-10'), photoUrl: null, _count: { lineupEntries: 300 } },
    ]);
    const res = await getOnThisDay(new Date('2026-07-10T09:00:00Z'));
    expect(res.match).not.toBeNull();
    expect(res.match!.yearsAgo).toBe(14);
    expect(res.match!.headline).toContain('מכבי חיפה');
    expect(res.birthdays[0].nameHe).toBe('יוסי בניון');
    expect(res.birthdays[0].age).toBe(46);
  });

  it('memoizes by calendar day — a second call for the same date does not hit prisma again', async () => {
    p.$queryRaw.mockResolvedValueOnce([{ id: 'g1' }]);   // game ids for the day
    p.game.findMany.mockResolvedValue([mkGame()]);
    p.$queryRaw.mockResolvedValueOnce([{ id: 'p1' }]);   // birthday player ids
    p.player.findMany.mockResolvedValue([
      { id: 'p1', canonicalPlayerId: null, nameHe: 'יוסי בניון', birthDate: new Date('1980-07-10'), photoUrl: null, _count: { lineupEntries: 300 } },
    ]);
    const now = new Date('2026-07-10T09:00:00Z');
    const first = await getOnThisDay(now);
    const callsAfterFirst = p.$queryRaw.mock.calls.length;
    const second = await getOnThisDay(now);
    expect(p.$queryRaw.mock.calls.length).toBe(callsAfterFirst);
    expect(second).toBe(first); // same memoized object reference
  });
});
