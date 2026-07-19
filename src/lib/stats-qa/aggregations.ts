import { prisma } from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';

export interface ScorerRow { playerId: string | null; nameHe: string; goals: number }

// One TOP_SCORERS leaderboard row, with enough player context to fold the same
// real person's per-season rows together across seasons.
interface ScorerEntry {
  playerId: string | null;
  playerNameHe: string | null;
  value: number;
  player: { canonicalPlayerId: string | null; nameHe: string | null; canonicalPlayer: { nameHe: string | null } | null } | null;
}

const SCORER_SELECT = {
  playerId: true,
  playerNameHe: true,
  value: true,
  player: { select: { canonicalPlayerId: true, nameHe: true, canonicalPlayer: { select: { nameHe: true } } } },
} as const;

// Group season leaderboard rows by CANONICAL player so a legend whose seasons
// live under different Player rows (cross-season duplicates) counts once. The
// canonical key is the player's canonicalPlayerId (its merged "head"), falling
// back to its own id, then to the display name for rows with no linked player.
function aggregateScorers(entries: ScorerEntry[], take: number): ScorerRow[] {
  const groups = new Map<string, { goals: number; linkId: string | null; names: Map<string, number> }>();
  for (const e of entries) {
    const canonId = e.player?.canonicalPlayerId ?? e.playerId ?? null;
    const key = canonId ?? `name:${e.playerNameHe ?? 'לא ידוע'}`;
    const displayName = e.player?.canonicalPlayer?.nameHe ?? e.player?.nameHe ?? e.playerNameHe ?? 'לא ידוע';
    const g = groups.get(key) ?? { goals: 0, linkId: canonId, names: new Map() };
    g.goals += e.value ?? 0;
    if (!g.linkId && canonId) g.linkId = canonId;
    g.names.set(displayName, (g.names.get(displayName) ?? 0) + 1);
    groups.set(key, g);
  }
  return [...groups.values()]
    .map((g) => ({
      playerId: g.linkId,
      nameHe: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'לא ידוע',
      goals: g.goals,
    }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, take);
}

// Club all-time top scorers from actual GOAL events (2006+), NOT the season
// TOP_SCORERS leaderboard: that leaderboard only lists players who cracked the
// LEAGUE-wide top-scorer table, so it's sparse per club and can't fold a
// name-only Walla row with a linked IFA row. Goal events are ~94% player-linked
// for top clubs and fold cleanly by canonical player, giving a true club total.
export async function clubAllTimeTopScorers(clubKey: string, take: number): Promise<ScorerRow[]> {
  const fam = await getClubFamily(clubKey);
  if (!fam) return [];
  const goals = await prisma.gameEvent.findMany({
    where: { type: { in: ['GOAL', 'PENALTY_GOAL'] }, teamId: { in: fam.teamIds }, playerId: { not: null } },
    select: { playerId: true, player: { select: { canonicalPlayerId: true, nameHe: true, canonicalPlayer: { select: { nameHe: true } } } } },
  });
  const groups = new Map<string, { goals: number; linkId: string; names: Map<string, number> }>();
  for (const g of goals) {
    const canonId = g.player?.canonicalPlayerId ?? g.playerId;
    if (!canonId) continue;
    const displayName = g.player?.canonicalPlayer?.nameHe ?? g.player?.nameHe ?? 'לא ידוע';
    const grp = groups.get(canonId) ?? { goals: 0, linkId: canonId, names: new Map() };
    grp.goals++;
    grp.names.set(displayName, (grp.names.get(displayName) ?? 0) + 1);
    groups.set(canonId, grp);
  }
  return [...groups.values()]
    .map((g) => ({ playerId: g.linkId, nameHe: [...g.names.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'לא ידוע', goals: g.goals }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, take);
}

// League all-time top scorers stay on the season TOP_SCORERS leaderboards:
// they span 2000-2026 (goal events only start 2006) and surface historic
// legends like Oded Mahnes that the events table can't. Folded by canonical
// player where linked, else by display name.
export async function leagueAllTimeTopScorers(take: number): Promise<ScorerRow[]> {
  const entries = await prisma.competitionLeaderboardEntry.findMany({
    where: { category: 'TOP_SCORERS' },
    select: SCORER_SELECT,
  });
  return aggregateScorers(entries, take);
}

export interface OpponentRow { clubKey: string; nameHe: string; games: number; wins: number; draws: number; losses: number }

export async function clubTopOpponents(clubKey: string, take: number): Promise<OpponentRow[]> {
  const fam = await getClubFamily(clubKey);
  if (!fam) return [];
  const index = await getClubTeamIndex();
  const games = await prisma.game.findMany({
    where: {
      status: 'COMPLETED',
      OR: [{ homeTeamId: { in: fam.teamIds } }, { awayTeamId: { in: fam.teamIds } }],
      homeScore: { not: null }, awayScore: { not: null },
    },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });
  const tally = new Map<string, OpponentRow>();
  for (const g of games) {
    const weAreHome = fam.teamIds.includes(g.homeTeamId);
    const oppId = weAreHome ? g.awayTeamId : g.homeTeamId;
    const oppFam = index.get(oppId);
    if (!oppFam || oppFam.clubKey === clubKey) continue;
    const us = weAreHome ? g.homeScore! : g.awayScore!;
    const them = weAreHome ? g.awayScore! : g.homeScore!;
    const row = tally.get(oppFam.clubKey) ?? { clubKey: oppFam.clubKey, nameHe: oppFam.nameHe, games: 0, wins: 0, draws: 0, losses: 0 };
    row.games++;
    if (us > them) row.wins++; else if (us === them) row.draws++; else row.losses++;
    tally.set(oppFam.clubKey, row);
  }
  return [...tally.values()].sort((a, b) => b.games - a.games).slice(0, take);
}

export interface RivalryRow { label: string; games: number; aKey: string; bKey: string }

export async function topRivalries(take: number): Promise<RivalryRow[]> {
  const index = await getClubTeamIndex();
  const games = await prisma.game.findMany({
    where: { status: 'COMPLETED' },
    select: { homeTeamId: true, awayTeamId: true },
  });
  const tally = new Map<string, RivalryRow>();
  for (const g of games) {
    const a = index.get(g.homeTeamId); const b = index.get(g.awayTeamId);
    if (!a || !b || a.clubKey === b.clubKey) continue;
    const [x, y] = [a, b].sort((m, n) => (m.clubKey < n.clubKey ? -1 : 1));
    const key = `${x.clubKey}|${y.clubKey}`;
    const row = tally.get(key) ?? { label: `${x.nameHe} — ${y.nameHe}`, games: 0, aKey: x.clubKey, bKey: y.clubKey };
    row.games++;
    tally.set(key, row);
  }
  return [...tally.values()].sort((a, b) => b.games - a.games).slice(0, take);
}
