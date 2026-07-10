// Mock the prisma singleton BEFORE importing the module under test.
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    game: { findMany: jest.fn() },
    player: { findMany: jest.fn() },
  },
}));

import prisma from '@/lib/prisma';
import { pickAnniversaryMatch, getOnThisDay } from '@/lib/on-this-day';

const p = prisma as unknown as {
  $queryRaw: jest.Mock;
  game: { findMany: jest.Mock };
  player: { findMany: jest.Mock };
};

const mkGame = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  dateTime: new Date('2012-07-10T18:00:00Z'),
  homeScore: 1, awayScore: 0,
  roundNameEn: 'Round 12',
  homeTeam: { id: 'a', nameHe: 'מכבי חיפה' },
  awayTeam: { id: 'b', nameHe: 'הפועל תל אביב' },
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

  it('falls back to the highest-scoring game', () => {
    const g1 = mkGame({ id: 'g1', homeScore: 2, awayScore: 1 });
    const g2 = mkGame({ id: 'g2', homeScore: 3, awayScore: 3 });
    expect(pickAnniversaryMatch([g1, g2], now)!.id).toBe('g2');
  });

  it('returns null on empty input', () => {
    expect(pickAnniversaryMatch([], now)).toBeNull();
  });
});

describe('getOnThisDay', () => {
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
});
