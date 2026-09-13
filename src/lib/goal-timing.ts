/**
 * goal-timing.ts — distribution of goals scored vs. conceded by 15-minute bucket
 * for a team-season. Drives the "Goal Timing" chart on the team page.
 */
import prisma from '@/lib/prisma';

export interface GoalTimingBucket {
  label: string;
  rangeStart: number;
  rangeEnd: number;
  scored: number;
  conceded: number;
}

const BUCKETS: Array<{ label: string; start: number; end: number }> = [
  { label: '0-15', start: 0, end: 15 },
  { label: '16-30', start: 16, end: 30 },
  { label: '31-45+', start: 31, end: 45 },
  { label: '46-60', start: 46, end: 60 },
  { label: '61-75', start: 61, end: 75 },
  { label: '76-90+', start: 76, end: 200 }, // captures stoppage
];

function bucketIndex(minute: number): number {
  for (let i = 0; i < BUCKETS.length; i++) {
    if (minute >= BUCKETS[i].start && minute <= BUCKETS[i].end) return i;
  }
  return BUCKETS.length - 1;
}

export async function buildGoalTimingForTeam(teamId: string): Promise<GoalTimingBucket[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, nameHe: true, nameEn: true, seasonId: true },
  });
  if (!team) return [];

  const rows = await prisma.$queryRaw<Array<{
    minute: number;
    event_team: string;
    team_id: string | null;
    type: string;
    home_name_he: string;
    home_name_en: string;
    away_name_he: string;
    away_name_en: string;
    home_team_id: string;
    away_team_id: string;
  }>>`
    SELECT
      ge.minute AS minute,
      ge.team AS event_team,
      ge."teamId" AS team_id,
      ge.type AS type,
      ht."nameHe" AS home_name_he, ht."nameEn" AS home_name_en,
      at."nameHe" AS away_name_he, at."nameEn" AS away_name_en,
      g."homeTeamId" AS home_team_id,
      g."awayTeamId" AS away_team_id
    FROM "game_events" ge
    JOIN "games" g ON g.id = ge."gameId"
    JOIN "teams" ht ON ht.id = g."homeTeamId"
    JOIN "teams" at ON at.id = g."awayTeamId"
    WHERE ge.type IN ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL')
      AND g."seasonId" = ${team.seasonId}
      AND (g."homeTeamId" = ${team.id} OR g."awayTeamId" = ${team.id})
  `;

  const buckets: GoalTimingBucket[] = BUCKETS.map((b) => ({
    label: b.label,
    rangeStart: b.start,
    rangeEnd: b.end,
    scored: 0,
    conceded: 0,
  }));

  for (const r of rows) {
    const idx = bucketIndex(r.minute);
    // Linked identity wins over labels supplied by a different source.
    let eventTeamId = r.team_id;
    if (!eventTeamId && r.event_team) {
      const label = r.event_team.trim().toLowerCase();
      const homeMatch = [r.home_name_he, r.home_name_en].some((n) => n?.trim().toLowerCase() === label);
      const awayMatch = [r.away_name_he, r.away_name_en].some((n) => n?.trim().toLowerCase() === label);
      if (homeMatch !== awayMatch) eventTeamId = homeMatch ? r.home_team_id : r.away_team_id;
    }
    if (eventTeamId !== r.home_team_id && eventTeamId !== r.away_team_id) continue;
    const scoringTeamId = r.type === 'OWN_GOAL'
      ? (eventTeamId === r.home_team_id ? r.away_team_id : r.home_team_id)
      : eventTeamId;
    if (scoringTeamId === team.id) buckets[idx].scored++;
    else buckets[idx].conceded++;
  }

  return buckets;
}
