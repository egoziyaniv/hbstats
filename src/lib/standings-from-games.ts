import type { Prisma } from '@prisma/client';
import { sortStandings } from './standings';

type TeamName = {
  id: string;
  nameHe: string;
  nameEn: string;
  logoUrl: string | null;
};

type GameForStandings = {
  homeTeamId: string;
  awayTeamId: string;
  homeScore: number | null;
  awayScore: number | null;
  roundNameEn?: string | null;
};

type DerivedStandingRow = {
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
  pointsAdjustmentNoteHe: string | null;
  teamId: string;
  team: TeamName;
  groupNameEn?: string;
};

type TeamAdjustment = {
  teamId: string;
  pointsAdjustment: number;
  pointsAdjustmentNoteHe: string | null;
};

/**
 * Build a league table directly from completed games. Inspects each game's
 * `roundNameEn` and, when 'Championship Group' / 'Relegation Group' rounds
 * are present, splits teams into the two playoff groups — championship teams
 * fill positions 1..N regardless of point totals (Israeli league convention).
 *
 * Used by /standings and /statistics when the stored Standing rows are
 * end-of-regular-season snapshots that don't carry the playoff group info.
 *
 * `adjustments` carries per-team point deductions (e.g. Hapoel Tel Aviv -2,
 * Ironi Tiberia -8 in 2025) that survive the regular→playoff transition.
 */
export function buildStandingsFromGames(
  teams: TeamName[],
  games: GameForStandings[],
  adjustments: TeamAdjustment[] = [],
) {
  const rows = new Map<string, DerivedStandingRow>();
  const teamPlayoffGroup = new Map<string, 'championship' | 'relegation' | null>();
  const adjByTeam = new Map(adjustments.map((a) => [a.teamId, a]));

  for (const team of teams) {
    const adj = adjByTeam.get(team.id);
    rows.set(team.id, {
      id: `derived-${team.id}`,
      position: 999,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      points: 0,
      pointsAdjustment: adj?.pointsAdjustment ?? 0,
      pointsAdjustmentNoteHe: adj?.pointsAdjustmentNoteHe ?? null,
      teamId: team.id,
      team,
    });
    teamPlayoffGroup.set(team.id, null);
  }

  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) continue;
    const home = rows.get(game.homeTeamId);
    const away = rows.get(game.awayTeamId);
    if (!home || !away) continue;

    const round = game.roundNameEn || '';
    if (/championship/i.test(round)) {
      teamPlayoffGroup.set(game.homeTeamId, 'championship');
      teamPlayoffGroup.set(game.awayTeamId, 'championship');
    } else if (/relegation/i.test(round)) {
      teamPlayoffGroup.set(game.homeTeamId, 'relegation');
      teamPlayoffGroup.set(game.awayTeamId, 'relegation');
    }

    home.played += 1;
    away.played += 1;
    home.goalsFor += game.homeScore;
    home.goalsAgainst += game.awayScore;
    away.goalsFor += game.awayScore;
    away.goalsAgainst += game.homeScore;

    if (game.homeScore > game.awayScore) {
      home.wins += 1;
      home.points += 3;
      away.losses += 1;
      continue;
    }
    if (game.homeScore < game.awayScore) {
      away.wins += 1;
      away.points += 3;
      home.losses += 1;
      continue;
    }
    home.draws += 1;
    away.draws += 1;
    home.points += 1;
    away.points += 1;
  }

  const allRows = [...rows.values()];
  const champRows = allRows.filter((r) => teamPlayoffGroup.get(r.teamId) === 'championship');
  const relRows = allRows.filter((r) => teamPlayoffGroup.get(r.teamId) === 'relegation');

  if (champRows.length > 0 && relRows.length > 0) {
    // Teams not yet assigned a playoff group (e.g. their first split game is
    // postponed) must NOT vanish from the table — append them after the groups.
    const groupedIds = new Set([...champRows, ...relRows].map((r) => r.teamId));
    const ungroupedRows = allRows.filter((r) => !groupedIds.has(r.teamId));
    // Each group is sorted separately, so sortStandings' displayPosition restarts
    // at 1 per group. Overwrite BOTH position and displayPosition with the
    // continuous rank so consumers keyed on either (mobile uses displayPosition)
    // don't show duplicate position numbers across groups.
    let pos = 1;
    const renumber = (r: any) => { const p = pos++; return { ...r, position: p, displayPosition: p }; };
    return [
      ...sortStandings(champRows.map((r) => ({ ...r, groupNameEn: 'Championship Group' }))).map(renumber),
      ...sortStandings(relRows.map((r) => ({ ...r, groupNameEn: 'Relegation Group' }))).map(renumber),
      ...sortStandings(ungroupedRows).map(renumber),
    ];
  }

  let fallbackPosition = 1;
  return sortStandings(allRows.map((row) => ({ ...row, position: fallbackPosition++ })));
}

export type StandingsScope = 'home' | 'away';

/**
 * Build a single flat table counting only each team's home legs (scope='home')
 * or away legs (scope='away'). Used by the mobile standings בית/חוץ toggle.
 * Point deductions deliberately NOT applied — they belong to the overall table
 * (Transfermarkt convention). No playoff-group splitting in scoped views.
 */
