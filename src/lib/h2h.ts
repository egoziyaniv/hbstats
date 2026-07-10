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

// ---------------------------------------------------------------------------
// buildFullH2H — full rivalry aggregation for the /history/h2h pages: the
// complete meeting history (no cap) plus per-competition split, home/away
// venue split, and "biggest win" callouts for each side.
// ---------------------------------------------------------------------------

export interface H2HCompetitionSplit {
  competitionNameHe: string;
  games: number; winsA: number; draws: number; winsB: number;
}
export interface H2HVenueSplit { games: number; winsA: number; draws: number; winsB: number }
export interface FullH2H {
  teamAName: string;
  teamBName: string;
  totals: { games: number; winsA: number; draws: number; winsB: number; goalsA: number; goalsB: number };
  byCompetition: H2HCompetitionSplit[];
  atAHome: H2HVenueSplit;
  atBHome: H2HVenueSplit;
  biggestAWin: { gameId: string; label: string; year: number } | null;
  biggestBWin: { gameId: string; label: string; year: number } | null;
  meetings: H2HMeeting[]; // FULL list, newest first (reuse the existing H2HMeeting type)
}

export async function buildFullH2H(teamAId: string, teamBId: string): Promise<FullH2H | null> {
  // Resolve both club families exactly like buildH2H does (nameHe grouping).
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

  // Explicit JS-level sort (newest first) — don't rely solely on the DB
  // ORDER BY, so meetings/biggest-win ordering is deterministic regardless
  // of how the rows arrive.
  const sortedGames = [...games].sort((x, y) => y.dateTime.getTime() - x.dateTime.getTime());

  let winsA = 0, draws = 0, winsB = 0, goalsA = 0, goalsB = 0;
  const meetings: H2HMeeting[] = [];
  const compMap = new Map<string, H2HCompetitionSplit>();
  const atAHome: H2HVenueSplit = { games: 0, winsA: 0, draws: 0, winsB: 0 };
  const atBHome: H2HVenueSplit = { games: 0, winsA: 0, draws: 0, winsB: 0 };

  let biggestAWin: { gameId: string; label: string; year: number } | null = null;
  let biggestBWin: { gameId: string; label: string; year: number } | null = null;
  let bestAMargin = -1, bestATotalGoals = -1, bestAYear = Infinity;
  let bestBMargin = -1, bestBTotalGoals = -1, bestBYear = Infinity;

  for (const g of sortedGames) {
    const aIsHome = aIds.includes(g.homeTeamId);
    const aScore = aIsHome ? g.homeScore! : g.awayScore!;
    const bScore = aIsHome ? g.awayScore! : g.homeScore!;
    goalsA += aScore;
    goalsB += bScore;

    let resultFromA: 'W' | 'D' | 'L';
    if (aScore > bScore) { winsA++; resultFromA = 'W'; }
    else if (aScore < bScore) { winsB++; resultFromA = 'L'; }
    else { draws++; resultFromA = 'D'; }

    // Per-competition split — keyed on nameHe, grouped in insertion (games)
    // order; sorted by games desc at the end.
    const compName = g.competition?.nameHe || 'לא ידוע';
    let split = compMap.get(compName);
    if (!split) {
      split = { competitionNameHe: compName, games: 0, winsA: 0, draws: 0, winsB: 0 };
      compMap.set(compName, split);
    }
    split.games++;
    if (resultFromA === 'W') split.winsA++; else if (resultFromA === 'D') split.draws++; else split.winsB++;

    // Venue split — no neutral venues in this data model: A-side home vs. B-side home.
    const venue = aIsHome ? atAHome : atBHome;
    venue.games++;
    if (resultFromA === 'W') venue.winsA++; else if (resultFromA === 'D') venue.draws++; else venue.winsB++;

    // Biggest win per side — max margin; ties → more total goals, then earlier year.
    const year = g.dateTime.getFullYear();
    const margin = aScore - bScore;
    const totalGoals = aScore + bScore;
    if (margin > 0) {
      const better = margin > bestAMargin
        || (margin === bestAMargin && totalGoals > bestATotalGoals)
        || (margin === bestAMargin && totalGoals === bestATotalGoals && year < bestAYear);
      if (better) {
        bestAMargin = margin; bestATotalGoals = totalGoals; bestAYear = year;
        biggestAWin = { gameId: g.id, label: `${aScore}–${bScore} (${year})`, year };
      }
    } else if (margin < 0) {
      const bMargin = -margin;
      const better = bMargin > bestBMargin
        || (bMargin === bestBMargin && totalGoals > bestBTotalGoals)
        || (bMargin === bestBMargin && totalGoals === bestBTotalGoals && year < bestBYear);
      if (better) {
        bestBMargin = bMargin; bestBTotalGoals = totalGoals; bestBYear = year;
        biggestBWin = { gameId: g.id, label: `${bScore}–${aScore} (${year})`, year };
      }
    }

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

  const byCompetition = Array.from(compMap.values()).sort((x, y) => y.games - x.games);

  return {
    teamAName: teamA.nameHe || teamA.nameEn,
    teamBName: teamB.nameHe || teamB.nameEn,
    totals: { games: sortedGames.length, winsA, draws, winsB, goalsA, goalsB },
    byCompetition,
    atAHome,
    atBHome,
    biggestAWin,
    biggestBWin,
    meetings,
  };
}
