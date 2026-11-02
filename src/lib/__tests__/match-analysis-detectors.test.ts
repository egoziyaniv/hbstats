import { g, gg, input, lg } from './match-analysis-fixtures';
import { scoreHe, seasonHe, htState, teamSequences } from '@/lib/match-analysis/util';
import { scoreline } from '@/lib/match-analysis/detectors/scoreline';
import { sameScore } from '@/lib/match-analysis/detectors/same-score';
import { goalFlood } from '@/lib/match-analysis/detectors/goal-flood';
import { halfTimeDetector } from '@/lib/match-analysis/detectors/half-time';
import { secondHalf } from '@/lib/match-analysis/detectors/second-half';
import { subGoals } from '@/lib/match-analysis/detectors/sub-goals';
import { streaks } from '@/lib/match-analysis/detectors/streaks';
import { opponent } from '@/lib/match-analysis/detectors/opponent';
import { milestones } from '@/lib/match-analysis/detectors/milestones';
import { pace } from '@/lib/match-analysis/detectors/pace';
import { runDetectors } from '@/lib/match-analysis/detectors';
import { rankFacts } from '@/lib/match-analysis/rank';
import { unknownNumbers } from '@/lib/match-analysis/check';
import type { Fact } from '@/lib/match-analysis/types';

describe('util', () => {
  it('formats scores and seasons the Hebrew way', () => {
    expect(scoreHe(5, 2)).toBe('2:5');
    expect(seasonHe(1999)).toBe('1999/00');
    expect(seasonHe(2026)).toBe('2026/27');
  });
  it('reads the half-time state from goal minutes', () => {
    expect(htState(gg('a30 f70 f80'))).toBe('trail');
    expect(htState(gg('f10 a30'))).toBe('level');
    expect(htState(g())).toBeNull();
  });
  it('gives every club its league games from its own side', () => {
    const seqs = teamSequences([lg('a', 'b', 3, 1)]);
    expect(seqs.get('a')![0]).toMatchObject({ home: true, gf: 3, ga: 1 });
    expect(seqs.get('b')![0]).toMatchObject({ home: false, gf: 1, ga: 3 });
  });
});

describe('scoreline', () => {
  it('flags a score the club never had', () => {
    const t = g({ gf: 5, ga: 2 });
    const [f] = scoreline(input(t, [g({ gf: 1, ga: 0 })]));
    expect(f.rarity).toBe(1);
    expect(f.textHe).toContain('2:5 — תוצאה ראשונה אי-פעם');
  });
  it('says "first since" after a decade, nothing after three seasons', () => {
    const old = g({ gf: 5, ga: 2, seasonYear: 2005 });
    expect(scoreline(input(g({ gf: 5, ga: 2, seasonYear: 2020 }), [old]))[0].textHe).toContain('לראשונה מאז 2005/06');
    const recent = g({ gf: 5, ga: 2, seasonYear: 2017 });
    expect(scoreline(input(g({ gf: 5, ga: 2, seasonYear: 2020 }), [recent]))).toHaveLength(0);
  });
  it('flags a league-wide first only inside the complete era', () => {
    const t = g({ gf: 5, ga: 2, atHome: false, seasonYear: 2020 });
    const history = [g({ gf: 5, ga: 2, seasonYear: 2019 })];
    expect(scoreline(input(t, history)).some((f) => f.scope === 'league')).toBe(false);
    const withEra = scoreline(input(t, history, { leagueFrom: 1995, league: [lg('x', 'y', 1, 0, 2000)] }));
    const league = withEra.find((f) => f.scope === 'league')!;
    expect(league.textHe).toContain('2-5 לקבוצה המארחת');
    expect(league.coverageHe).toBe('בליגה הבכירה מאז 1995/96');
  });
});

describe('sameScore', () => {
  it('finds two identical scores in a row and counts league precedents', () => {
    const prev = g({ gf: 5, ga: 2, atHome: false });
    const t = g({ gf: 5, ga: 2, atHome: false });
    const league = [lg('x', 'h', 2, 5, 1995), lg('h', 'y', 5, 2, 1995), lg('a', 'b', 1, 1, 1995)];
    const facts = sameScore(input(t, [g({ gf: 1, ga: 1 }), prev], { leagueFrom: 1990, league }));
    expect(facts[0].textHe).toBe('2:5 פעמיים ברצף — לראשונה בתולדות הפועל באר שבע');
    const lf = facts.find((f) => f.scope === 'league')!;
    expect(lf.numbers.count).toBe(1);
    expect(lf.textHe).toContain('האחרונה: ק-h ב-1995/96');
  });
  it('stays silent when the previous score differs', () => {
    expect(sameScore(input(g({ gf: 5, ga: 2 }), [g({ gf: 2, ga: 5 })]))).toHaveLength(0);
  });
});

