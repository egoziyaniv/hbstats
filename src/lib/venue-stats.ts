// src/lib/venue-stats.ts — stats for a venue (Turner et al.): total games, Beer
// Sheva's record there, biggest BS win, attendance, and a game list. Every row
// carries its gameId so the UI links each stat to the match behind it.
import prisma from '@/lib/prisma';
import type { VenueStatsPayload, VenueGameRow } from '@shared/types/mobile-api';

const BS_AF = 563;

export async function buildVenueStats(venueId: string): Promise<VenueStatsPayload | null> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: { id: true, nameHe: true, nameEn: true, cityHe: true, cityEn: true, capacity: true, imageUrl: true },
  });
  if (!venue) return null;

  const bsTeams = await prisma.team.findMany({ where: { apiFootballId: BS_AF }, select: { id: true } });
  const bsIds = new Set(bsTeams.map((t) => t.id));

  const games = await prisma.game.findMany({
    where: { venueId, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null } },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true, homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true, nameEn: true } },
      fotmobData: { select: { matchInfo: true } },
    },
    orderBy: { dateTime: 'desc' },
  });

  const nm = (t: { nameHe: string | null; nameEn: string }) => t.nameHe || t.nameEn;

  let wins = 0, draws = 0, losses = 0, goalsFor = 0, goalsAgainst = 0;
  let biggestWin: VenueStatsPayload['biggestWin'] = null;
  let biggestMargin = 0;
  const atts: number[] = [];

  const gameRows: VenueGameRow[] = games.map((g) => {
    const attRaw = (g.fotmobData?.matchInfo as { attendance?: number | null } | null)?.attendance ?? null;
    const attendance = typeof attRaw === 'number' && attRaw > 0 ? attRaw : null;
    if (attendance) atts.push(attendance);

    const bsHome = bsIds.has(g.homeTeamId);
    const bsAway = bsIds.has(g.awayTeamId);
    if (bsHome || bsAway) {
      const bsGoals = (bsHome ? g.homeScore : g.awayScore) ?? 0;
      const oppGoals = (bsHome ? g.awayScore : g.homeScore) ?? 0;
      goalsFor += bsGoals;
      goalsAgainst += oppGoals;
      if (bsGoals > oppGoals) wins++;
      else if (bsGoals < oppGoals) losses++;
      else draws++;
      const margin = bsGoals - oppGoals;
      if (margin > biggestMargin) {
        biggestMargin = margin;
        biggestWin = {
          gameId: g.id,
          scoreHe: `${bsGoals}-${oppGoals}`,
          opponentHe: bsHome ? nm(g.awayTeam) : nm(g.homeTeam),
          dateISO: g.dateTime.toISOString(),
        };
      }
    }
    return {
      id: g.id,
      dateISO: g.dateTime.toISOString(),
      homeHe: nm(g.homeTeam),
      awayHe: nm(g.awayTeam),
      homeScore: g.homeScore,
      awayScore: g.awayScore,
      competitionHe: g.competition?.nameHe || g.competition?.nameEn || '',
      attendance,
    };
  });

  const bsPlayed = wins + draws + losses;
  const attendance = atts.length
    ? { avg: Math.round(atts.reduce((a, b) => a + b, 0) / atts.length), max: Math.max(...atts) }
    : null;

  return {
    venue: { id: venue.id, nameHe: venue.nameHe, cityHe: venue.cityHe, capacity: venue.capacity, imageUrl: venue.imageUrl },
    totalGames: games.length,
    bsRecord: bsPlayed > 0 ? { played: bsPlayed, wins, draws, losses, goalsFor, goalsAgainst } : null,
    biggestWin,
    attendance,
    games: gameRows.slice(0, 40),
  };
}