export function buildScopedTable(
  teams: TeamName[],
  games: GameForStandings[],
  scope: StandingsScope,
) {
  const rows = new Map<string, DerivedStandingRow>();
  for (const team of teams) {
    rows.set(team.id, {
      id: `scoped-${team.id}`,
      position: 999,
      played: 0, wins: 0, draws: 0, losses: 0,
      goalsFor: 0, goalsAgainst: 0, points: 0,
      pointsAdjustment: 0, pointsAdjustmentNoteHe: null,
      teamId: team.id, team,
    });
  }

  for (const game of games) {
    if (game.homeScore === null || game.awayScore === null) continue;
    const teamId = scope === 'home' ? game.homeTeamId : game.awayTeamId;
    const row = rows.get(teamId);
    if (!row) continue;
    const gf = scope === 'home' ? game.homeScore : game.awayScore;
    const ga = scope === 'home' ? game.awayScore : game.homeScore;
    row.played += 1;
    row.goalsFor += gf;
    row.goalsAgainst += ga;
    if (gf > ga) { row.wins += 1; row.points += 3; }
    else if (gf < ga) { row.losses += 1; }
    else { row.draws += 1; row.points += 1; }
  }

  let pos = 1;
  return sortStandings([...rows.values()]).map((r) => {
    const p = pos++;
    return { ...r, position: p, displayPosition: p };
  });
}

/**
 * Returns true if the stored Standing.played values are behind the highest
 * round number visible in completed games — indicating playoff games have
 * been played but the Standing snapshot is end-of-regular-season.
 */
export function shouldDeriveStandings(
  storedStandings: Array<{ played: number; groupNameEn?: string | null }>,
  completedGames: Array<{ roundNameEn?: string | null }>,
): boolean {
  if (storedStandings.length === 0) return true;
  const hasPlayoffGroupInfo = storedStandings.some(
    (s) => /championship/i.test(s.groupNameEn || '') || /relegation/i.test(s.groupNameEn || ''),
  );
  if (hasPlayoffGroupInfo) return false; // stored standings already reflect playoff
  const maxRoundInStandings = Math.max(0, ...storedStandings.map((s) => s.played));
  const maxRoundInGames = completedGames.reduce((max, g) => {
    const m = g.roundNameEn?.match(/(\d+)\s*$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  return maxRoundInGames > maxRoundInStandings;
}

/**
 * Recompute the stored Standing rows for a (season, competition) from its
 * completed games — call after an admin edits a game score/status so the table
 * stays consistent instead of drifting. Runs inside the caller's transaction.
 *
 * Safety guards (this writes to authoritative data):
 *  - Only updates teams that ALREADY have a Standing row — never invents rows.
 *  - Never reduces a row's `played` below its stored value, so a season whose
 *    games are only partially imported (but whose standings were imported whole
 *    from IFA/API) is left untouched rather than corrupted by a low game count.
 *  - Preserves pointsAdjustment / groupName. Recomputes `position` only when the
 *    table has no playoff groups (group ordering is non-trivial and rarely edited).
 *
 * Returns the number of rows updated.
 */
export async function recomputeStoredStandings(
  tx: Prisma.TransactionClient,
  seasonId: string,
  competitionId: string | null,
): Promise<number> {
  if (!competitionId) return 0;
  const existing = await tx.standing.findMany({ where: { seasonId, competitionId } });
  if (existing.length === 0) return 0;

  const games = await tx.game.findMany({
    where: { seasonId, competitionId, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null } },
    select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true },
  });

  type Tally = { played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number; points: number };
  const tally = new Map<string, Tally>();
  for (const row of existing) {
    tally.set(row.teamId, { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, points: 0 });
  }

  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) continue;
    const h = tally.get(g.homeTeamId);
    const a = tally.get(g.awayTeamId);
    if (!h || !a) continue; // game involves a team not in this table (cup cross-over) — skip
    h.played++; a.played++;
    h.goalsFor += g.homeScore; h.goalsAgainst += g.awayScore;
    a.goalsFor += g.awayScore; a.goalsAgainst += g.homeScore;
    if (g.homeScore > g.awayScore) { h.wins++; h.points += 3; a.losses++; }
    else if (g.homeScore < g.awayScore) { a.wins++; a.points += 3; h.losses++; }
    else { h.draws++; a.draws++; h.points++; a.points++; }
  }

  const hasGroups = existing.some((s) => /championship|relegation/i.test(s.groupNameEn || ''));
  const passesGuard = (row: (typeof existing)[number]) => {
    const d = tally.get(row.teamId);
    return !!d && d.played >= row.played;
  };

  // Recompute positions only in the no-playoff-group case (safe + common).
  const positionByTeam = new Map<string, number>();
  if (!hasGroups) {
    const sorted = sortStandings(
      existing.map((row) => {
        const d = tally.get(row.teamId)!;
        const use = passesGuard(row) ? d : row; // keep stored totals for guarded-out rows
        return {
          id: row.id, position: row.position,
          played: use.played, wins: use.wins, draws: use.draws, losses: use.losses,
          goalsFor: use.goalsFor, goalsAgainst: use.goalsAgainst, points: use.points,
          pointsAdjustment: row.pointsAdjustment, pointsAdjustmentNoteHe: row.pointsAdjustmentNoteHe,
          teamId: row.teamId,
        };
      }),
    );
    sorted.forEach((r) => positionByTeam.set(r.teamId, r.displayPosition));
  }

  let updated = 0;
  for (const row of existing) {
    if (!passesGuard(row)) continue;
    const d = tally.get(row.teamId)!;
    await tx.standing.update({
      where: { id: row.id },
      data: {
        played: d.played, wins: d.wins, draws: d.draws, losses: d.losses,
        goalsFor: d.goalsFor, goalsAgainst: d.goalsAgainst, points: d.points,
        ...(positionByTeam.has(row.teamId) ? { position: positionByTeam.get(row.teamId)! } : {}),
      },
    });
    updated++;
  }
  return updated;
}
