import { sortStandings } from '@/lib/standings';

export type TeamChartGame = {
  id: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  round: number | null;
  dateTime: Date;
};

export type TeamChartTeam = {
  id: string;
  name: string;
};

export function filterCompletedGames<T extends TeamChartGame>(games: T[]) {
  return games
    .filter((game) => game.status === 'COMPLETED' && game.homeScore !== null && game.awayScore !== null)
    .sort((left, right) => +left.dateTime - +right.dateTime);
}

export function getRoundNumber(roundName: string | null | undefined) {
  const match = roundName?.match(/(\d+)\s*$/);
  return match ? Number(match[1]) : null;
}

type TableRow = {
  id: string;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  points: number;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: null;
  teamId: string;
};

function createRows(teams: TeamChartTeam[]) {
  return new Map<string, TableRow>(teams.map((team, index) => [team.id, {
    id: `chart-${team.id}`,
    position: index + 1,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    points: 0,
    pointsAdjustment: 0,
    pointsAdjustmentNoteHe: null,
    teamId: team.id,
  }]));
}

function applyGame(rows: Map<string, TableRow>, game: TeamChartGame) {
  if (game.homeScore === null || game.awayScore === null) return;
  const home = rows.get(game.homeTeamId);
  const away = rows.get(game.awayTeamId);
  if (!home || !away) return;

  home.played += 1;
  away.played += 1;
  home.goalsFor += game.homeScore;
  home.goalsAgainst += game.awayScore;
  away.goalsFor += game.awayScore;
  away.goalsAgainst += game.homeScore;

  if (game.homeScore > game.awayScore) {
    home.wins += 1;
    home.points += 3;
  } else if (game.homeScore < game.awayScore) {
    away.wins += 1;
    away.points += 3;
  } else {
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }
}

/** Builds a position-at-the-end-of-round series from finished league matches. */
export function buildLeaguePositionSeries(
  teams: TeamChartTeam[],
  games: TeamChartGame[],
  selectedTeamIds: string[],
) {
  const completed = filterCompletedGames(games).filter((game) => game.round !== null);
  const rounds = [...new Set(completed.map((game) => game.round!))].sort((a, b) => a - b);
  const selected = teams.filter((team) => selectedTeamIds.includes(team.id));
  const rows = createRows(teams);
  const output: Array<Record<string, string | number>> = [];

  for (const round of rounds) {
    for (const game of completed.filter((item) => item.round === round)) applyGame(rows, game);
    const ranked = sortStandings([...rows.values()]);
    const positions = new Map(ranked.map((row) => [row.teamId, row.displayPosition]));
    output.push({
      מחזור: String(round),
      ...Object.fromEntries(selected.map((team) => [team.name, positions.get(team.id) ?? teams.length])),
    });
  }

  return output;
}
