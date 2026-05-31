/**
 * team-extras.ts — small aggregations powering supplementary team-page panels:
 * squad demographics (age + nationality breakdown), goal-type split (open
 * play vs. penalty vs. own goal), and xG progression across the season.
 */
import prisma from '@/lib/prisma';

export interface DemographicsResult {
  ageBuckets: Array<{ label: string; count: number }>;
  nationalityCounts: Array<{ name: string; count: number }>;
  avgAge: number | null;
}

export async function buildSquadDemographics(teamId: string): Promise<DemographicsResult> {
  const players = await prisma.player.findMany({
    where: { teamId },
    select: { birthDate: true, nationalityHe: true, nationalityEn: true },
  });

  const ranges: Array<{ label: string; min: number; max: number; count: number }> = [
    { label: 'עד 21', min: 0, max: 21, count: 0 },
    { label: '22-25', min: 22, max: 25, count: 0 },
    { label: '26-29', min: 26, max: 29, count: 0 },
    { label: '30-33', min: 30, max: 33, count: 0 },
    { label: '34+', min: 34, max: 100, count: 0 },
  ];
  const now = Date.now();
  const ages: number[] = [];
  const nationalityCount = new Map<string, number>();

  for (const p of players) {
    if (p.birthDate) {
      const age = Math.floor((now - p.birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25));
      ages.push(age);
      const bucket = ranges.find((r) => age >= r.min && age <= r.max);
      if (bucket) bucket.count++;
    }
    const nat = p.nationalityHe || p.nationalityEn;
    if (nat) nationalityCount.set(nat, (nationalityCount.get(nat) || 0) + 1);
  }

  const nationalityCounts = Array.from(nationalityCount.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
  const avgAge = ages.length > 0 ? Math.round((ages.reduce((s, a) => s + a, 0) / ages.length) * 10) / 10 : null;

  return {
    ageBuckets: ranges.map((r) => ({ label: r.label, count: r.count })),
    nationalityCounts,
    avgAge,
  };
}

export interface GoalTypeResult {
  openPlay: number;
  penalty: number;
  ownGoal: number;
  total: number;
}

export async function buildGoalTypes(teamId: string, seasonId: string): Promise<GoalTypeResult> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { nameEn: true, nameHe: true },
  });
  if (!team) return { openPlay: 0, penalty: 0, ownGoal: 0, total: 0 };

  const rows = await prisma.$queryRaw<Array<{ type: string; event_team: string }>>`
    SELECT ge.type::text AS type, ge.team AS event_team
    FROM "game_events" ge
    JOIN "games" g ON g.id = ge."gameId"
    WHERE g."seasonId" = ${seasonId}
      AND (g."homeTeamId" = ${teamId} OR g."awayTeamId" = ${teamId})
      AND ge.type IN ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL')
  `;

  const ourName = team.nameHe || team.nameEn;
  let openPlay = 0, penalty = 0, ownGoal = 0;
  for (const r of rows) {
    const isOurs = r.event_team && (r.event_team === ourName || r.event_team.includes(ourName) || ourName.includes(r.event_team));
    if (!isOurs) continue;
    if (r.type === 'PENALTY_GOAL') penalty++;
    else if (r.type === 'OWN_GOAL') ownGoal++;
    else openPlay++;
  }
  return { openPlay, penalty, ownGoal, total: openPlay + penalty + ownGoal };
}

export interface XgPoint {
  date: string;
  opponent: string;
  ourXg: number;
  oppXg: number;
}

export async function buildXgOverTime(teamId: string): Promise<XgPoint[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, nameHe: true, nameEn: true, seasonId: true },
  });
  if (!team) return [];

  const games = await prisma.game.findMany({
    where: {
      seasonId: team.seasonId,
      status: 'COMPLETED',
      OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      gameStats: { isNot: null },
    },
    include: {
      gameStats: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
    orderBy: { dateTime: 'asc' },
  });

  const points: XgPoint[] = [];
  for (const g of games) {
    const fs = (g.gameStats?.additionalInfo as any)?.flashscore;
    if (!fs?.expectedGoals && !fs?.xg && !fs?.xG) continue;
    const xgObj = fs.expectedGoals || fs.xg || fs.xG;
    const homeXg = typeof xgObj?.home === 'number' ? xgObj.home : Number(xgObj?.home);
    const awayXg = typeof xgObj?.away === 'number' ? xgObj.away : Number(xgObj?.away);
    if (Number.isNaN(homeXg) || Number.isNaN(awayXg)) continue;

    const isHome = g.homeTeamId === team.id;
    const opp = isHome ? (g.awayTeam.nameHe || g.awayTeam.nameEn) : (g.homeTeam.nameHe || g.homeTeam.nameEn);
    points.push({
      date: g.dateTime.toISOString().slice(0, 10),
      opponent: opp,
      ourXg: isHome ? homeXg : awayXg,
      oppXg: isHome ? awayXg : homeXg,
    });
  }
  return points;
}
