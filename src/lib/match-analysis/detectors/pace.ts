import type { ClubGame, Detector } from '../types';
import { resultOf, seasonHe, seasonLeagueGames } from '../util';

const points = (games: ClubGame[]) => games.reduce((p, g) => p + (resultOf(g) === 'W' ? 3 : resultOf(g) === 'D' ? 1 : 0), 0);

/** Points after N league games against the first N of every earlier season (3 points a win throughout). */
export const pace: Detector = ({ kind, target, history, clubHe }) => {
  if (kind !== 'POST' || !target.isLeague) return [];
  const season = [...seasonLeagueGames(history, target.seasonYear), target];
  const n = season.length;
  if (n < 5) return [];
  const p = points(season);
  const years = Array.from(new Set(history.filter((g) => g.isLeague && g.seasonYear < target.seasonYear).map((g) => g.seasonYear)));
  const earlier = years
    .map((y) => seasonLeagueGames(history, y))
    .filter((games) => games.length >= n)
    .map((games) => ({ y: games[0].seasonYear, p: points(games.slice(0, n)) }));
  if (!earlier.length) return [];
  const atLeast = earlier.filter((s) => s.p >= p).sort((a, b) => a.y - b.y);
  const coverageHe = 'לפי 3 נקודות לניצחון בכל העונות';
  if (!atLeast.length) {
    return [{
      key: 'season-pace', kind, scope: 'club', coverageHe, rarity: 0.9,
      textHe: `${p} נקודות אחרי ${n} משחקי ליגה — הפתיחה הטובה בתולדות ${clubHe} (לפי 3 נקודות לניצחון)`,
      numbers: { points: p, games: n }, evidenceGameIds: [target.id],
    }];
  }
  const last = atLeast[atLeast.length - 1];
  if (target.seasonYear - last.y < 5) return [];
  return [{
    key: 'season-pace', kind, scope: 'club', coverageHe, rarity: 0.65,
    textHe: `${p} נקודות אחרי ${n} משחקי ליגה — הפתיחה הטובה ביותר מאז ${seasonHe(last.y)} (אז: ${last.p})`,
    numbers: { points: p, games: n, since: seasonHe(last.y), thenPoints: last.p }, evidenceGameIds: [target.id],
  }];
};
