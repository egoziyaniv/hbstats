import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { ClubRecordGroupApi, TeamExtrasPayload } from '@shared/types/mobile-api';
import { buildCoachTimelineBySeason, buildCoachWinChart } from '@/lib/coach-timeline';
import { buildGoalTimingForTeam } from '@/lib/goal-timing';
import { getClubFamilyByTeamId } from '@/lib/history/club-identity';
import { getClubHonors } from '@/lib/history/club-honors';
import { RECORD_CATEGORIES } from '@/lib/history/records-engine';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    select: { id: true, nameHe: true, nameEn: true, seasonId: true },
  });
  if (!team) return NextResponse.json({ teamId: params.id, coaches: [], injuries: [], honors: null, clubRecords: [] });

  const [coachRows, injuryRows, coachTimeline, coachChart, goalTiming, clubFamily] = await Promise.all([
    // Coach history — across all seasons for this team's name. Dedup by render-side
    // to handle API-Football's overlapping career entries.
    prisma.teamCoachAssignment.findMany({
      where: { team: team.nameEn ? { nameEn: team.nameEn } : { nameHe: team.nameHe } },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take: 25,
      include: { season: { select: { name: true } } },
    }),
    prisma.playerInjury.findMany({
      where: { teamId: team.id, seasonId: team.seasonId },
      orderBy: { fixtureDate: 'desc' },
      take: 20,
      include: { player: { select: { nameHe: true, nameEn: true } } },
    }),
    buildCoachTimelineBySeason(team.id),
    buildCoachWinChart(team.id),
    buildGoalTimingForTeam(team.id),
    getClubFamilyByTeamId(team.id),
  ]);

  // Club honors + club-scope records ("ארון הגביעים" / "שיאי המועדון") — same
  // data the web history tab shows, grouped by RECORD_CATEGORIES with only
  // non-empty categories, top 3 rows each (mirrors src/app/teams/[id]/page.tsx).
  const honors = clubFamily ? await getClubHonors(clubFamily.clubKey) : null;
  const clubRecordRows = clubFamily
    ? await prisma.recordEntry.findMany({
        where: { scope: `club:${clubFamily.clubKey}` },
        orderBy: [{ category: 'asc' }, { rank: 'asc' }],
      })
    : [];
  const clubRecords: ClubRecordGroupApi[] = RECORD_CATEGORIES.map((cat) => ({
    category: cat.key,
    titleHe: cat.titleHe,
    rows: clubRecordRows
      .filter((r) => r.category === cat.key)
      .slice(0, 3)
      .map((r) => ({
        id: r.id,
        rank: r.rank,
        labelHe: r.labelHe,
        detailHe: r.detailHe,
        playerId: r.playerId,
        gameId: r.gameId,
        computedAt: r.computedAt.toISOString(),
      })),
  })).filter((group) => group.rows.length > 0);

  const seen = new Set<string>();
  const coaches = coachRows
    .map((c) => ({
      id: c.id,
      nameHe: c.coachNameHe,
      nameEn: c.coachNameEn,
      seasonName: c.season.name,
      startDate: c.startDate ? c.startDate.toISOString().slice(0, 10) : null,
      endDate: c.endDate ? c.endDate.toISOString().slice(0, 10) : null,
    }))
    .filter((c) => {
      const k = `${c.nameHe || c.nameEn}|${c.startDate || ''}|${c.endDate || ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

  const injuries = injuryRows.map((i) => ({
    id: i.id,
    playerName: i.player?.nameHe || i.playerNameEn || null,
    reason: i.reasonEn || i.typeEn || null,
    date: i.fixtureDate ? i.fixtureDate.toISOString().slice(0, 10) : null,
  }));

  return NextResponse.json<TeamExtrasPayload>({
    teamId: team.id, coaches, coachTimeline, injuries,
    coachChart, goalTiming, honors, clubRecords,
  });
}
