import { gameDateLabel, isPlaceholderGameDate, placeholderDateLabel } from '@/lib/game-date';
import { getRoundDisplayName } from '@/lib/competition-display';

const fmt = (d: Date) => d.toISOString().slice(0, 10);

describe('placeholder game dates', () => {
  it('recognises the 1 September and 1 May import placeholders', () => {
    expect(isPlaceholderGameDate(new Date('1993-09-01T00:00:00Z'))).toBe(true);
    expect(isPlaceholderGameDate('1994-05-01T20:00:00.000Z')).toBe(true);
  });
  it('treats any other time, or an API-Football game, as a real date', () => {
    expect(isPlaceholderGameDate(new Date('1993-09-01T17:00:00Z'))).toBe(false);
    expect(isPlaceholderGameDate(new Date('1993-08-28T00:00:00Z'))).toBe(false);
    expect(isPlaceholderGameDate(new Date('2026-09-01T00:00:00Z'), 12345)).toBe(false);
  });
  it('labels season and round, or season alone when there is no round', () => {
    expect(placeholderDateLabel({ dateTime: '1993-09-01T00:00:00Z', seasonYear: 1993, roundNameEn: 'Round 12' })).toBe('עונת 1993/94 · מחזור 12');
    expect(placeholderDateLabel({ dateTime: '1993-09-01T00:00:00Z', seasonYear: 1993, roundNameHe: 'מחזור 3' })).toBe('עונת 1993/94 · מחזור 3');
    expect(placeholderDateLabel({ dateTime: '1999-09-01T00:00:00Z', seasonYear: 1999 })).toBe('עונת 1999/00');
  });
  it('derives the season from the placeholder itself when the caller has no season', () => {
    expect(placeholderDateLabel({ dateTime: '1993-09-01T00:00:00Z' })).toBe('עונת 1993/94');
    expect(placeholderDateLabel({ dateTime: '1994-05-01T20:00:00Z', roundNameHe: 'גמר' })).toBe('עונת 1993/94 · גמר');
  });
  it('formats real dates normally', () => {
    expect(placeholderDateLabel({ dateTime: '2026-10-10T17:00:00Z' })).toBeNull();
    expect(gameDateLabel({ dateTime: '2026-10-10T17:00:00Z' }, fmt)).toBe('2026-10-10');
    expect(gameDateLabel({ dateTime: '1993-09-01T00:00:00Z' }, fmt)).toBe('עונת 1993/94');
  });
  it('shows RSSSF "Round N" rounds in Hebrew', () => {
    expect(getRoundDisplayName(null, 'Round 7')).toBe('מחזור 7');
  });
});
