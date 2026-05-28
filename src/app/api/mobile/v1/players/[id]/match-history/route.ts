import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { PlayerMatchHistoryPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  // Resolve canonical + linked Player ids so we cover season-specific rows.
  const root = await prisma.player.findUnique({
    where: { id: params.id },
    select: { id: true, canonicalPlayerId: true, apiFootballId: true },
  });
  if (!root) return NextResponse.json({ playerId: params.id, entries: [] });
  const canonicalKey = root.canonicalPlayerId ?? root.id;
  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
    select: { id: true, apiFootballId: true },
  });
  const linkedIds = linked.map((p) => p.id);
  const linkedApiIds = linked.map((p) => p.apiFootballId).filter((v): v is number => typeof v === 'number');

  const rows = await prisma.gamePlayerStats.findMany({
    where: {
      OR: [
        ...(linkedIds.length > 0 ? [{ playerId: { in: linkedIds } }] : []),
        ...(linkedApiIds.length > 0 ? [{ apiFootballPlayerId: { in: linkedApiIds } }] : []),
      ],
    },
    include: {
      game: {
        select: {
          id: true, dateTime: true, homeScore: true, awayScore: true,
          homeTeam: { select: { nameHe: true, nameEn: true } },
          awayTeam: { select: { nameHe: true, nameEn: true } },
        },
      },
    },
    orderBy: { game: { dateTime: 'desc' } },
    take: 30,
  });

  return NextResponse.json<PlayerMatchHistoryPayload>({
    playerId: params.id,
    entries: rows.map((r) => ({
      gameId: r.game.id,
      date: r.game.dateTime.toISOString().slice(0, 10),
      opponent: `${r.game.homeTeam.nameHe || r.game.homeTeam.nameEn} - ${r.game.awayTeam.nameHe || r.game.awayTeam.nameEn}`,
      scoreLine: r.game.homeScore != null && r.game.awayScore != null ? `${r.game.homeScore}-${r.game.awayScore}` : '',
      rating: r.rating,
      minutes: r.minutes,
      goals: r.goals,
      assists: r.assists,
      shotsOn: r.shotsOn,
      shotsTotal: r.shotsTotal,
      passesKey: r.passesKey,
      duelsWon: r.duelsWon,
      duelsTotal: r.duelsTotal,
    })),
  });
}