describe('goalFlood', () => {
  it('separates "consecutive away games" from "consecutive games"', () => {
    const a1 = g({ gf: 5, ga: 2, atHome: false });
    const home = g({ gf: 1, ga: 0, atHome: true });
    const a2 = g({ gf: 6, ga: 0, atHome: false });
    expect(goalFlood(input(a2, [a1, home]))[0].textHe).not.toContain('בלי משחק ביניהם');
    const a3 = g({ gf: 5, ga: 2, atHome: false });
    expect(goalFlood(input(a3, [a1, home, a2]))[0].textHe).toContain('בלי משחק ביניהם');
  });
  it('counts league precedents and the adjacent ones', () => {
    const league = [lg('x', 'p', 0, 5, 1995), lg('p', 'z', 1, 0, 1995), lg('y', 'p', 1, 6, 1995), lg('q', 'p', 0, 5, 1996)];
    const prev = g({ gf: 5, ga: 2, atHome: false });
    const t = g({ gf: 5, ga: 2, atHome: false });
    const lf = goalFlood(input(t, [prev], { leagueFrom: 1990, league })).find((f) => f.scope === 'league')!;
    expect(lf.numbers.times).toBe(3); // p: (x,y) and (y,q) — this is the 3rd
    expect(lf.numbers.adjacentTimes).toBe(2); // only (y,q) was adjacent
  });
  it('needs five in both games', () => {
    expect(goalFlood(input(g({ gf: 5, atHome: false }), [g({ gf: 4, atHome: false })]))).toHaveLength(0);
  });
});

describe('halfTime', () => {
  it('reports a comeback win with the season record when not leading at the break', () => {
    const season = [gg('f10 f20'), gg('a10 f60 f70'), gg('a10 a20'), gg('f10 a20 f80')];
    const prev = [gg('a10 f60 f70', { seasonYear: 2019 }), gg('a10', { seasonYear: 2019 }), gg('f10 a30', { seasonYear: 2019 })];
    const t = gg('a30 f70 f80');
    const [f] = halfTimeDetector(input(t, [...prev, ...season]));
    expect(f.textHe).toContain('ניצחה אחרי פיגור במחצית');
    expect(f.numbers).toMatchObject({ wins: 3, games: 4, prevWins: 1, prevGames: 3 });
  });
  it('ignores a win that led at half-time', () => {
    expect(halfTimeDetector(input(gg('f10 f70'), []))).toHaveLength(0);
  });
  it('stays silent when goal minutes are missing for the season', () => {
    expect(halfTimeDetector(input(gg('a30 f70 f80'), [g(), g(), g()]))).toHaveLength(0);
  });
});

describe('secondHalf', () => {
  const season = (year: number, spec: string, n: number) => Array.from({ length: n }, () => gg(spec, { seasonYear: year }));
  it('calls a record share against earlier seasons', () => {
    const earlier = season(2018, 'f10 f60', 10); // 50%
    const now = season(2020, 'f10 f60 f70 f80', 2); // 75%
    const [f] = secondHalf(input(gg('f50 f60'), [...earlier, ...now]));
    expect(f.rarity).toBe(0.85);
    expect(f.numbers).toMatchObject({ second: 8, total: 10, pct: 80 });
  });
  it('stays silent below 60%', () => {
    expect(secondHalf(input(gg('f10 f60'), [...season(2018, 'f60', 20), ...season(2020, 'f10 f20 f60', 3)]))).toHaveLength(0);
  });
});

describe('subGoals', () => {
  const L = { hasLineups: true };
  it('compares the substitutes share with last season', () => {
    const prev = Array.from({ length: 5 }, () => gg('f10 f20', { ...L, seasonYear: 2019 }));
    const now = [gg('f10s f20', L), gg('f10 f20', L)];
    const [f] = subGoals(input(gg('f60s f70', L), [...prev, ...now]));
    expect(f.numbers).toMatchObject({ bySub: 2, total: 6, prevBySub: 0, prevTotal: 10 });
  });
  it('needs lineups', () => {
    expect(subGoals(input(gg('f60 f70'), []))).toHaveLength(0);
  });
});

describe('streaks', () => {
  const W = () => g({ gf: 2, ga: 0 });
  const L = () => g({ gf: 0, ga: 1 });
  it('calls a new club record', () => {
    const [f] = streaks(input(W(), [W(), W(), L(), W(), W(), W()]));
    expect(f.textHe).toBe('4 ניצחונות בליגה ברצף — שיא מועדון חדש (הקודם: 2, 2020/21)');
  });
  it('says what the next game can equal', () => {
    const history = [W(), W(), W(), W(), L(), W(), W(), W()];
    const [f] = streaks(input(g({ gf: null, ga: null }), history, { kind: 'PRE' }));
    expect(f.textHe).toContain('ניצחון ישלים 4 ניצחונות בליגה ברצף וישווה את שיא המועדון');
  });
  it('says "longest since" when an older run was longer', () => {
    const old = [...Array.from({ length: 8 }, () => g({ gf: 1, ga: 0, seasonYear: 2010 })), g({ gf: 0, ga: 1, seasonYear: 2010 })];
    const now = [g({ gf: 1, ga: 0, seasonYear: 2020 }), g({ gf: 1, ga: 0, seasonYear: 2020 })];
    const [f] = streaks(input(g({ gf: 1, ga: 0, seasonYear: 2020 }), [...old, ...now]));
    expect(f.textHe).toContain('הרצף הארוך ביותר מאז 2010/11');
  });
});

