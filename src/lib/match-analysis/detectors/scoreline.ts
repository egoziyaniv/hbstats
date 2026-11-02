import type { Detector, Fact } from '../types';
import { inLeagueEra, leagueCoverageHe, played, scoreHe, seasonHe } from '../util';

/** "Scorigami": a final score the club never had, or hasn't had for a decade+; or one the league never saw. */
export const scoreline: Detector = ({ kind, target, history, league, leagueFrom, clubHe }) => {
  if (kind !== 'POST' || target.gf == null || target.ga == null) return [];
  const { gf, ga } = target;
  const s = scoreHe(gf, ga);
  const facts: Fact[] = [];
  const same = history.filter((h) => played(h) && h.gf === gf && h.ga === ga);
  if (!same.length) {
    facts.push({
      key: 'scoreline-first', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: 1,
      textHe: `${s} — תוצאה ראשונה אי-פעם בתולדות ${clubHe}`,
      numbers: { gf, ga }, evidenceGameIds: [target.id],
    });
  } else {
    const last = same[same.length - 1];
    const gap = target.seasonYear - last.seasonYear;
    if (gap >= 10) {
      facts.push({
        key: 'scoreline-first', kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity: Math.min(0.9, gap / 40),
        textHe: `${s} — לראשונה מאז ${seasonHe(last.seasonYear)} (${same.length + 1} פעמים בסך הכל בתולדות ${clubHe})`,
        numbers: { gf, ga, since: seasonHe(last.seasonYear), times: same.length + 1 }, evidenceGameIds: [last.id, target.id],
      });
    }
  }
  if (inLeagueEra(target, leagueFrom)) {
    const hs = target.atHome ? gf : ga;
    const as = target.atHome ? ga : gf;
    const prior = league.filter((l) => l.id !== target.id && l.date < target.date && l.hs === hs && l.as === as);
    if (!prior.length) {
      facts.push({
        key: 'scoreline-league-first', kind, scope: 'league', coverageHe: leagueCoverageHe(leagueFrom!), rarity: 1,
        textHe: `${hs}-${as} לקבוצה המארחת — תוצאה שלא נרשמה ${leagueCoverageHe(leagueFrom!)}`,
        numbers: { hs, as }, evidenceGameIds: [target.id],
      });
    }
  }
  return facts;
};
