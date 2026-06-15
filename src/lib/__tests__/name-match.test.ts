import { playerNamesMatch } from '@/lib/name-match';

describe('playerNamesMatch — matches the same person', () => {
  it('exact / normalized', () => {
    expect(playerNamesMatch('יוסי כהן', 'יוסי כהן')).toBe(true);
    expect(playerNamesMatch('יוסי   כהן', 'יוסי כהן')).toBe(true);
    expect(playerNamesMatch('Yossi Cohen', 'yossi cohen')).toBe(true);
  });

  it('transliteration variant (≤1 edit per part)', () => {
    expect(playerNamesMatch('יוסי כהן', 'יוסי כהאן')).toBe(true); // כהן/כהאן
    expect(playerNamesMatch('Eran Zahavi', 'Eran Zahave')).toBe(true);
  });

  it('name reversal / reorder', () => {
    expect(playerNamesMatch('יוסי כהן', 'כהן יוסי')).toBe(true);
  });
});

describe('playerNamesMatch — does NOT merge different people (M-6)', () => {
  it('same surname, different first name', () => {
    expect(playerNamesMatch('יוסי כהן', 'דני כהן')).toBe(false);
    expect(playerNamesMatch('David Levi', 'Moshe Levi')).toBe(false);
  });

  it('same first name, different surname', () => {
    expect(playerNamesMatch('יוסי כהן', 'יוסי לוי')).toBe(false);
  });

  it('bare surname does not match a full name containing it', () => {
    expect(playerNamesMatch('כהן', 'יוסי כהן')).toBe(false);
    expect(playerNamesMatch('Cohen', 'Yossi Cohen')).toBe(false);
  });

  it('unrelated names', () => {
    expect(playerNamesMatch('יוסי כהן', 'אבי לוי')).toBe(false);
    expect(playerNamesMatch('', 'יוסי כהן')).toBe(false);
  });
});
