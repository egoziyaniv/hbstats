// src/lib/team-season-snapshot.ts — "תמונת עונה": what a team's season looks like so far,
// computed from its played games (scores, team stats, goal events, FotMob player ratings).
//
// computeSnapshot() is pure (games in, numbers out) so it can be tested; the loader at the
// bottom fetches the games and the player names/photos.
import prisma from '@/lib/prisma';

export type SnapGoal = { type: string; minute: number; extraMinute: number | null; teamId: string | null; playerId: string | null; relatedPlayerId?: string | null };
export type SnapTeamStat = { label: string; home: string | number | null; away: string | number | null };

export type SnapGame = {
  id: string;
  dateTime: Date;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number;
  awayScore: number;
  competitionId: string;
  competitionName: string;
  competitionType: 'LEAGUE' | 'CUP' | 'EUROPE' | string;
  roundLabel: string | null;
  opponentName: string;
  opponentLogo: string | null;
  stats: {
    homePossession: number | null; awayPossession: number | null;
    homeShots: number | null; awayShots: number | null;
    homeShotsOnTarget: number | null; awayShotsOnTarget: number | null;
    homeXg: number | null; awayXg: number | null;
  } | null;
  teamStats: SnapTeamStat[] | null;
  goals: SnapGoal[];
};

export type Record3 = { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; cleanSheets: number; failedToScore: number };
export type Duel = { us: number | null; them: number | null; games: number };
export type ControlBlock = {
  possession: Duel; shots: Duel; shotsOnTarget: Duel; bigChances: Duel; boxTouches: Duel; xg: Duel;
  /** goals ÷ shots on target, %. */
  conversion: number | null;
  /** 1 − conceded ÷ opponent shots on target, %. */
  savePct: number | null;
};
export type GameLine = {
  id: string; date: string; competitionName: string; roundLabel: string | null; home: boolean;
  opponentName: string; opponentLogo: string | null; goalsFor: number; goalsAgainst: number;
  result: 'W' | 'D' | 'L'; firstGoal: 'us' | 'them' | null;
};

export const TIMING_BUCKETS = ['1-15', '16-30', '31-45', '46-60', '61-75', '76-90+'] as const;

const ownedGoal = (g: SnapGoal) => ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'].includes(g.type);

/** Which team a goal event counts for. An OWN_GOAL row carries the team that BENEFITS —
 *  checked against final scores on every own goal since 2024 — so it is credited as-is. */
const goalTeam = (g: SnapGoal) => g.teamId;

/** Goals in kick-off order, reconciled with the final score.
 *  - De-duplicated: two sources sometimes record the same goal, and a side cannot score
 *    twice in the same minute by the same player.
 *  - Capped at each side's actual score: a source can keep a goal that was later chalked off
 *    (Víkingur 0-2 Beer Sheva carries a playerless Víkingur "goal" at 90'). Playerless
 *    extras are dropped first, then the latest. */
