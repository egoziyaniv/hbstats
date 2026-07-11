import {
  computeBiggestWins,
  computeStreaks,
  computeFastestGoals,
  computePlayerGameGoals,
  computeAgeExtremes,
  findReliableSeasonYears,
  type EngineGame,
  type EngineGoalEvent,
} from '@/lib/history/records-engine';

const g = (id: string, home: string, away: string, hs: number, as: number, iso: string): EngineGame => ({
  id, homeClubKey: home, awayClubKey: away, homeScore: hs, awayScore: as,
  dateTime: new Date(iso), homeName: home, awayName: away, competitionNameHe: 'ליגת העל',
});

describe('computeBiggestWins', () => {
  it('ranks by margin, tie-break more total goals then earlier date', () => {
    const rows = computeBiggestWins([
      g('g1', 'A', 'B', 5, 0, '2010-01-01'),  // margin 5, total 5
      g('g2', 'C', 'D', 6, 1, '2005-01-01'),  // margin 5, total 7 → above g1
      g('g3', 'A', 'C', 3, 0, '2015-01-01'),
    ], 10);
    expect(rows.map((r) => r.gameId)).toEqual(['g2', 'g1', 'g3']);
    expect(rows[0].valueNum).toBe(5);
    expect(rows[0].labelHe).toContain('6–1');
    expect(rows[0].winnerClubKey).toBe('C');
  });
});

describe('computeStreaks', () => {
  // A: W W W L W W → longest win streak 3, unbeaten 3
  const games = [
    g('s1', 'A', 'B', 2, 0, '2010-01-01'),
    g('s2', 'B', 'A', 0, 1, '2010-02-01'),
    g('s3', 'A', 'C', 1, 0, '2010-03-01'),
    g('s4', 'C', 'A', 2, 0, '2010-04-01'),
    g('s5', 'A', 'B', 1, 0, '2010-05-01'),
    g('s6', 'A', 'C', 2, 2, '2010-06-01'),
  ];
  it('computes longest win streak per club', () => {
    const wins = computeStreaks(games, 'win', 10);
    const a = wins.find((r) => r.clubKey === 'A')!;
    expect(a.valueNum).toBe(3);
    expect(a.startISO).toBe('2010-01-01');
  });
  it('computes unbeaten streak (draws extend it)', () => {
    const unbeaten = computeStreaks(games, 'unbeaten', 10);
    const a = unbeaten.find((r) => r.clubKey === 'A')!;
    expect(a.valueNum).toBe(3); // s5 W, s6 D continue after the s4 loss → streak s5..s6 = 2; earlier s1..s3 = 3
  });
});

describe('computeFastestGoals', () => {
  const ev = (id: string, minute: number, extra: number | null, player: string): EngineGoalEvent => ({
    eventId: id, gameId: 'g1', minute, extraMinute: extra, playerId: player, playerNameHe: player,
    playerBirthDate: null, gameDateISO: '2015-05-01', homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל',
  });
  it('ranks ascending by minute, ignores extra-time markers', () => {
    const rows = computeFastestGoals([ev('e1', 3, null, 'p1'), ev('e2', 1, null, 'p2'), ev('e3', 45, 2, 'p3')], 5);
    expect(rows[0].playerId).toBe('p2');
    expect(rows[0].valueNum).toBe(1);
  });
  it('drops minute-0 feed noise', () => {
    const rows = computeFastestGoals([ev('e0', 0, null, 'p0'), ev('e1', 3, null, 'p1')], 5);
    expect(rows).toHaveLength(1);
    expect(rows[0].playerId).toBe('p1');
  });
});

describe('findReliableSeasonYears', () => {
  it('flags a season unreliable when >50% of its games share one exact date', () => {
    const reliable = findReliableSeasonYears([
      // 1995: 3 of 4 games share the Sep-1 placeholder → unreliable
      { seasonYear: 1995, dateTime: new Date('1995-09-01') },
      { seasonYear: 1995, dateTime: new Date('1995-09-01') },
      { seasonYear: 1995, dateTime: new Date('1995-09-01') },
      { seasonYear: 1995, dateTime: new Date('1996-03-10') },
      // 2010: distinct dates → reliable
      { seasonYear: 2010, dateTime: new Date('2010-08-21') },
      { seasonYear: 2010, dateTime: new Date('2010-08-28') },
      { seasonYear: 2010, dateTime: new Date('2010-09-11') },
    ]);
    expect(reliable.has(2010)).toBe(true);
    expect(reliable.has(1995)).toBe(false);
  });
  it('keeps a season reliable at exactly 50% shared (legit double-header days)', () => {
    const reliable = findReliableSeasonYears([
      { seasonYear: 2000, dateTime: new Date('2000-09-01') },
      { seasonYear: 2000, dateTime: new Date('2000-09-01') },
      { seasonYear: 2000, dateTime: new Date('2000-09-08') },
      { seasonYear: 2000, dateTime: new Date('2000-09-15') },
    ]);
    expect(reliable.has(2000)).toBe(true);
  });
});

describe('computePlayerGameGoals', () => {
  it('finds most goals by one player in one game (hat-trick+)', () => {
    const mk = (p: string, n: number, game: string) =>
      Array.from({ length: n }, (_, i) => ({
        eventId: `${p}-${game}-${i}`, gameId: game, minute: 10 + i, extraMinute: null,
        playerId: p, playerNameHe: p, playerBirthDate: null, gameDateISO: '2018-03-03',
        homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל',
      }));
    const rows = computePlayerGameGoals([...mk('p1', 4, 'g1'), ...mk('p2', 3, 'g2'), ...mk('p1', 2, 'g3')], 5);
    expect(rows[0]).toMatchObject({ playerId: 'p1', gameId: 'g1', valueNum: 4 });
    expect(rows).toHaveLength(2); // only 3+ (hat-trick threshold)
  });
});

describe('computeAgeExtremes', () => {
  it('youngest scorer computed from birthDate vs game date', () => {
    const rows = computeAgeExtremes([
      { eventId: 'e1', gameId: 'g1', minute: 10, extraMinute: null, playerId: 'p1', playerNameHe: 'צעיר',
        playerBirthDate: new Date('2008-01-01'), gameDateISO: '2024-06-01', homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל' },
      { eventId: 'e2', gameId: 'g2', minute: 10, extraMinute: null, playerId: 'p2', playerNameHe: 'מבוגר',
        playerBirthDate: new Date('1990-01-01'), gameDateISO: '2024-06-01', homeName: 'A', awayName: 'B', competitionNameHe: 'ליגת העל' },
    ], 'youngest', 5);
    expect(rows[0].playerId).toBe('p1');
    expect(rows[0].labelHe).toContain('צעיר');
  });
});
