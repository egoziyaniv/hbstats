import { resolveCanonicalVenueId } from '@/lib/venue-identity';

export const HAPOEL_BEER_SHEVA_API_ID = 563;

type AttendedGame = {
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamApiId: number | null;
  awayTeamApiId: number | null;
  venueId?: string | null;
};

export function buildMatchdaySummary(games: AttendedGame[]) {
  const summary = { attended: games.length, completed: 0, hbsGames: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, homeGames: 0, awayGames: 0, venues: 0 };
  const venues = new Set<string>();
  for (const game of games) {
    if (game.status !== 'COMPLETED' || !Number.isInteger(game.homeScore) || !Number.isInteger(game.awayScore) || game.homeScore! < 0 || game.awayScore! < 0) continue;
    summary.completed++;
    const isHome = game.homeTeamApiId === HAPOEL_BEER_SHEVA_API_ID;
    const isAway = game.awayTeamApiId === HAPOEL_BEER_SHEVA_API_ID;
    if (!isHome && !isAway) continue;
    summary.hbsGames++;
    const goalsFor = isHome ? game.homeScore : game.awayScore;
    const goalsAgainst = isHome ? game.awayScore : game.homeScore;
    summary.goalsFor += goalsFor!;
    summary.goalsAgainst += goalsAgainst!;
    if (isHome) summary.homeGames++;
    else summary.awayGames++;
    if (game.venueId) venues.add(resolveCanonicalVenueId(game.venueId));
    if (goalsFor > goalsAgainst) summary.wins++;
    else if (goalsFor < goalsAgainst) summary.losses++;
    else summary.draws++;
  }
  summary.venues = venues.size;
  return summary;
}
