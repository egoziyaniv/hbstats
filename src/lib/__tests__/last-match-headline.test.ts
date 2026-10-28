jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {} }));

import { matchHeadline, positionFromGames } from '@/lib/last-match-summary';

const base = { home: false, opponentPosition: null, opponentName: 'מכבי חיפה', cameFromBehind: false };

describe('matchHeadline', () => {
  it('a big away win over the league leader', () => {
    expect(matchHeadline({ ...base, goalsFor: 5, goalsAgainst: 2, opponentPosition: 1 })).toBe('ניצחון גדול בחוץ על מוליכת הטבלה');
  });

  it('a comeback outranks the margin', () => {
    expect(matchHeadline({ ...base, home: true, goalsFor: 4, goalsAgainst: 1, cameFromBehind: true })).toBe('ניצחון מהפך בבית על מכבי חיפה');
  });

  it('draws and losses read "against", not "over"', () => {
    expect(matchHeadline({ ...base, goalsFor: 0, goalsAgainst: 0 })).toBe('תיקו מאופס בחוץ מול מכבי חיפה');
    expect(matchHeadline({ ...base, home: true, goalsFor: 0, goalsAgainst: 3 })).toBe('הפסד כבד בבית מול מכבי חיפה');
    expect(matchHeadline({ ...base, goalsFor: 1, goalsAgainst: 2, opponentPosition: 1 })).toBe('הפסד בחוץ מול מוליכת הטבלה');
  });
});

describe('positionFromGames', () => {
  const games = [
    { homeTeamId: 'haifa', awayTeamId: 'tiberias', homeScore: 3, awayScore: 0 },
    { homeTeamId: 'bs', awayTeamId: 'mta', homeScore: 1, awayScore: 1 },
  ];

  it('ranks by points, then goal difference', () => {
    expect(positionFromGames(games, new Map(), 'haifa')).toBe(1);
    expect(positionFromGames(games, new Map(), 'tiberias')).toBe(4);
  });

  it('applies a points deduction from the start', () => {
    expect(positionFromGames(games, new Map([['haifa', -6]]), 'haifa')).toBe(4);
  });

  it('is unknown before any game', () => {
    expect(positionFromGames([], new Map(), 'haifa')).toBeNull();
  });
});
