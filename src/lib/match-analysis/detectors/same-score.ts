import type { Detector, Fact } from '../types';
import { inLeagueEra, leagueCoverageHe, played, scoreHe, seasonHe, teamHe, teamSequences } from '../util';

/** The same final score in two consecutive games. */
export const sameScore: Detector = ({ kind, target, history, league, leagueFrom, clubHe }) => {
  if (kind !== 'POST' || target.gf == null || target.ga == null) return [];
  const prev = history[history.length - 1];
  if (!prev || prev.gf !== target.gf || prev.ga !== target.ga) return [];
  const { gf, ga } = target;
  const s = scoreHe(gf, ga);
  const facts: Fact[] = [];

  let n = 0;
  for (let i = 1; i < history.length; i += 1) {
    const a = history[i - 1];
    const b = history[i];
    if (played(a) && played(b) && a.gf === gf && a.ga === ga && b.gf === gf && b.ga === ga) n += 1;
  }
  facts.push({
    key: 'same-score-streak', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 0.6 + 0.4 / (n + 1),
    textHe: `${s} פעמיים ברצף — ${n === 0 ? `לראשונה בתולדות ${clubHe}` : `בפעם ה-${n + 1} בתולדות ${clubHe}`}`,
    numbers: { gf, ga, times: n + 1 }, evidenceGameIds: [prev.id, target.id],
  });

  if (inLeagueEra(target, leagueFrom) && prev.isLeague) {
    const before = league.filter((l) => l.date < prev.date);
    let count = 0;
    let last: { team: string; year: number; at: number } = { team: '', year: 0, at: -Infinity };
    teamSequences(before).forEach((games) => {
      for (let i = 1; i < games.length; i += 1) {
        const a = games[i - 1];
        const b = games[i];
        if (a.gf === gf && a.ga === ga && b.gf === gf && b.ga === ga) {
          count += 1;
          if (b.game.date.getTime() > last.at) last = { team: teamHe(b), year: b.game.seasonYear, at: b.game.date.getTime() };
        }
      }
    });
    const lastPart = count ? `; האחרונה: ${last.team} ב-${seasonHe(last.year)}` : '';
    facts.push({
      key: 'same-score-streak-league', kind, scope: 'league', coverageHe: leagueCoverageHe(leagueFrom!),
      rarity: 0.6 + 0.4 / (count + 1),
      textHe: count === 0
        ? `${leagueCoverageHe(leagueFrom!)} אף קבוצה לא סיימה פעמיים ברצף ב-${s}`
        : `${leagueCoverageHe(leagueFrom!)} קבוצה סיימה פעמיים ברצף ב-${s} רק ${count} פעמים${lastPart}`,
      numbers: { gf, ga, count }, evidenceGameIds: [prev.id, target.id],
    });
  }
  return facts;
};
