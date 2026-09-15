export const HAPOEL_BEER_SHEVA_API_ID = 563;

type HomepageTeam = {
  id: string;
  apiFootballId: number | null;
};

type HomepageGame = {
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
};

export function resolveHomeClubId(
  queryTeamIds: string[],
  favouriteTeamIds: string[],
  teams: HomepageTeam[],
): string | null {
  const availableIds = new Set(teams.map((team) => team.id));

  return (
    queryTeamIds.find((teamId) => availableIds.has(teamId)) ??
    favouriteTeamIds.find((teamId) => availableIds.has(teamId)) ??
    teams.find((team) => team.apiFootballId === HAPOEL_BEER_SHEVA_API_ID)?.id ??
    null
  );
}

export function buildClubForm(teamId: string, games: HomepageGame[]): Array<'W' | 'D' | 'L'> {
  return games.flatMap((game) => {
    if (
      game.status !== 'COMPLETED' ||
      !Number.isInteger(game.homeScore) ||
      !Number.isInteger(game.awayScore)
    ) {
      return [];
    }

    const score =
      game.homeTeamId === teamId
        ? [game.homeScore, game.awayScore]
        : game.awayTeamId === teamId
          ? [game.awayScore, game.homeScore]
          : null;
    if (!score) return [];
    return [score[0] > score[1] ? 'W' : score[0] < score[1] ? 'L' : 'D'];
  });
}
