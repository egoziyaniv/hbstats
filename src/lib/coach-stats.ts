/**
 * coach-stats.ts — cross-team, cross-season stats per coach.
 *
 * Uses the new Coach + CoachAlias model: we pull every GameLineupEntry with
 * role=COACH whose participantName is an alias of a Coach row, then aggregate
 * matches/W-D-L/Pts per coach. The "per-team-season" breakdown drives the
 * coach profile page; the league-wide ranking aggregates further.
 */
import prisma from '@/lib/prisma';

export interface CoachAggregate {
  coachId: string;
  nameEn: string;
  nameHe: string | null;
  displayName: string;
  photoUrl: string | null;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  pointsPerGame: number;
}

export interface CoachTeamSeasonRow {
  teamId: string;
  teamName: string;
  teamLogo: string | null;
  seasonId: string;
  seasonName: string;
  year: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  pointsPerGame: number;
}

async function loadCoachLookup(opts: { coachId?: string } = {}): Promise<{
  aliasToCoach: Map<string, { coachId: string; nameEn: string; nameHe: string | null; photoUrl: string | null }>;
}> {
  const aliases = await prisma.coachAlias.findMany({
    where: opts.coachId ? { coachId: opts.coachId } : undefined,
    include: { coach: { select: { id: true, nameEn: true, nameHe: true, photoUrl: true } } },
  });
  const aliasToCoach = new Map<string, { coachId: string; nameEn: string; nameHe: string | null; photoUrl: string | null }>();
  for (const a of aliases) {
    aliasToCoach.set(a.alias, {
      coachId: a.coach.id,
      nameEn: a.coach.nameEn,
      nameHe: a.coach.nameHe,
      photoUrl: a.coach.photoUrl,
    });
  }
  return { aliasToCoach };
}

/**
 * League-wide ranking — one row per coach with totals across every team they
 * ever coached. Filters out coaches below `minMatches`.
 */
export async function buildCoachLeagueRanking(minMatches = 30): Promise<CoachAggregate[]> {
  const { aliasToCoach } = await loadCoachLookup();
  const rows = await prisma.$queryRaw<Array<{
    participant_name: string;
    home_score: number;
    away_score: number;
    home_team_id: string;
    away_team_id: string;
    team_id: string;
  }>>`
    SELECT
      gle."participantName" AS participant_name,
      g."homeScore" AS home_score,
      g."awayScore" AS away_score,
      g."homeTeamId" AS home_team_id,
      g."awayTeamId" AS away_team_id,
      gle."teamId" AS team_id
    FROM "game_lineup_entries" gle
    JOIN "games" g ON g.id = gle."gameId"
    WHERE gle.role = 'COACH'
      AND gle."participantName" IS NOT NULL
      AND g."homeScore" IS NOT NULL
      AND g."awayScore" IS NOT NULL
  `;

  const byCoach = new Map<string, CoachAggregate>();
  for (const r of rows) {
    const link = aliasToCoach.get(r.participant_name);
    if (!link) continue;
    let agg = byCoach.get(link.coachId);
    if (!agg) {
      agg = {
        coachId: link.coachId,
        nameEn: link.nameEn,
        nameHe: link.nameHe,
        displayName: link.nameHe || link.nameEn,
        photoUrl: link.photoUrl,
        matches: 0, wins: 0, draws: 0, losses: 0, winPct: 0, pointsPerGame: 0,
      };
      byCoach.set(link.coachId, agg);
    }
    agg.matches++;
    const isHome = r.home_team_id === r.team_id;
    const our = isHome ? r.home_score : r.away_score;
    const their = isHome ? r.away_score : r.home_score;
    if (our > their) agg.wins++;
    else if (our < their) agg.losses++;
    else agg.draws++;
  }

  const result: CoachAggregate[] = [];
  for (const agg of byCoach.values()) {
    if (agg.matches < minMatches) continue;
    agg.winPct = Math.round((agg.wins / agg.matches) * 100);
    agg.pointsPerGame = Math.round(((agg.wins * 3 + agg.draws) / agg.matches) * 10) / 10;
    result.push(agg);
  }
  result.sort((a, b) => b.pointsPerGame - a.pointsPerGame || b.matches - a.matches);
  return result;
}

