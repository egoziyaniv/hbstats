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
    home_team_id: string;
    away_team_id: string;
  }>>`
    SELECT
      ge.minute AS minute,
      ge.team AS event_team,
      g."homeTeamId" AS home_team_id,
      g."awayTeamId" AS away_team_id
    FROM "game_events" ge
    JOIN "games" g ON g.id = ge."gameId"
    WHERE ge.type IN ('GOAL', 'PENALTY_GOAL')
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
    // Did this event's team match ours? Compare by Hebrew name fragment OR by
    // game side. We rely on the same team string the event was tagged with,
    // falling back to the home/away comparison via the game.
    const ourName = team.nameHe || team.nameEn;
    if (r.event_team && (r.event_team === ourName || r.event_team.includes(ourName) || ourName.includes(r.event_team))) {
      buckets[idx].scored++;
    } else {
      buckets[idx].conceded++;
    }
  }

  return buckets;
}
