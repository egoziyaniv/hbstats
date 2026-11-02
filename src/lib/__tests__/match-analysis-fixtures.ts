import type { ClubGame, ClubGoal, DetectorInput, LeagueGame } from '@/lib/match-analysis/types';

let seq = 0;
const start = new Date('2000-01-01T00:00:00Z').getTime();
const WEEK = 7 * 86_400_000;

/** A club game with sensible defaults; ids and dates increase in call order. */
export function g(p: Partial<ClubGame> = {}): ClubGame {
  seq += 1;
  return {
    id: `g${seq}`,
    date: new Date(start + seq * WEEK),
    seasonYear: 2020,
    competitionId: 'comp_liga_haal',
    isLeague: true,
    atHome: true,
    opponentKey: 'opp',
    opponentHe: 'יריב',
    venueKey: null,
    venueHe: null,
    gf: 1,
    ga: 0,
    goals: null,
    hasLineups: false,
    ...p,
  };
}

/** Goals from a compact spec: "f30 a40 f70s f80o f90@p1" — f/a = for/against, s = by sub, o = own goal, @key = scorer. */
export function goals(spec: string, lineups = false): ClubGoal[] {
  return spec.split(/\s+/).filter(Boolean).map((t) => {
    const m = t.match(/^([fa])(\d+)([so]*)(?:@(\w+))?$/);
    if (!m) throw new Error(`bad goal spec ${t}`);
    return {
      minute: Number(m[2]),
      forClub: m[1] === 'f',
      ownGoal: m[3].includes('o'),
      scorerKey: m[4] ?? null,
      scorerHe: m[4] ? `שחקן ${m[4]}` : null,
      bySub: lineups ? m[3].includes('s') : null,
    };
  });
}

/** A played game whose goals come from the spec (score derived from it). */
export function gg(spec: string, p: Partial<ClubGame> = {}): ClubGame {
  const lineups = p.hasLineups ?? false;
  const list = goals(spec, lineups);
  return g({ gf: list.filter((x) => x.forClub).length, ga: list.filter((x) => !x.forClub).length, goals: list, ...p });
}

let lseq = 0;
export function lg(homeKey: string, awayKey: string, hs: number, as: number, seasonYear = 2000): LeagueGame {
  lseq += 1;
  return { id: `l${lseq}`, date: new Date(start + lseq * WEEK), seasonYear, homeKey, awayKey, homeHe: `ק-${homeKey}`, awayHe: `ק-${awayKey}`, hs, as };
}

export function input(target: ClubGame, history: ClubGame[], extra: Partial<DetectorInput> = {}): DetectorInput {
  return { kind: 'POST', target, history, league: [], leagueFrom: null, clubHe: 'הפועל באר שבע', ...extra };
}
