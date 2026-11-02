import type { ClubGame, Detector } from '../types';
import { coverage, MIN_COVERAGE, pct, seasonHe, seasonLeagueGames } from '../util';

function subShare(games: ClubGame[]) {
  const goals = games.flatMap((g) => (g.goals || []).filter((x) => x.forClub && !x.ownGoal && x.bySub != null));
  return { total: goals.length, bySub: goals.filter((x) => x.bySub).length };
}

/** Goals by players who came off the bench, this season against last. Lineups exist from ~2010. */
export const subGoals: Detector = ({ kind, target, history }) => {
  if (kind !== 'POST' || !target.isLeague || !target.hasLineups || !target.goals) return [];
  const usable = (games: ClubGame[]) => games.length > 0 && coverage(games, (g) => g.hasLineups && g.goals != null) >= MIN_COVERAGE;
  const season = [...seasonLeagueGames(history, target.seasonYear), target];
  const prevSeason = seasonLeagueGames(history, target.seasonYear - 1);
  if (!usable(season) || !usable(prevSeason)) return [];
  const now = subShare(season);
  const before = subShare(prevSeason);
  if (now.bySub < 2 || !now.total || !before.total) return [];
  const targetHasSubGoal = target.goals.some((x) => x.forClub && x.bySub);
  const rose = now.bySub / now.total - before.bySub / before.total >= 0.05;
  if (!targetHasSubGoal && !rose) return [];
  const firstYear = Math.min(...history.filter((g) => g.hasLineups).map((g) => g.seasonYear));
  return [{
    key: 'sub-goals', kind, scope: 'club', coverageHe: `מאז ${seasonHe(firstYear)} (משחקים עם הרכבים)`, rarity: 0.55,
    textHe: `${now.bySub} מתוך ${now.total} שערי השחקנים בליגה העונה הובקעו על ידי מחליפים (${pct(now.bySub, now.total)}%), לעומת ${before.bySub} מתוך ${before.total} (${pct(before.bySub, before.total)}%) בעונה שעברה`,
    numbers: { bySub: now.bySub, total: now.total, pct: pct(now.bySub, now.total), prevBySub: before.bySub, prevTotal: before.total, prevPct: pct(before.bySub, before.total) },
    evidenceGameIds: [target.id],
  }];
};
