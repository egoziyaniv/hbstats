import type { ClubGame, Detector } from '../types';
import { coverage, MIN_COVERAGE, pct, seasonHe, seasonLeagueGames } from '../util';

function split(games: ClubGame[]) {
  const goals = games.flatMap((g) => (g.goals || []).filter((x) => x.forClub));
  return { total: goals.length, second: goals.filter((x) => x.minute > 45).length };
}

/** Share of the season's league goals scored after the break, against every earlier season with goal minutes. */
export const secondHalf: Detector = ({ kind, target, history }) => {
  if (kind !== 'POST' || !target.isLeague) return [];
  const season = [...seasonLeagueGames(history, target.seasonYear), target];
  if (coverage(season, (g) => g.goals != null) < MIN_COVERAGE) return [];
  const now = split(season);
  if (now.total < 8 || now.second / now.total < 0.6) return [];
  const share = now.second / now.total;

  const years = Array.from(new Set(history.filter((g) => g.isLeague && g.seasonYear < target.seasonYear).map((g) => g.seasonYear))).sort((a, b) => a - b);
  const earlier = years
    .map((y) => ({ y, games: seasonLeagueGames(history, y) }))
    .filter((s) => coverage(s.games, (g) => g.goals != null) >= MIN_COVERAGE)
    .map((s) => ({ y: s.y, ...split(s.games) }))
    .filter((s) => s.total >= 20);
  if (!earlier.length) return [];
  const higher = earlier.filter((s) => s.second / s.total >= share);
  const base = `${now.second} מתוך ${now.total} שערי הליגה העונה הובקעו במחצית השנייה (${pct(now.second, now.total)}%)`;
  const numbers = { second: now.second, total: now.total, pct: pct(now.second, now.total) };
  if (!higher.length) {
    return [{
      key: 'second-half-share', kind, scope: 'club', coverageHe: `מאז ${seasonHe(earlier[0].y)} (עונות עם דקות שערים)`, rarity: 0.85,
      textHe: `${base} — השיעור הגבוה ביותר של המועדון מאז ${seasonHe(earlier[0].y)}, מאז שיש לנו דקות שערים`,
      numbers: { ...numbers, since: seasonHe(earlier[0].y) }, evidenceGameIds: [target.id],
    }];
  }
  const last = higher[higher.length - 1];
  if (target.seasonYear - last.y < 5) return [];
  return [{
    key: 'second-half-share', kind, scope: 'club', coverageHe: 'עונות עם דקות שערים', rarity: 0.6,
    textHe: `${base} — השיעור הגבוה ביותר מאז ${seasonHe(last.y)} (${pct(last.second, last.total)}%)`,
    numbers: { ...numbers, since: seasonHe(last.y), sincePct: pct(last.second, last.total) }, evidenceGameIds: [target.id],
  }];
};