export function orderedGoals(game: SnapGame): SnapGoal[] {
  const seen = new Set<string>();
  const unique = game.goals
    .filter(ownedGoal)
    .filter((g) => {
      const k = `${goalTeam(g)}|${g.playerId ?? ''}|${g.minute}|${g.extraMinute ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.minute - b.minute || (a.extraMinute ?? 0) - (b.extraMinute ?? 0));

  const capped = new Set<SnapGoal>(unique);
  for (const [teamId, score] of [[game.homeTeamId, game.homeScore], [game.awayTeamId, game.awayScore]] as const) {
    const mine = unique.filter((g) => goalTeam(g) === teamId);
    let excess = mine.length - score;
    const dropOrder = [...mine.filter((g) => !g.playerId).reverse(), ...mine.filter((g) => g.playerId).reverse()];
    for (const g of dropOrder) {
      if (excess <= 0) break;
      capped.delete(g);
      excess -= 1;
    }
  }
  return unique.filter((g) => capped.has(g));
}

export const bucketOf = (minute: number) => Math.min(Math.max(Math.floor((minute - 1) / 15), 0), 5);

const emptyRecord = (): Record3 => ({ played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, failedToScore: 0 });

function side(teamId: string, g: SnapGame) {
  const home = g.homeTeamId === teamId;
  return { home, gf: home ? g.homeScore : g.awayScore, ga: home ? g.awayScore : g.homeScore };
}

export function recordOf(teamId: string, games: SnapGame[]): Record3 {
  const r = emptyRecord();
  for (const g of games) {
    const { gf, ga } = side(teamId, g);
    r.played += 1; r.goalsFor += gf; r.goalsAgainst += ga;
    if (gf > ga) r.wins += 1; else if (gf === ga) r.draws += 1; else r.losses += 1;
    if (ga === 0) r.cleanSheets += 1;
    if (gf === 0) r.failedToScore += 1;
  }
  return r;
}

/** FotMob values come as numbers or as text like "625 (89%)". Labels can repeat across
 *  sections, so the first occurrence wins. */
function teamStat(stats: SnapTeamStat[] | null, label: string, home: boolean): [number | null, number | null] {
  const row = stats?.find((s) => s.label === label);
  if (!row) return [null, null];
  const n = (v: unknown) => {
    const m = String(v ?? '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const h = n(row.home), a = n(row.away);
  return home ? [h, a] : [a, h];
}

function duel(values: Array<[number | null, number | null]>): Duel {
  const pairs = values.filter(([u, t]) => u !== null && t !== null) as Array<[number, number]>;
  if (!pairs.length) return { us: null, them: null, games: 0 };
  const avg = (i: 0 | 1) => Math.round((pairs.reduce((s, p) => s + p[i], 0) / pairs.length) * 10) / 10;
  return { us: avg(0), them: avg(1), games: pairs.length };
}

export function controlOf(teamId: string, games: SnapGame[]): ControlBlock {
  const st = (g: SnapGame, h: keyof NonNullable<SnapGame['stats']>, a: keyof NonNullable<SnapGame['stats']>) => {
    const { home } = side(teamId, g);
    const s = g.stats;
    if (!s) return [null, null] as [number | null, number | null];
    return (home ? [s[h], s[a]] : [s[a], s[h]]) as [number | null, number | null];
  };
  const sot = games.map((g) => st(g, 'homeShotsOnTarget', 'awayShotsOnTarget'));
  let goalsOnTarget = 0, ourSot = 0, conceded = 0, theirSot = 0;
  games.forEach((g, i) => {
    const [u, t] = sot[i];
    const { gf, ga } = side(teamId, g);
    if (u !== null) { ourSot += u; goalsOnTarget += gf; }
    if (t !== null) { theirSot += t; conceded += ga; }
  });
  return {
    possession: duel(games.map((g) => st(g, 'homePossession', 'awayPossession'))),
    shots: duel(games.map((g) => st(g, 'homeShots', 'awayShots'))),
    shotsOnTarget: duel(sot),
    xg: duel(games.map((g) => st(g, 'homeXg', 'awayXg'))),
    bigChances: duel(games.map((g) => teamStat(g.teamStats, 'Big chances', side(teamId, g).home))),
    boxTouches: duel(games.map((g) => teamStat(g.teamStats, 'Touches in opposition box', side(teamId, g).home))),
    conversion: ourSot ? Math.round((100 * goalsOnTarget) / ourSot) : null,
    savePct: theirSot ? Math.round(100 * (1 - conceded / theirSot)) : null,
  };
}

export function timingOf(teamId: string, games: SnapGame[]) {
  const scored = [0, 0, 0, 0, 0, 0];
  const conceded = [0, 0, 0, 0, 0, 0];
  let counted = 0, total = 0;
  for (const g of games) {
    const { gf, ga } = side(teamId, g);
    total += gf + ga;
    for (const goal of orderedGoals(g)) {
      const b = bucketOf(goal.minute);
      if (goalTeam(goal) === teamId) scored[b] += 1; else conceded[b] += 1;
      counted += 1;
    }
  }
  return { scored, conceded, coverage: total ? counted / total : 1 };
}

export function gameLines(teamId: string, games: SnapGame[]): GameLine[] {
  return games.map((g) => {
    const { home, gf, ga } = side(teamId, g);
    const first = orderedGoals(g)[0];
    return {
      id: g.id, date: g.dateTime.toISOString().slice(0, 10), competitionName: g.competitionName,
      roundLabel: g.roundLabel, home, opponentName: g.opponentName, opponentLogo: g.opponentLogo,
      goalsFor: gf, goalsAgainst: ga, result: gf > ga ? 'W' : gf === ga ? 'D' : 'L',
      firstGoal: first ? (goalTeam(first) === teamId ? 'us' : 'them') : null,
    };
  });
}

/** League points after each league game, in the order played. */
export function pointsProgression(lines: GameLine[]) {
  let pts = 0;
  return lines.map((l, i) => {
    pts += l.result === 'W' ? 3 : l.result === 'D' ? 1 : 0;
    return { n: i + 1, label: l.roundLabel || l.date, opponent: l.opponentName, points: pts };
  });
}

// ─────────────────────────── loader ───────────────────────────

const FRIENDLIES_API_ID = 667; // "משחקי הכנה" — never part of a season's competitive record

export type PlayerLine = { playerId: string; name: string; photoUrl: string | null; value: number; games: number; detail?: string };

export type TeamSeasonSnapshot = {
  team: { id: string; nameHe: string; logoUrl: string | null };
  seasonName: string;
  standing: { position: number; points: number; played: number; leaderName: string | null; gapToLeader: number } | null;
  leagueName: string | null;
  competitive: Record3;
  byCompetition: Array<{ id: string; name: string; type: string; record: Record3 }>;
  leagueHome: Record3 | null;
  leagueAway: Record3 | null;
  leagueControl: ControlBlock | null;
  europeControl: ControlBlock | null;
  timing: ReturnType<typeof timingOf>;
  lines: GameLine[];
  leaguePoints: ReturnType<typeof pointsProgression>;
  scorers: PlayerLine[];
  assisters: PlayerLine[];
  ratings: PlayerLine[];
};

export async function buildTeamSeasonSnapshot(teamId: string): Promise<TeamSeasonSnapshot | null> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, nameHe: true, nameEn: true, logoUrl: true, seasonId: true, season: { select: { name: true } } },
  });
  if (!team) return null;

  const raw = await prisma.game.findMany({
    where: {
      seasonId: team.seasonId,
      status: 'COMPLETED',
      homeScore: { not: null },
      awayScore: { not: null },
      OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
      NOT: { competition: { apiFootballId: FRIENDLIES_API_ID } },
    },
    select: {
      id: true, dateTime: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true,
      roundNameHe: true, roundNameEn: true,
      competition: { select: { id: true, nameHe: true, type: true } },
      homeTeam: { select: { nameHe: true, nameEn: true, logoUrl: true } },
      awayTeam: { select: { nameHe: true, nameEn: true, logoUrl: true } },
      gameStats: {
        select: {
          homeTeamPossession: true, awayTeamPossession: true, homeShotsTotal: true, awayShotsTotal: true,
          homeShotsOnTarget: true, awayShotsOnTarget: true, homeXg: true, awayXg: true,
        },
      },
      fotmobData: { select: { teamStats: true } },
      events: {
        where: { type: { in: ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'] } },
        select: { type: true, minute: true, extraMinute: true, teamId: true, playerId: true, relatedPlayerId: true },
      },
    },
    orderBy: { dateTime: 'asc' },
  });

  const games: SnapGame[] = raw.map((g) => {
    const home = g.homeTeamId === teamId;
    const opp = home ? g.awayTeam : g.homeTeam;
    const s = g.gameStats;
    return {
      id: g.id, dateTime: g.dateTime, homeTeamId: g.homeTeamId, awayTeamId: g.awayTeamId,
      homeScore: g.homeScore ?? 0, awayScore: g.awayScore ?? 0,
      competitionId: g.competition?.id ?? '', competitionName: g.competition?.nameHe ?? '',
      competitionType: g.competition?.type ?? '',
      roundLabel: g.roundNameHe || null,
      opponentName: opp.nameHe || opp.nameEn, opponentLogo: opp.logoUrl,
      stats: s ? {
        homePossession: s.homeTeamPossession, awayPossession: s.awayTeamPossession,
        homeShots: s.homeShotsTotal, awayShots: s.awayShotsTotal,
        homeShotsOnTarget: s.homeShotsOnTarget, awayShotsOnTarget: s.awayShotsOnTarget,
        homeXg: s.homeXg, awayXg: s.awayXg,
      } : null,
      teamStats: Array.isArray(g.fotmobData?.teamStats) ? (g.fotmobData!.teamStats as SnapTeamStat[]) : null,
      goals: g.events.map((e) => ({ type: e.type, minute: e.minute, extraMinute: e.extraMinute, teamId: e.teamId, playerId: e.playerId, relatedPlayerId: e.relatedPlayerId })),
    };
  });

  const league = games.filter((g) => g.competitionType === 'LEAGUE');
  const europe = games.filter((g) => g.competitionType === 'EUROPE');
  const leagueId = league[0]?.competitionId ?? null;

  const byCompetition = [...new Map(games.map((g) => [g.competitionId, g])).values()].map((g) => ({
    id: g.competitionId, name: g.competitionName, type: g.competitionType,
    record: recordOf(teamId, games.filter((x) => x.competitionId === g.competitionId)),
  }));

  // League standing and the gap to the top.
  let standing: TeamSeasonSnapshot['standing'] = null;
  if (leagueId) {
    const rows = await prisma.standing.findMany({
      where: { seasonId: team.seasonId, competitionId: leagueId },
      select: { teamId: true, position: true, points: true, pointsAdjustment: true, played: true, team: { select: { nameHe: true, nameEn: true } } },
      orderBy: { position: 'asc' },
    });
    const me = rows.find((r) => r.teamId === teamId);
    const top = rows[0];
    if (me) {
      const pts = me.points + me.pointsAdjustment;
      const topPts = top ? top.points + top.pointsAdjustment : pts;
      standing = {
        position: me.position, points: pts, played: me.played,
        leaderName: top && top.teamId !== teamId ? top.team.nameHe || top.team.nameEn : null,
        gapToLeader: Math.max(0, topPts - pts),
      };
    }
  }

  // Players: goals and assists from this team's goal events (own goals excluded),
  // FotMob ratings from game_player_stats (30+ minutes), all keyed by person.
  const scorerCount = new Map<string, { goals: number; pens: number; games: Set<string> }>();
  const assistCount = new Map<string, { n: number; games: Set<string> }>();
  for (const g of games) {
    // The same reconciled list as the timing chart, so tallies never exceed the scoreline.
    for (const e of orderedGoals(g)) {
      if (e.teamId !== teamId || e.type === 'OWN_GOAL') continue;
      const scorer = e.playerId; // relatedPlayerId is the assist, never a fallback scorer
      if (scorer) {
        const c = scorerCount.get(scorer) ?? { goals: 0, pens: 0, games: new Set() };
        c.goals += 1; if (e.type === 'PENALTY_GOAL') c.pens += 1; c.games.add(g.id);
        scorerCount.set(scorer, c);
      }
      if (e.relatedPlayerId && e.relatedPlayerId !== e.playerId) {
        const a = assistCount.get(e.relatedPlayerId) ?? { n: 0, games: new Set() };
        a.n += 1; a.games.add(g.id);
        assistCount.set(e.relatedPlayerId, a);
      }
    }
  }
  const ratingRows = await prisma.gamePlayerStats.findMany({
    where: { gameId: { in: raw.map((g) => g.id) }, teamId, rating: { not: null }, minutes: { gte: 30 }, playerId: { not: null } },
    select: { playerId: true, rating: true },
  });

  const ids = [...new Set([...scorerCount.keys(), ...assistCount.keys(), ...ratingRows.map((r) => r.playerId!)])];
  const rows = await prisma.player.findMany({
    where: { id: { in: ids } },
    select: { id: true, nameHe: true, nameEn: true, photoUrl: true, canonicalPlayerId: true },
  });
  const canonIds = [...new Set(rows.map((r) => r.canonicalPlayerId).filter(Boolean) as string[])];
  const canonRows = canonIds.length
    ? await prisma.player.findMany({ where: { id: { in: canonIds } }, select: { id: true, nameHe: true, photoUrl: true } })
    : [];
  const canonById = new Map(canonRows.map((r) => [r.id, r]));
  // One key per PERSON: the same player can appear as two season rows in one squad.
  const person = new Map<string, { key: string; name: string; photo: string | null }>();
  for (const r of rows) {
    const canon = r.canonicalPlayerId ? canonById.get(r.canonicalPlayerId) : null;
    person.set(r.id, {
      key: r.canonicalPlayerId || r.id,
      name: r.nameHe || canon?.nameHe || r.nameEn,
      photo: r.photoUrl || canon?.photoUrl || null,
    });
  }

  const fold = (entries: Array<[string, number, Set<string>, string?]>) => {
    const out = new Map<string, PlayerLine>();
    for (const [rowId, value, gameSet, detail] of entries) {
      const p = person.get(rowId);
      if (!p) continue;
      const cur = out.get(p.key) ?? { playerId: p.key, name: p.name, photoUrl: p.photo, value: 0, games: 0, detail };
      cur.value += value; cur.games += gameSet.size; cur.photoUrl ??= p.photo;
      out.set(p.key, cur);
    }
    return [...out.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'he'));
  };
  const scorers = fold([...scorerCount].map(([id, c]) => [id, c.goals, c.games, c.pens ? `${c.pens} מפנדל` : undefined]));
  const assisters = fold([...assistCount].map(([id, a]) => [id, a.n, a.games]));

  const ratingByPerson = new Map<string, { sum: number; n: number }>();
  for (const r of ratingRows) {
    const p = person.get(r.playerId!);
    if (!p) continue;
    const cur = ratingByPerson.get(p.key) ?? { sum: 0, n: 0 };
    cur.sum += r.rating!; cur.n += 1;
    ratingByPerson.set(p.key, cur);
  }
  const keyToPerson = new Map([...person.values()].map((p) => [p.key, p]));
  // A rating over one or two games says little; require about a third of the rated games.
  const minGames = Math.max(3, Math.floor(games.length / 3));
  const ratings: PlayerLine[] = [...ratingByPerson]
    .filter(([, v]) => v.n >= minGames)
    .map(([key, v]) => ({
      playerId: key, name: keyToPerson.get(key)!.name, photoUrl: keyToPerson.get(key)!.photo,
      value: Math.round((v.sum / v.n) * 100) / 100, games: v.n,
    }))
    .sort((a, b) => b.value - a.value);

  const lines = gameLines(teamId, games);
  return {
    team: { id: team.id, nameHe: team.nameHe || team.nameEn, logoUrl: team.logoUrl },
    seasonName: team.season.name,
    standing,
    leagueName: league[0]?.competitionName ?? null,
    competitive: recordOf(teamId, games),
    byCompetition,
    leagueHome: league.length ? recordOf(teamId, league.filter((g) => g.homeTeamId === teamId)) : null,
    leagueAway: league.length ? recordOf(teamId, league.filter((g) => g.awayTeamId === teamId)) : null,
    leagueControl: league.length ? controlOf(teamId, league) : null,
    europeControl: europe.length ? controlOf(teamId, europe) : null,
    timing: timingOf(teamId, games),
    lines,
    leaguePoints: pointsProgression(lines.filter((l, i) => games[i].competitionType === 'LEAGUE')),
    scorers,
    assisters,
    ratings,
  };
}