/**
 * Per-coach team/season breakdown — for the coach profile page.
 */
export async function buildCoachProfile(coachId: string): Promise<{
  coach: CoachAggregate | null;
  tenures: CoachTeamSeasonRow[];
}> {
  const { aliasToCoach } = await loadCoachLookup({ coachId });
  if (aliasToCoach.size === 0) return { coach: null, tenures: [] };

  const rows = await prisma.$queryRaw<Array<{
    season_id: string;
    season_name: string;
    season_year: number;
    team_id: string;
    team_name_he: string;
    team_name_en: string;
    team_logo: string | null;
    home_score: number;
    away_score: number;
    home_team_id: string;
    away_team_id: string;
    participant_name: string;
  }>>`
    SELECT
      g."seasonId" AS season_id,
      s.name AS season_name,
      s.year AS season_year,
      gle."teamId" AS team_id,
      t."nameHe" AS team_name_he,
      t."nameEn" AS team_name_en,
      t."logoUrl" AS team_logo,
      g."homeScore" AS home_score,
      g."awayScore" AS away_score,
      g."homeTeamId" AS home_team_id,
      g."awayTeamId" AS away_team_id,
      gle."participantName" AS participant_name
    FROM "game_lineup_entries" gle
    JOIN "games" g ON g.id = gle."gameId"
    JOIN "seasons" s ON s.id = g."seasonId"
    JOIN "teams" t ON t.id = gle."teamId"
    WHERE gle.role = 'COACH'
      AND gle."participantName" IS NOT NULL
      AND g."homeScore" IS NOT NULL
      AND g."awayScore" IS NOT NULL
  `;

  // Bucket by (teamId, seasonId)
  type Bucket = CoachTeamSeasonRow;
  const buckets = new Map<string, Bucket>();
  const aggregate: CoachAggregate = {
    coachId,
    nameEn: '',
    nameHe: null,
    displayName: '',
    photoUrl: null,
    matches: 0, wins: 0, draws: 0, losses: 0, winPct: 0, pointsPerGame: 0,
  };

  for (const r of rows) {
    const link = aliasToCoach.get(r.participant_name);
    if (!link) continue;
    aggregate.nameEn = link.nameEn;
    aggregate.nameHe = link.nameHe;
    aggregate.displayName = link.nameHe || link.nameEn;
    aggregate.photoUrl = link.photoUrl;

    aggregate.matches++;
    const isHome = r.home_team_id === r.team_id;
    const our = isHome ? r.home_score : r.away_score;
    const their = isHome ? r.away_score : r.home_score;
    const result = our > their ? 'W' : our < their ? 'L' : 'D';
    if (result === 'W') aggregate.wins++;
    else if (result === 'L') aggregate.losses++;
    else aggregate.draws++;

    const key = `${r.team_id}|${r.season_id}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        teamId: r.team_id,
        teamName: r.team_name_he || r.team_name_en,
        teamLogo: r.team_logo,
        seasonId: r.season_id,
        seasonName: r.season_name,
        year: r.season_year,
        matches: 0, wins: 0, draws: 0, losses: 0, winPct: 0, pointsPerGame: 0,
      };
      buckets.set(key, b);
    }
    b.matches++;
    if (result === 'W') b.wins++;
    else if (result === 'L') b.losses++;
    else b.draws++;
  }

  if (aggregate.matches === 0) return { coach: null, tenures: [] };
  aggregate.winPct = Math.round((aggregate.wins / aggregate.matches) * 100);
  aggregate.pointsPerGame = Math.round(((aggregate.wins * 3 + aggregate.draws) / aggregate.matches) * 10) / 10;

  const tenures: CoachTeamSeasonRow[] = Array.from(buckets.values()).map((b) => ({
    ...b,
    winPct: b.matches > 0 ? Math.round((b.wins / b.matches) * 100) : 0,
    pointsPerGame: b.matches > 0 ? Math.round(((b.wins * 3 + b.draws) / b.matches) * 10) / 10 : 0,
  }));
  tenures.sort((a, b) => b.year - a.year);

  return { coach: aggregate, tenures };
}
