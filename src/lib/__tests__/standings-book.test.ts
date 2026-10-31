import { bookTableNote, isBookTable, sortStandings, wdlLabel } from '../standings';

const row = (id: string, position: number, points: number, extra: Record<string, unknown> = {}) => ({
  id, position, points, played: 6, wins: 0, draws: 0, losses: 0, goalsFor: 5, goalsAgainst: 5,
  pointsAdjustment: 0, pointsAdjustmentNoteHe: null, ...extra,
});
const book = { additionalInfo: { bookOrder: true, wdlUnknown: true } };

describe('book tables', () => {
  it('keeps the book order instead of re-sorting by points', () => {
    const rows = [row('a', 2, 10, book), row('b', 1, 9, book)];
    expect(sortStandings(rows, { byPosition: isBookTable(rows) }).map((r) => r.id)).toEqual(['b', 'a']);
    expect(sortStandings(rows).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('is a book table only when every row is', () => {
    expect(isBookTable([row('a', 1, 1, book), row('b', 2, 1)])).toBe(false);
    expect(isBookTable([])).toBe(false);
  });

  it('shows a dash for wins/draws/losses the book lacks', () => {
    expect(wdlLabel(row('a', 1, 1, book), 0)).toBe('—');
    expect(wdlLabel(row('a', 1, 1), 3)).toBe('3');
  });

  it('collects the group names and notes of book rows', () => {
    const note = bookTableNote([
      { ...row('a', 1, 1, book), groupNameHe: "ליגה ג' הנגב", descriptionHe: 'הוקפאה בתאריך 8.6.1952' },
      { ...row('b', 2, 1, book), groupNameHe: "ליגה ג' הנגב", descriptionHe: 'הוקפאה בתאריך 8.6.1952' },
    ]);
    expect(note).toEqual({ groups: ["ליגה ג' הנגב"], notes: ['הוקפאה בתאריך 8.6.1952'], wdlUnknown: true });
    expect(bookTableNote([{ ...row('c', 1, 1), groupNameHe: null }])).toBeNull();
  });
});
