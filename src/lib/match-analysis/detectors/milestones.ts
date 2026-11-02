import type { ClubGame, Detector, Fact } from '../types';

const COVERAGE = 'לפי השערים הרשומים אצלנו';
const STEP = 25;

function tally(games: ClubGame[]) {
  const totals = new Map<string, { n: number; name: string }>();
  for (const g of games) for (const x of g.goals || []) {
    if (!x.forClub || x.ownGoal || !x.scorerKey) continue;
    const t = totals.get(x.scorerKey) || { n: 0, name: x.scorerHe || '' };
    t.n += 1;
    if (!t.name && x.scorerHe) t.name = x.scorerHe;
    totals.set(x.scorerKey, t);
  }
  return totals;
}

const rankOf = (totals: Map<string, { n: number }>, key: string) => {
  const mine = totals.get(key)?.n ?? 0;
  return 1 + Array.from(totals.values()).filter((t) => t.n > mine).length;
};

/** A scorer's round-number goal, first goal, first hat-trick, or climb past a name in the club's top 20. */
export const milestones: Detector = ({ kind, target, history, clubHe }) => {
  const before = tally(history);
  const facts: Fact[] = [];

  if (kind === 'PRE') {
    const recentYears = new Set([target.seasonYear, target.seasonYear - 1]);
    const recent = tally(history.filter((g) => recentYears.has(g.seasonYear)));
    recent.forEach((_v, key) => {
      const t = before.get(key)!;
      if ((t.n + 1) % STEP === 0) {
        facts.push({
          key: 'milestone-near', kind, scope: 'club', coverageHe: COVERAGE, rarity: 0.6,
          textHe: `${t.name} במרחק שער אחד מהשער ה-${t.n + 1} שלו במדי ${clubHe}`,
          numbers: { goals: t.n, next: t.n + 1 }, evidenceGameIds: [],
        });
      }
    });
    return facts;
  }

  const inGame = tally([target]);
  const after = tally([...history, target]);
  inGame.forEach((g, key) => {
    const was = before.get(key)?.n ?? 0;
    const now = was + g.n;
    const name = g.name;
    const crossed = Math.floor(now / STEP) * STEP;
    if (crossed > was && crossed >= STEP) {
      facts.push({
        key: 'milestone-goals', kind, scope: 'club', coverageHe: COVERAGE, rarity: crossed >= 100 ? 0.9 : 0.8,
        textHe: `השער ה-${crossed} של ${name} במדי ${clubHe}`, numbers: { goals: crossed }, evidenceGameIds: [target.id],
      });
    } else if (was === 0) {
      facts.push({
        key: 'milestone-first', kind, scope: 'club', coverageHe: COVERAGE, rarity: 0.4,
        textHe: `שער ראשון של ${name} במדי ${clubHe}`, numbers: {}, evidenceGameIds: [target.id],
      });
    }
    if (g.n >= 3) {
      const hadHatTrick = history.some((h) => (tally([h]).get(key)?.n ?? 0) >= 3);
      if (!hadHatTrick) facts.push({
        key: 'milestone-hat-trick', kind, scope: 'club', coverageHe: COVERAGE, rarity: 0.7,
        textHe: `שלושער ראשון של ${name} במדי ${clubHe}`, numbers: { goals: g.n }, evidenceGameIds: [target.id],
      });
    }
    const rankNow = rankOf(after, key);
    if (rankNow <= 20 && rankNow < rankOf(before, key) && was > 0) {
      const passed = Array.from(before.entries())
        .filter(([k, t]) => k !== key && t.n >= was && t.n < now)
        .sort((a, b) => b[1].n - a[1].n)[0];
      if (passed) facts.push({
        key: 'milestone-overtake', kind, scope: 'club', coverageHe: COVERAGE, rarity: 0.75,
        textHe: `${name} (${now}) עקף את ${passed[1].name} (${passed[1].n}) ועלה למקום ${rankNow} ברשימת הכובשים של ${clubHe}`,
        numbers: { goals: now, passedGoals: passed[1].n, rank: rankNow }, evidenceGameIds: [target.id],
      });
    }
  });
  return facts;
};
