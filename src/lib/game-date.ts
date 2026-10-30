import { getRoundDisplayName } from '@/lib/competition-display';

/**
 * Games imported without a real date carry a placeholder dateTime — the season's
 * 1 September at UTC midnight (RSSSF history, Walla games with no date) or 1 May at
 * 20:00 UTC (RSSSF cup finals). Showing it as a date is wrong ("1.9.1993" for every
 * game of the season), so these games are labelled with their season and round.
 *
 * No real kickoff lands on either slot (03:00 / 23:00 Israel time), and a game with an
 * apiFootballId always has a real date.
 */
export function isPlaceholderGameDate(dateTime: Date | string, apiFootballId?: number | null): boolean {
  if (apiFootballId != null) return false;
  const iso = new Date(dateTime).toISOString();
  return iso.slice(5) === '09-01T00:00:00.000Z' || iso.slice(5) === '05-01T20:00:00.000Z';
}

/**
 * A game whose day is known but not its kickoff (Eyal Hatav's archive gives dates only)
 * is stored at 10:00 UTC. It is shown as a date alone, never as "12:00".
 */
export function isDateOnlyGameDate(dateTime: Date | string, apiFootballId?: number | null): boolean {
  if (apiFootballId != null) return false;
  return new Date(dateTime).toISOString().slice(10) === 'T10:00:00.000Z';
}

/** "12.3.1994" in Israel time. */
export function formatDateOnlyHe(d: Date): string {
  return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Asia/Jerusalem' }).format(d);
}

/** "עונת 1993/94" from the season's start year. */
export function seasonLabelHe(startYear: number): string {
  return `עונת ${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export interface GameDateInput {
  dateTime: Date | string;
  apiFootballId?: number | null;
  seasonYear?: number | null;
  roundNameHe?: string | null;
  roundNameEn?: string | null;
}

/**
 * Season (+ round when we have one) for a placeholder-dated game, e.g.
 * "עונת 1993/94 · מחזור 12" or "עונת 1993/94"; null when the stored date is real.
 */
export function placeholderDateLabel(game: GameDateInput): string | null {
  if (!isPlaceholderGameDate(game.dateTime, game.apiFootballId)) return null;
  // The placeholder sits in the season's start year (Sep) or end year (May).
  const d = new Date(game.dateTime);
  const year = game.seasonYear ?? (d.getUTCMonth() >= 6 ? d.getUTCFullYear() : d.getUTCFullYear() - 1);
  const hasRound = Boolean((game.roundNameHe || game.roundNameEn || '').trim());
  const round = hasRound ? getRoundDisplayName(game.roundNameHe, game.roundNameEn) : null;
  return round ? `${seasonLabelHe(year)} · ${round}` : seasonLabelHe(year);
}

/** The game's date via `format`, its season/round label when the date is a placeholder,
 *  or the bare date when only the day is known. */
export function gameDateLabel(game: GameDateInput, format: (d: Date) => string): string {
  const placeholder = placeholderDateLabel(game);
  if (placeholder) return placeholder;
  const d = new Date(game.dateTime);
  return isDateOnlyGameDate(d, game.apiFootballId) ? formatDateOnlyHe(d) : format(d);
}
