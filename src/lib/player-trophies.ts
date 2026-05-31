/**
 * player-trophies.ts — fetch PlayerTrophy rows for the canonical+linked
 * Player records, deduplicate by (league, season, placement), and group by
 * trophy type for the trophy cabinet UI.
 */
import prisma from '@/lib/prisma';

export interface TrophyGroup {
  leagueNameHe: string;
  countryHe: string | null;
  countryEn: string | null;
  wins: number;
  runnerUps: number;
  seasonsWon: string[];
}

export async function buildPlayerTrophies(playerId: string): Promise<TrophyGroup[]> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, canonicalPlayerId: true, apiFootballId: true },
  });
  if (!player) return [];
  const canonicalKey = player.canonicalPlayerId ?? player.id;

  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
    select: { id: true, apiFootballId: true },
  });
  const ids = linked.map((l) => l.id);
  const apiIds = linked.map((l) => l.apiFootballId).filter((v): v is number => typeof v === 'number');

  const rows = await prisma.playerTrophy.findMany({
    where: {
      OR: [
        ...(ids.length > 0 ? [{ playerId: { in: ids } }] : []),
        ...(apiIds.length > 0 ? [{ apiFootballPlayerId: { in: apiIds } }] : []),
      ],
    },
    select: {
      leagueNameHe: true, leagueNameEn: true, countryHe: true, countryEn: true,
      seasonLabel: true, placeHe: true, placeEn: true,
    },
  });

  const groups = new Map<string, TrophyGroup>();
  for (const r of rows) {
    const league = r.leagueNameHe || r.leagueNameEn;
    const key = `${league}|${r.countryEn || ''}`;
    let g = groups.get(key);
    if (!g) {
      g = { leagueNameHe: league, countryHe: r.countryHe, countryEn: r.countryEn, wins: 0, runnerUps: 0, seasonsWon: [] };
      groups.set(key, g);
    }
    const placeText = (r.placeHe || r.placeEn || '').toLowerCase();
    const isWinner = placeText.includes('winner') || placeText.includes('1') || placeText.includes('זוכ');
    if (isWinner) {
      g.wins++;
      if (r.seasonLabel) g.seasonsWon.push(r.seasonLabel);
    } else if (placeText.includes('runner') || placeText.includes('2nd') || placeText.includes('סגן')) {
      g.runnerUps++;
    }
  }

  return Array.from(groups.values()).sort((a, b) => (b.wins + b.runnerUps) - (a.wins + a.runnerUps));
}
