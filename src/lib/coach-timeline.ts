/**
 * coach-timeline.ts — build per-team coach tenures from GameLineupEntry rows
 * (role=COACH). Returns each distinct coach with the date range and W/D/L
 * record at this team. Sorted newest-first.
 */
import prisma from '@/lib/prisma';

export interface CoachTenure {
  name: string;
  firstMatch: string;
  lastMatch: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  /** ISO dates from TeamCoachAssignment when available — more authoritative. */
  exactStart: string | null;
  exactEnd: string | null;
}

export async function buildCoachTimeline(teamId: string): Promise<CoachTenure[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { nameEn: true, nameHe: true },
  });
  if (!team) return [];

  // Aggregate match-level coach entries across ALL team records with this nameEn
  // (one team record per season — we want the full multi-season history).
  const rows = await prisma.$queryRaw<Array<{
    coach: string;
    matches: number;
    first_match: Date;
    last_match: Date;
    wins: number;
    draws: number;
    losses: number;
  }>>`
    WITH match_coach AS (
      SELECT
        gle."participantName" AS coach,
        g."dateTime",
        g."homeScore", g."awayScore",
        g."homeTeamId", g."awayTeamId",
        gle."teamId"
      FROM "game_lineup_entries" gle
      JOIN "games" g ON g.id = gle."gameId"
      JOIN "teams" t ON t.id = gle."teamId" AND t."nameEn" = ${team.nameEn}
      WHERE gle.role = 'COACH'
        AND gle."participantName" IS NOT NULL
        AND g."homeScore" IS NOT NULL
        AND g."awayScore" IS NOT NULL
    )
    SELECT
      coach,
      COUNT(*)::int AS matches,
      MIN("dateTime") AS first_match,
      MAX("dateTime") AS last_match,
      SUM(CASE
        WHEN ("homeTeamId" = "teamId" AND "homeScore" > "awayScore")
          OR ("awayTeamId" = "teamId" AND "awayScore" > "homeScore")
        THEN 1 ELSE 0 END)::int AS wins,
      SUM(CASE WHEN "homeScore" = "awayScore" THEN 1 ELSE 0 END)::int AS draws,
      SUM(CASE
        WHEN ("homeTeamId" = "teamId" AND "homeScore" < "awayScore")
          OR ("awayTeamId" = "teamId" AND "awayScore" < "homeScore")
        THEN 1 ELSE 0 END)::int AS losses
    FROM match_coach
    GROUP BY coach
    ORDER BY MAX("dateTime") DESC
  `;

  // Optional enrichment: TeamCoachAssignment has authoritative dates from API.
  const assignments = await prisma.teamCoachAssignment.findMany({
    where: { team: { nameEn: team.nameEn } },
    select: { coachNameEn: true, startDate: true, endDate: true },
  });
  const assignmentByName = new Map<string, { start: Date | null; end: Date | null }>();
  for (const a of assignments) {
    // Normalize names: API sometimes returns "R. Kozuch" while IFA returns "Ran Kozuch".
    const variants = new Set<string>([a.coachNameEn]);
    const parts = a.coachNameEn.split(/\s+/);
    if (parts.length >= 2) variants.add(`${parts[0][0]}. ${parts[parts.length - 1]}`);
    for (const v of variants) {
      const existing = assignmentByName.get(v);
      if (!existing || (a.startDate && (!existing.start || a.startDate < existing.start))) {
        assignmentByName.set(v, { start: a.startDate, end: a.endDate });
      }
    }
  }

  return rows.map((r) => {
    const exact = assignmentByName.get(r.coach);
    return {
      name: r.coach,
      firstMatch: r.first_match.toISOString().slice(0, 10),
      lastMatch: r.last_match.toISOString().slice(0, 10),
      matches: r.matches,
      wins: r.wins,
      draws: r.draws,
      losses: r.losses,
      winPct: r.matches > 0 ? Math.round((r.wins / r.matches) * 100) : 0,
      exactStart: exact?.start ? exact.start.toISOString().slice(0, 10) : null,
      exactEnd: exact?.end ? exact.end.toISOString().slice(0, 10) : null,
    };
  });
}
