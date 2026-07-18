import { prisma } from '@/lib/prisma';
import { getClubFamily, getClubTeamIndex } from '@/lib/history/club-identity';

export interface ScorerRow { playerId: string | null; nameHe: string; goals: number }

export async function clubAllTimeTopScorers(clubKey: string, take: number): Promise<ScorerRow[]> {
  const fam = await getClubFamily(clubKey);
  if (!fam) return [];
  const grouped = await prisma.competitionLeaderboardEntry.groupBy({
    by: ['playerId', 'playerNameHe'],
    where: { category: 'TOP_SCORERS', teamId: { in: fam.teamIds } },
    _sum: { value: true },
  });
  return grouped
    .map((g) => ({ playerId: g.playerId, nameHe: g.playerNameHe ?? 'לא ידוע', goals: g._sum.value ?? 0 }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, take);
}

export async function leagueAllTimeTopScorers(take: number): Promise<ScorerRow[]> {
  const grouped = await prisma.competitionLeaderboardEntry.groupBy({
    by: ['playerId', 'playerNameHe'],
    where: { category: 'TOP_SCORERS' },
    _sum: { value: true },
  });
  return grouped
    .map((g) => ({ playerId: g.playerId, nameHe: g.playerNameHe ?? 'לא ידוע', goals: g._sum.value ?? 0 }))
    .sort((a, b) => b.goals - a.goals)
    .slice(0, take);
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
