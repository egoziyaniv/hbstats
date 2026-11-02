import type { ClubGame, Detector } from '../types';
import { coverage, htState, MIN_COVERAGE, resultOf, seasonLeagueGames } from '../util';

function notLeadingRecord(games: ClubGame[]) {
  const notLeading = games.filter((g) => {
    const s = htState(g);
    return s === 'level' || s === 'trail';
  });
  return { n: notLeading.length, w: notLeading.filter((g) => resultOf(g) === 'W').length };
}

/** A win from level/behind at half-time, against the season's record when not leading at the break. */
export const halfTimeDetector: Detector = ({ kind, target, history }) => {
  if (kind !== 'POST' || !target.isLeague || resultOf(target) !== 'W') return [];
  const state = htState(target);
  if (state !== 'level' && state !== 'trail') return [];
  const season = [...seasonLeagueGames(history, target.seasonYear), target];
  if (coverage(season, (g) => g.goals != null) < MIN_COVERAGE) return [];
  const prevSeason = seasonLeagueGames(history, target.seasonYear - 1);
  const now = notLeadingRecord(season);
  const prevOk = prevSeason.length > 0 && coverage(prevSeason, (g) => g.goals != null) >= MIN_COVERAGE;
  const before = prevOk ? notLeadingRecord(prevSeason) : null;
  const improved = before && before.n && now.n ? now.w / now.n - before.w / before.n >= 0.2 : false;
  return [{
    key: 'half-time-comeback', kind, scope: 'club', coverageHe: 'משחקי הליגה העונה', rarity: 0.5 + (improved ? 0.2 : 0),
    textHe: `ניצחה אחרי ${state === 'trail' ? 'פיגור' : 'תיקו'} במחצית. העונה: ${now.w} ניצחונות ב-${now.n} משחקי ליגה שבהם לא הובילה בהפסקה${before ? ` (בעונה שעברה: ${before.w} מתוך ${before.n})` : ''}`,
    numbers: { wins: now.w, games: now.n, ...(before ? { prevWins: before.w, prevGames: before.n } : {}) },
    evidenceGameIds: [target.id],
  }];
};
