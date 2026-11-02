// Loads what the detectors run on: every official Beer Sheva game (with goal minutes, scorers and
// whether a scorer came off the bench) and the top-flight games of the era where we hold them all.
import prisma from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';
import type { ClubGame, ClubGoal, LeagueGame } from './types';

export const HBS_CLUB_KEY = 'api-563';
export const TOP_FLIGHT = 'comp_liga_haal';
const LEAGUE_IDS = new Set([
  'comp_liga_haal', 'comp_liga_leumit',
  'comp_hist_liga_alef', 'comp_hist_liga_bet', 'comp_hist_liga_gimel', 'comp_hist_liga_artzit', 'comp_hist_regional',
]);
const NOT_OFFICIAL = ['comp_friendlies'];
const GOAL_TYPES = ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'] as const;
const MIN_ERA_SEASONS = 5;

export interface AnalysisContext {
  clubHe: string;
  teamIds: string[];
  games: ClubGame[]; // completed and scheduled official games, oldest first
  leagueFrom: number | null;
  league: LeagueGame[];
}

type Side = 'home' | 'away';

/** Events name their side by teamId, by 'home'/'away', or by the team's English name. */
function sideOf(
  e: { teamId: string | null; team: string },
  g: { homeTeamId: string; awayTeamId: string; homeTeam: { nameEn: string }; awayTeam: { nameEn: string } },
): Side | null {
  if (e.teamId === g.homeTeamId) return 'home';
  if (e.teamId === g.awayTeamId) return 'away';
  if (e.team === 'home' || e.team === 'away') return e.team;
  if (e.team === g.homeTeam.nameEn) return 'home';
  if (e.team === g.awayTeam.nameEn) return 'away';
  return null;
}

async function loadClubGames(teamIds: string[], keyOf: (teamId: string) => string): Promise<ClubGame[]> {
  const ids = new Set(teamIds);
  const rows = await prisma.game.findMany({
    where: {
      status: { in: ['COMPLETED', 'SCHEDULED'] },
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
      NOT: { competitionId: { in: NOT_OFFICIAL } },
    },
    orderBy: { dateTime: 'asc' },
    select: {
      id: true, dateTime: true, status: true, homeScore: true, awayScore: true, competitionId: true,
      homeTeamId: true, awayTeamId: true, venueId: true, venueNameHe: true,
      venue: { select: { nameHe: true } },
      season: { select: { year: true } },
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      events: {
        where: { type: { in: [...GOAL_TYPES] } },
        select: {
          type: true, minute: true, team: true, teamId: true, playerId: true,
          player: { select: { canonicalPlayerId: true, nameHe: true, nameEn: true } },
        },
      },
      lineupEntries: {
        where: { teamId: { in: teamIds }, role: { in: ['STARTER', 'SUBSTITUTE'] } },
        select: { role: true, playerId: true, player: { select: { canonicalPlayerId: true } } },
      },
    },
  });

  const out: ClubGame[] = [];
  for (const r of rows) {
    const atHome = ids.has(r.homeTeamId);
    const completed = r.status === 'COMPLETED';
    if (completed && (r.homeScore == null || r.awayScore == null)) continue;
    const clubSide: Side = atHome ? 'home' : 'away';
    const gf = completed ? (atHome ? r.homeScore : r.awayScore) : null;
    const ga = completed ? (atHome ? r.awayScore : r.homeScore) : null;
    const hasLineups = r.lineupEntries.length > 0;
    const subs = new Set(r.lineupEntries.filter((l) => l.role === 'SUBSTITUTE' && l.playerId).map((l) => l.player?.canonicalPlayerId ?? l.playerId));

    let goals: ClubGoal[] | null = null;
    if (completed) {
      const list: ClubGoal[] = [];
      let ok = true;
      for (const e of r.events) {
        const side = sideOf(e, r);
        if (!side || e.minute == null) { ok = false; break; }
        const scorerKey = e.player?.canonicalPlayerId ?? e.playerId ?? null;
        list.push({
          minute: e.minute,
          forClub: side === clubSide,
          ownGoal: e.type === 'OWN_GOAL',
          scorerKey: e.type === 'OWN_GOAL' ? null : scorerKey,
          scorerHe: e.type === 'OWN_GOAL' ? null : (e.player?.nameHe || e.player?.nameEn || null),
          bySub: hasLineups && e.type !== 'OWN_GOAL' && scorerKey ? subs.has(scorerKey) : null,
        });
      }
      if (ok && list.filter((x) => x.forClub).length === gf && list.filter((x) => !x.forClub).length === ga) goals = list;
    }

    const oppId = atHome ? r.awayTeamId : r.homeTeamId;
    const opp = atHome ? r.awayTeam : r.homeTeam;
    out.push({
      id: r.id,
      date: r.dateTime,
      seasonYear: r.season.year,
      competitionId: r.competitionId,
      isLeague: r.competitionId != null && LEAGUE_IDS.has(r.competitionId),
      atHome,
      opponentKey: keyOf(oppId),
      opponentHe: opp.nameHe || opp.nameEn,
      venueKey: r.venueId ?? r.venueNameHe ?? null,
      venueHe: r.venue?.nameHe || r.venueNameHe || null,
      gf, ga, goals, hasLineups,
    });
  }
  return out;
}

