import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getRequestUser } from '@/lib/auth';
import { clearSpineCache } from '@/lib/history/seasons-spine';
import { clearAllTimeCache } from '@/lib/history/all-time-table';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const seasonId = searchParams.get('seasonId');
  const teamId = searchParams.get('teamId');

  if (!seasonId && !teamId) {
    return NextResponse.json({ error: 'seasonId or teamId is required' }, { status: 400 });
  }

  const standings = await prisma.standing.findMany({
    where: {
      ...(seasonId ? { seasonId } : {}),
      ...(teamId ? { teamId } : {}),
    },
    include: {
      team: true,
      season: true,
      competition: true,
    },
    orderBy: [{ position: 'asc' }],
  });

  return NextResponse.json(standings);
}

export async function PUT(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { teamId, seasonId, pointsAdjustment, pointsAdjustmentNoteHe } = body;

  if (!teamId || !seasonId) {
    return NextResponse.json({ error: 'teamId and seasonId are required' }, { status: 400 });
  }

  const adjustmentValue = Number(pointsAdjustment ?? 0);
  if (Number.isNaN(adjustmentValue)) {
    return NextResponse.json({ error: 'pointsAdjustment must be numeric' }, { status: 400 });
  }

  const LEAGUE_API_IDS = [383, 382];
  try {
    // A team may now hold several standing rows in one season (league + cup group).
    // A points adjustment belongs to the LEAGUE table, so target the league row;
    // fall back to whatever single row exists.
    const existingRows = await prisma.standing.findMany({
      where: { seasonId, teamId },
      select: { id: true, competition: { select: { apiFootballId: true } } },
    });
    const target =
      existingRows.find((r) => LEAGUE_API_IDS.includes(r.competition?.apiFootballId ?? -1)) ||
      existingRows[0];

    let standing;
    if (target) {
      standing = await prisma.standing.update({
        where: { id: target.id },
        data: {
          pointsAdjustment: adjustmentValue,
          pointsAdjustmentNoteHe: pointsAdjustmentNoteHe?.trim() || null,
        },
        include: { team: true, season: true },
      });
    } else {
      // No standing row yet — competitionId is required, so resolve the team's
      // league for this season from its league games before creating one.
      const leagueComps = await prisma.competition.findMany({
        where: { apiFootballId: { in: LEAGUE_API_IDS } },
        select: { id: true },
      });
      const games = await prisma.game.findMany({
        where: {
          seasonId,
          competitionId: { in: leagueComps.map((c) => c.id) },
          OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        },
        select: { competitionId: true },
      });
      const tally = new Map<string, number>();
      for (const g of games) if (g.competitionId) tally.set(g.competitionId, (tally.get(g.competitionId) || 0) + 1);
      let competitionId: string | null = null;
      let bestN = 0;
      for (const [cid, n] of tally) if (n > bestN) { competitionId = cid; bestN = n; }
      if (!competitionId) {
        return NextResponse.json(
          { error: 'No standing row exists for this team/season and its league could not be determined.' },
          { status: 400 },
        );
      }
      standing = await prisma.standing.create({
        data: {
          seasonId,
          teamId,
          competitionId,
          position: 0,
          points: 0,
          pointsAdjustment: adjustmentValue,
          pointsAdjustmentNoteHe: pointsAdjustmentNoteHe?.trim() || null,
        },
        include: { team: true, season: true },
      });
    }

    // A points adjustment can change a historical champion/relegation — drop
    // the "כל העונות" spine cache so the change shows without waiting an hour.
    clearSpineCache();
    // ...and adjusted points feed the all-time club table too.
    clearAllTimeCache();

    await prisma.activityLog.create({
      data: {
        entityType: 'TEAM',
        entityId: teamId,
        actionHe: `עודכן תיקון נקודות לעונה ${standing.season.name}`,
        userId: auth.id,
      },
    });

    return NextResponse.json(standing);
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Failed to update standing adjustment' },
      { status: 400 }
    );
  }
}
