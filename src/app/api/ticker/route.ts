import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const revalidate = 60;

export async function GET() {
  const now = new Date();

  // Scope to the CURRENT season (the season of the most-recent completed game),
  // NOT a fixed competition — pre-season the only played games are the Super Cup,
  // Toto Cup and friendlies, so filtering to comp_liga_haal used to fall back to
  // LAST season's league results. All Israeli competitions of the live season.
  const lastCompleted = await prisma.game.findFirst({
    where: { status: 'COMPLETED' },
    orderBy: { dateTime: 'desc' },
    select: { seasonId: true },
  });
  const seasonFilter = lastCompleted?.seasonId ? { seasonId: lastCompleted.seasonId } : {};
  const teams = {
    homeTeam: { select: { nameHe: true, nameEn: true } },
    awayTeam: { select: { nameHe: true, nameEn: true } },
  };

  // Only count a game as live if it kicked off within the last 5h — a game left
  // stuck ONGOING (e.g. a postponed fixture never resolved) must not show as live.
  const liveWindowStart = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const [live, recent, upcoming] = await Promise.all([
    prisma.game.findMany({ where: { status: 'ONGOING', ...seasonFilter, dateTime: { gte: liveWindowStart } }, include: teams, take: 6 }),
    prisma.game.findMany({ where: { status: 'COMPLETED', ...seasonFilter }, orderBy: { dateTime: 'desc' }, include: teams, take: 8 }),
    prisma.game.findMany({ where: { status: 'SCHEDULED', ...seasonFilter, dateTime: { gte: now } }, orderBy: { dateTime: 'asc' }, include: teams, take: 4 }),
  ]);

  const label = (t: { nameHe: string | null; nameEn: string | null }) => t.nameHe || t.nameEn || '';

  const items = [
    ...live.map((g) => ({
      kind: 'live' as const,
      home: label(g.homeTeam),
      away: label(g.awayTeam),
      score: `${g.homeScore ?? 0}–${g.awayScore ?? 0}`,
    })),
    ...recent.map((g) => ({
      kind: 'ft' as const,
      home: label(g.homeTeam),
      away: label(g.awayTeam),
      score: `${g.homeScore ?? 0}–${g.awayScore ?? 0}`,
    })),
    ...upcoming.map((g) => ({
      kind: 'ns' as const,
      home: label(g.homeTeam),
      away: label(g.awayTeam),
      time: g.dateTime
        ? new Date(g.dateTime).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
        : '',
    })),
  ];

  return NextResponse.json({ items });
}
