type StandingBase = {
  id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
};

export type StandingWithDerived<T extends StandingBase> = T & {
  adjustedPoints: number;
  goalDifference: number;
  displayPosition: number;
};

export function getAdjustedPoints(standing: Pick<StandingBase, 'points' | 'pointsAdjustment'>) {
  return standing.points + standing.pointsAdjustment;
}

/** A table copied from a book (Eyal Hatav's archive): its order is the book's, and it may not
 *  know wins/draws/losses. */
type BookInfo = { bookOrder?: boolean; wdlUnknown?: boolean };
function bookInfo(row: unknown): BookInfo {
  const info = (row as { additionalInfo?: unknown })?.additionalInfo;
  return info && typeof info === 'object' ? (info as BookInfo) : {};
}
export function isBookTable(rows: unknown[]) {
  return rows.length > 0 && rows.every((r) => bookInfo(r).bookOrder);
}
/** What to say above a table that came (wholly or partly) from the book: its group/league
 *  names, its notes ("הוקפאה בתאריך 8.6.1952") and whether some rows lack wins/draws/losses. */
export function bookTableNote(rows: Array<{ groupNameHe?: string | null; descriptionHe?: string | null }>) {
  const fromBook = rows.filter((r) => bookInfo(r).bookOrder);
  if (!fromBook.length) return null;
  const uniq = (xs: Array<string | null | undefined>) => Array.from(new Set(xs.filter((x): x is string => Boolean(x))));
  return {
    groups: uniq(fromBook.map((r) => r.groupNameHe)).filter((g) => !/^פלייאוף/.test(g)),
    notes: uniq(fromBook.map((r) => r.descriptionHe)),
    wdlUnknown: fromBook.some((r) => bookInfo(r).wdlUnknown),
  };
}

/** Wins/draws/losses as shown: '—' where the source didn't give them. */
export function wdlLabel(row: unknown, value: number) {
  return bookInfo(row).wdlUnknown ? '—' : String(value);
}

export function sortStandings<T extends StandingBase>(rows: T[], opts: { byPosition?: boolean } = {}): StandingWithDerived<T>[] {
  return [...rows]
    .sort((a, b) => {
      if (opts.byPosition) return a.position - b.position;
      const adjustedDifference = getAdjustedPoints(b) - getAdjustedPoints(a);
      if (adjustedDifference !== 0) return adjustedDifference;

      const goalDifferenceDelta = b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst);
      if (goalDifferenceDelta !== 0) return goalDifferenceDelta;

      const goalsForDelta = b.goalsFor - a.goalsFor;
      if (goalsForDelta !== 0) return goalsForDelta;

      return a.position - b.position;
    })
    .map((row, index) => ({
      ...row,
      adjustedPoints: getAdjustedPoints(row),
      goalDifference: row.goalsFor - row.goalsAgainst,
      displayPosition: index + 1,
    }));
}
