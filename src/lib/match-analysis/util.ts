import type { ClubGame, LeagueGame } from './types';

/** Hebrew sports convention: the subject's goals on the right → "2:5" for a 5-2 win. */
export const scoreHe = (forGoals: number, againstGoals: number) => `${againstGoals}:${forGoals}`;
export const seasonHe = (year: number) => `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
export const resultOf = (g: { gf: number | null; ga: number | null }) =>
  g.gf == null || g.ga == null ? null : g.gf > g.ga ? 'W' : g.gf === g.ga ? 'D' : 'L';
export const played = (g: ClubGame) => g.gf != null && g.ga != null;

export function halfTime(g: ClubGame): { f: number; a: number } | null {
  if (!g.goals) return null;
  const first = g.goals.filter((x) => x.minute <= 45);
  return { f: first.filter((x) => x.forClub).length, a: first.filter((x) => !x.forClub).length };
}

export function htState(g: ClubGame): 'lead' | 'level' | 'trail' | null {
  const ht = halfTime(g);
  if (!ht) return null;
  return ht.f > ht.a ? 'lead' : ht.f === ht.a ? 'level' : 'trail';
}

export const seasonLeagueGames = (games: ClubGame[], year: number) =>
  games.filter((g) => g.isLeague && g.seasonYear === year && played(g));

/** Share of games carrying the data a stat needs — detectors stay silent below MIN_COVERAGE. */
export const coverage = (games: ClubGame[], pick: (g: ClubGame) => boolean) =>
  games.length ? games.filter(pick).length / games.length : 0;
export const MIN_COVERAGE = 0.8;

export const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

export interface TeamGame { game: LeagueGame; home: boolean; gf: number; ga: number }

/** Each club's league games from its own point of view, oldest first. */
export function teamSequences(league: LeagueGame[]): Map<string, TeamGame[]> {
  const m = new Map<string, TeamGame[]>();
  const add = (k: string, t: TeamGame) => {
    const a = m.get(k);
    if (a) a.push(t);
    else m.set(k, [t]);
  };
  for (const g of league) {
    add(g.homeKey, { game: g, home: true, gf: g.hs, ga: g.as });
    add(g.awayKey, { game: g, home: false, gf: g.as, ga: g.hs });
  }
  return m;
}

export const teamHe = (t: TeamGame) => (t.home ? t.game.homeHe : t.game.awayHe);

/** True when the target is a top-flight game inside the era where we hold every league game. */
export const inLeagueEra = (target: ClubGame, leagueFrom: number | null) =>
  leagueFrom != null && target.competitionId === 'comp_liga_haal' && target.seasonYear >= leagueFrom;

export const leagueCoverageHe = (leagueFrom: number) => `בליגה הבכירה מאז ${seasonHe(leagueFrom)}`;