/**
 * First top-flight season from which we hold every game: per season, games held must reach
 * Σ(max games played per team)/2 from the standings. The running season is not judged.
 */
export async function leagueEraStart(): Promise<number | null> {
  const [games, standings] = await Promise.all([
    prisma.game.groupBy({ by: ['seasonId'], where: { competitionId: TOP_FLIGHT, status: 'COMPLETED' }, _count: { _all: true } }),
    prisma.standing.findMany({ where: { competitionId: TOP_FLIGHT }, select: { seasonId: true, teamId: true, played: true, season: { select: { year: true } } } }),
  ]);
  const held = new Map(games.map((g) => [g.seasonId, g._count._all]));
  const perSeason = new Map<string, { year: number; maxPlayed: Map<string, number> }>();
  for (const s of standings) {
    const e = perSeason.get(s.seasonId) || { year: s.season.year, maxPlayed: new Map<string, number>() };
    e.maxPlayed.set(s.teamId, Math.max(e.maxPlayed.get(s.teamId) ?? 0, s.played));
    perSeason.set(s.seasonId, e);
  }
  const seasons = Array.from(perSeason.entries()).map(([seasonId, e]) => {
    const expected = Array.from(e.maxPlayed.values()).reduce((a, b) => a + b, 0) / 2;
    return { year: e.year, complete: expected > 0 && (held.get(seasonId) ?? 0) >= expected };
  }).sort((a, b) => a.year - b.year);
  if (seasons.length < 2) return null;
  const judged = seasons.slice(0, -1); // the newest season is still running
  let from: number | null = null;
  for (let i = judged.length - 1; i >= 0 && judged[i].complete; i -= 1) from = judged[i].year;
  if (from == null || judged.filter((s) => s.year >= from!).length < MIN_ERA_SEASONS) return null;
  return from;
}

async function loadLeagueGames(from: number, keyOf: (teamId: string) => string): Promise<LeagueGame[]> {
  const rows = await prisma.game.findMany({
    where: { competitionId: TOP_FLIGHT, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null }, season: { year: { gte: from } } },
    orderBy: { dateTime: 'asc' },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true, homeTeamId: true, awayTeamId: true,
      season: { select: { year: true } },
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id, date: r.dateTime, seasonYear: r.season.year,
    homeKey: keyOf(r.homeTeamId), awayKey: keyOf(r.awayTeamId),
    homeHe: r.homeTeam.nameHe || r.homeTeam.nameEn, awayHe: r.awayTeam.nameHe || r.awayTeam.nameEn,
    hs: r.homeScore!, as: r.awayScore!,
  }));
}

export async function loadAnalysisContext(clubKey = HBS_CLUB_KEY): Promise<AnalysisContext> {
  const family = await getClubFamily(clubKey);
  if (!family) throw new Error(`club ${clubKey} not found`);
  // The archive's pre-API rows carry the Hebrew name only; make sure they are in.
  const byName = await prisma.team.findMany({ where: { nameHe: family.nameHe }, select: { id: true } });
  const teamIds = Array.from(new Set([...family.teamIds, ...byName.map((t) => t.id)]));
  const index = await getClubTeamIndex();
  const keyOf = (teamId: string) => (teamIds.includes(teamId) ? clubKey : index.get(teamId)?.clubKey ?? `team-${teamId}`);
  const [games, leagueFrom] = await Promise.all([loadClubGames(teamIds, keyOf), leagueEraStart()]);
  const league = leagueFrom == null ? [] : await loadLeagueGames(leagueFrom, keyOf);
  return { clubHe: family.nameHe, teamIds, games, leagueFrom, league };
}
