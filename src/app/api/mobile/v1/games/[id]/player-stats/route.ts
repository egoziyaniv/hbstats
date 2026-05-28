import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { GamePlayerStatsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const rows = await prisma.gamePlayerStats.findMany({
    where: { gameId: params.id },
    orderBy: [{ minutes: 'desc' }, { rating: 'desc' }],
  });
  return NextResponse.json<GamePlayerStatsPayload>({
    gameId: params.id,
    players: rows.map((r) => ({
      apiFootballPlayerId: r.apiFootballPlayerId,
      playerId: r.playerId,
      name: r.playerName,
      rating: r.rating,
      minutes: r.minutes,
      position: r.position,
      captain: r.captain,
      substitute: r.substitute,
      goals: r.goals,
      assists: r.assists,
      shots: { total: r.shotsTotal, on: r.shotsOn },
      passes: { total: r.passesTotal, key: r.passesKey, accuracy: r.passAccuracy },
      tackles: { total: r.tacklesTotal, interceptions: r.interceptions },
      duels: { total: r.duelsTotal, won: r.duelsWon },
      dribbles: { attempts: r.dribblesAttempts, success: r.dribblesSuccess },
      fouls: { drawn: r.foulsDrawn, committed: r.foulsCommitted },
      cards: { yellow: r.yellowCards, red: r.redCards },
    })),
  });
}