describe('opponent', () => {
  it('flags a first-ever win over an opponent', () => {
    const history = [g({ gf: 0, ga: 1 }), g({ gf: 1, ga: 1 }), g({ gf: 0, ga: 2 })];
    expect(opponent(input(g({ gf: 2, ga: 0 }), history))[0].textHe).toContain('ניצחון ראשון אי-פעם');
  });
  it('flags the biggest-ever win', () => {
    const history = Array.from({ length: 5 }, () => g({ gf: 2, ga: 1 }));
    expect(opponent(input(g({ gf: 5, ga: 2 }), history)).map((f) => f.key)).toContain('opponent-biggest-win');
  });
  it('gives the head-to-head before the game', () => {
    const history = [g({ gf: 2, ga: 1, seasonYear: 2018 }), g({ gf: 0, ga: 0, seasonYear: 2019 })];
    const [f] = opponent(input(g({ gf: null, ga: null }), history, { kind: 'PRE' }));
    expect(f.textHe).toBe('מאזן מול יריב: 1 ניצחונות, 1 תיקו ו-0 הפסדים ב-2 מפגשים; האחרון: 0:0 ב-2019/20');
  });
});

describe('milestones', () => {
  it('marks a 50th goal and a first goal', () => {
    const history = Array.from({ length: 49 }, () => gg('f10@p1'));
    const keys = milestones(input(gg('f10@p1 f20@p2'), history)).map((f) => f.textHe);
    expect(keys).toContain('השער ה-50 של שחקן p1 במדי הפועל באר שבע');
    expect(keys).toContain('שער ראשון של שחקן p2 במדי הפועל באר שבע');
  });
  it('marks a climb past another scorer', () => {
    const history = [gg('f10@a f20@a f30@a'), gg('f10@b f20@b')];
    const f = milestones(input(gg('f10@b f20@b'), history)).find((x) => x.key === 'milestone-overtake')!;
    expect(f.textHe).toBe('שחקן b (4) עקף את שחקן a (3) ועלה למקום 1 ברשימת הכובשים של הפועל באר שבע');
  });
  it('says who is one goal away before the game', () => {
    const history = Array.from({ length: 24 }, () => gg('f10@p1'));
    const [f] = milestones(input(g({ gf: null, ga: null }), history, { kind: 'PRE' }));
    expect(f.textHe).toBe('שחקן p1 במרחק שער אחד מהשער ה-25 שלו במדי הפועל באר שבע');
  });
});

describe('pace', () => {
  it('compares points after N games with every earlier season', () => {
    const old = Array.from({ length: 6 }, (_, i) => g({ seasonYear: 2010, gf: i < 4 ? 1 : 0, ga: 0 })); // 4W 2D after 6 = 14
    const now = Array.from({ length: 5 }, () => g({ seasonYear: 2020, gf: 1, ga: 0 }));
    const [f] = pace(input(g({ seasonYear: 2020, gf: 1, ga: 0 }), [...old, ...now]));
    expect(f.textHe).toBe('18 נקודות אחרי 6 משחקי ליגה — הפתיחה הטובה בתולדות הפועל באר שבע (לפי 3 נקודות לניצחון)');
  });
});

describe('runDetectors, rankFacts, unknownNumbers', () => {
  const fact = (p: Partial<Fact>): Fact => ({ key: 'k', kind: 'POST', scope: 'club', coverageHe: '', rarity: 0.5, textHe: '', numbers: {}, evidenceGameIds: [], ...p });
  it('runs every detector without throwing on an empty history', () => {
    expect(() => runDetectors(input(g({ gf: 5, ga: 2 }), []))).not.toThrow();
  });
  it('ranks rarest first, league before club at equal rarity, and drops removed facts', () => {
    const ranked = rankFacts([fact({ key: 'a', rarity: 0.5 }), fact({ key: 'b', rarity: 0.5, scope: 'league' }), fact({ key: 'c', rarity: 0.9, removed: true }), fact({ key: 'd', rarity: 0.1 })]);
    expect(ranked.map((f) => f.key)).toEqual(['b', 'a']);
  });
  it('flags numbers the text invented', () => {
    const facts = [fact({ textHe: '2:5 פעמיים ברצף, האחרונה ב-1995/96', numbers: { count: 7 } })];
    expect(unknownNumbers('1. שבע קבוצות, 7 פעמים, 2:5 מאז 1995/96 ולא מאז 1968', facts)).toEqual(['1968']);
  });
});
