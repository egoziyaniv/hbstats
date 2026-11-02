import type { ClubGame, Detector, Fact } from '../types';
import { played, resultOf, seasonHe } from '../util';

interface Run { length: number; endYear: number; endId: string }

/** Maximal runs of games satisfying `ok`, oldest first; the last one may be the still-open run. */
function runs(games: ClubGame[], ok: (g: ClubGame) => boolean): Run[] {
  const out: Run[] = [];
  let len = 0;
  games.forEach((g, i) => {
    if (ok(g)) len += 1;
    else len = 0;
    const closes = len > 0 && (i === games.length - 1 || !ok(games[i + 1]));
    if (closes) out.push({ length: len, endYear: g.seasonYear, endId: g.id });
  });
  return out;
}

const KINDS = [
  { key: 'win', ok: (g: ClubGame) => resultOf(g) === 'W', min: 3, noun: 'ניצחונות' },
  { key: 'unbeaten', ok: (g: ClubGame) => resultOf(g) !== 'L', min: 6, noun: 'משחקים ללא הפסד' },
];

/** Win / unbeaten streaks against the club's history; PRE says what the next game can equal or break. */
export const streaks: Detector = ({ kind, target, history }) => {
  const scope = (g: ClubGame) => played(g) && (target.isLeague ? g.isLeague : true);
  const label = target.isLeague ? ' בליגה' : '';
  const base = history.filter(scope);
  const seq = kind === 'POST' ? (played(target) ? [...base, target] : base) : base;
  const facts: Fact[] = [];

  for (const k of KINDS) {
    const all = runs(seq, k.ok);
    const lastGame = seq[seq.length - 1];
    const open = all.length && lastGame && all[all.length - 1].endId === lastGame.id ? all[all.length - 1] : null;
    const c = open?.length ?? 0;
    if (c < k.min) continue;
    const earlier = all.slice(0, -1);
    const record = earlier.reduce<Run | null>((m, r) => (!m || r.length > m.length ? r : m), null);
    const M = record?.length ?? 0;
    const recordPart = record ? `${M}, ${seasonHe(record.endYear)}` : '';
    const nowYear = kind === 'POST' ? target.seasonYear : lastGame.seasonYear;

    if (kind === 'POST') {
      let text: string | null = null;
      let rarity = 0;
      if (c > M) { text = `${c} ${k.noun}${label} ברצף — שיא מועדון חדש${record ? ` (הקודם: ${recordPart})` : ''}`; rarity = 0.95; }
      else if (c === M) { text = `${c} ${k.noun}${label} ברצף — משווה את שיא המועדון (${seasonHe(record!.endYear)})`; rarity = 0.85; }
      else {
        const lastLonger = [...earlier].reverse().find((r) => r.length >= c);
        const gap = lastLonger ? nowYear - lastLonger.endYear : 0;
        if (lastLonger && gap >= 3) {
          text = `${c} ${k.noun}${label} ברצף — הרצף הארוך ביותר מאז ${seasonHe(lastLonger.endYear)} (שיא המועדון: ${recordPart})`;
          rarity = Math.min(0.8, 0.4 + gap / 30);
        }
      }
      if (text) facts.push({
        key: `streak-${k.key}`, kind, scope: 'club', coverageHe: 'בתולדות המועדון', rarity, textHe: text,
        numbers: { current: c, record: M }, evidenceGameIds: [target.id],
      });
    } else {
      const next = c + 1;
      const tail = next > M ? ` וישבור את שיא המועדון (${recordPart || 'אין קודם'})` : next === M ? ` וישווה את שיא המועדון (${seasonHe(record!.endYear)})` : '';
      facts.push({
        key: `streak-${k.key}`, kind, scope: 'club', coverageHe: 'בתולדות המועדון',
        rarity: next > M ? 0.9 : next === M ? 0.8 : 0.6,
        textHe: `${k.key === 'win' ? 'ניצחון' : 'משחק בלי הפסד'} ישלים ${next} ${k.noun}${label} ברצף${tail}`,
        numbers: { current: c, next, record: M }, evidenceGameIds: open ? [open.endId] : [],
      });
    }
    if (k.key === 'win') break; // a win streak says more than the unbeaten one it's part of
  }
  return facts;
};
