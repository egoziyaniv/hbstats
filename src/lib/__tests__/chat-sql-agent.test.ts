import { unbackedNumbers } from '@/lib/chat-sql/agent';

describe('unbackedNumbers', () => {
  const rows = JSON.stringify({ rows: [{ player: 'גיא מלמד', goals: 21, by_team: 'הפועל חיפה: 17, מכבי חיפה: 4', season: '2024/25' }] });
  it('accepts numbers that came from the query', () => {
    expect(unbackedNumbers('גיא מלמד, 21 שערים — 17 בהפועל חיפה ו-4 במכבי חיפה, עונת 2024/25', [rows])).toEqual([]);
  });
  it('flags an invented breakdown', () => {
    expect(unbackedNumbers('21 שערים — 9 בהפועל חיפה ו-12 במכבי חיפה', [rows])).toEqual(['12']);
  });
  it('accepts thousands separators and numbers from the question', () => {
    expect(unbackedNumbers('9,828 דקות ב-111 משחקים', [JSON.stringify({ minutes: 9828, games: 111 })])).toEqual([]);
    expect(unbackedNumbers('בעונת 1975/76', ['באיזה מקום ב-1975/76?'])).toEqual([]);
  });
});
