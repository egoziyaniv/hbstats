import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { TeamExtrasPayload } from '@shared/types/mobile-api';
import { buildCoachTimelineBySeason } from '@/lib/coach-timeline';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const team = await prisma.team.findUnique({
    where: { id: params.id },
    select: { id: true, nameHe: true, nameEn: true, seasonId: true },
  });
  if (!team) return NextResponse.json({ teamId: params.id, coaches: [], injuries: [] });

  const [coachRows, injuryRows, coachTimeline] = await Promise.all([
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
  ]);

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

  return NextResponse.json<TeamExtrasPayload>({ teamId: team.id, coaches, coachTimeline, injuries });
}
