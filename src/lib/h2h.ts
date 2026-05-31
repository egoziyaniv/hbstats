/**
 * h2h.ts — head-to-head history between two teams across all seasons.
 *
 * Returns the last N completed meetings plus aggregate stats (W/D/L from team A's
 * perspective, goals tally). Drives the H2H deep-dive panel on the game page.
 */
import prisma from '@/lib/prisma';

export interface H2HMeeting {
  gameId: string;
  date: string;
  competitionNameHe: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeScore: number;
  awayScore: number;
  isAHome: boolean;
  resultFromA: 'W' | 'D' | 'L';
}

export interface H2HSummary {
  teamAId: string;
  teamBId: string;
  teamAName: string;
  teamBName: string;
  meetings: H2HMeeting[];
  totalGames: number;
  winsA: number;
  draws: number;
  winsB: number;
  goalsA: number;
  goalsB: number;
}

export async function buildH2H(teamAId: string, teamBId: string, limit = 10): Promise<H2HSummary | null> {
  // Resolve cross-season identity by name — many of our teams have multiple
  // Team rows (one per season). Aggregate by Hebrew name.
  const teams = await prisma.team.findMany({
    where: { id: { in: [teamAId, teamBId] } },
    select: { id: true, nameHe: true, nameEn: true },
  });
  const teamA = teams.find((t) => t.id === teamAId);
  const teamB = teams.find((t) => t.id === teamBId);
  if (!teamA || !teamB) return null;

  const aIds = await prisma.team.findMany({
    where: teamA.nameHe ? { nameHe: teamA.nameHe } : { nameEn: teamA.nameEn },
    select: { id: true },
  }).then((r) => r.map((x) => x.id));
  const bIds = await prisma.team.findMany({
    where: teamB.nameHe ? { nameHe: teamB.nameHe } : { nameEn: teamB.nameEn },
    select: { id: true },
  }).then((r) => r.map((x) => x.id));

  const games = await prisma.game.findMany({
    where: {
      status: 'COMPLETED',
      OR: [
        { homeTeamId: { in: aIds }, awayTeamId: { in: bIds } },
        { homeTeamId: { in: bIds }, awayTeamId: { in: aIds } },
      ],
      homeScore: { not: null },
      awayScore: { not: null },
    },
    include: {
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true } },
    },
    orderBy: { dateTime: 'desc' },
  });

  let winsA = 0, draws = 0, winsB = 0, goalsA = 0, goalsB = 0;
  const meetings: H2HMeeting[] = [];
  for (const g of games) {
    const aIsHome = aIds.includes(g.homeTeamId);
    const aScore = aIsHome ? g.homeScore! : g.awayScore!;
    const bScore = aIsHome ? g.awayScore! : g.homeScore!;
    goalsA += aScore;
    goalsB += bScore;
    let resultFromA: 'W' | 'D' | 'L';
    if (aScore > bScore) { winsA++; resultFromA = 'W'; }
    else if (aScore < bScore) { winsB++; resultFromA = 'L'; }
    else { draws++; resultFromA = 'D'; }
    if (meetings.length < limit) {
      meetings.push({
        gameId: g.id,
        date: g.dateTime.toISOString().slice(0, 10),
        competitionNameHe: g.competition?.nameHe || null,
        homeTeamName: g.homeTeam.nameHe || g.homeTeam.nameEn,
        awayTeamName: g.awayTeam.nameHe || g.awayTeam.nameEn,
        homeScore: g.homeScore!,
        awayScore: g.awayScore!,
        isAHome: aIsHome,
        resultFromA,
      });
    }
  }

  return {
    teamAId,
    teamBId,
    teamAName: teamA.nameHe || teamA.nameEn,
    teamBName: teamB.nameHe || teamB.nameEn,
    meetings,
    totalGames: games.length,
    winsA, draws, winsB, goalsA, goalsB,
  };
}
