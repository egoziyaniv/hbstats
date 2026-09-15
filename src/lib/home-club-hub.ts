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

type HomepageArchiveGame = {
  id: string;
  seasonId: string;
  status: string;
  homeTeamId: string;
  awayTeamId: string;
  dateTime: Date;
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

export function buildClubSeasonSnapshot(teamId: string, games: HomepageGame[]) {
  return games.reduce(
    (snapshot, game) => {
      if (
        game.status !== 'COMPLETED' ||
        !Number.isInteger(game.homeScore) ||
        !Number.isInteger(game.awayScore)
      ) {
        return snapshot;
      }
      const score =
        game.homeTeamId === teamId
          ? [game.homeScore, game.awayScore]
          : game.awayTeamId === teamId
            ? [game.awayScore, game.homeScore]
            : null;
      if (!score) return snapshot;
      snapshot.matches++;
      snapshot.goalsFor += score[0];
      snapshot.goalsAgainst += score[1];
      if (score[0] > score[1]) snapshot.wins++;
      else if (score[0] < score[1]) snapshot.losses++;
      else snapshot.draws++;
      return snapshot;
    },
    { matches: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 },
  );
}

export function buildClubTrend(teamId: string, games: HomepageGame[]) {
  let points = 0;
  const form = buildClubForm(teamId, games);

  return form.map((result, index) => {
    points += result === 'W' ? 3 : result === 'D' ? 1 : 0;
    return { match: index + 1, points };
  });
}

/**
 * Select a concrete, completed match from before the selected season for the
 * archive card. The caller supplies an already ordered list, so this remains a
 * pure selection rule and cannot invent an historical claim when data is thin.
 */
export function pickClubArchiveGame<T extends HomepageArchiveGame>(
  teamId: string,
  currentSeasonId: string,
  games: T[],
): T | null {
  return games.find(
    (game) =>
      game.seasonId !== currentSeasonId &&
      game.status === 'COMPLETED' &&
      (game.homeTeamId === teamId || game.awayTeamId === teamId),
  ) ?? null;
}
