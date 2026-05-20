import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import type { PredictionsPayload, PredictionItem } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

const LIGAT_HAAL_ID = 'comp_liga_haal';

export async function GET(_request: NextRequest) {
  const season = await prisma.season.findFirst({ orderBy: { year: 'desc' } });
  if (!season) {
    return NextResponse.json<PredictionsPayload>({ season: null, items: [] });
  }

  // Pull predictions for upcoming + recent scheduled games. We anchor by the
  // game's dateTime so the list reads chronologically; finished games drop
  // off naturally once their prediction.updatedAt ages out, but the user
  // mostly cares about the next few rounds.
  const predictions = await prisma.gamePrediction.findMany({
    where: {
      seasonId: season.id,
      competitionId: LIGAT_HAAL_ID,
      game: { status: 'SCHEDULED', dateTime: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    },
    include: {
      game: {
        include: {
          homeTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
          awayTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
          competition: { select: { nameHe: true, nameEn: true } },
        },
      },
    },
    orderBy: { game: { dateTime: 'asc' } },
    take: 40,
  });

  const items: PredictionItem[] = predictions
    .filter((p) => p.game)
    .map((p) => ({
      gameId: p.gameId,
      competition: p.game!.competition?.nameHe || p.game!.competition?.nameEn || '',
      homeTeam: {
        id: p.game!.homeTeam.id,
        nameHe: p.game!.homeTeam.nameHe || p.game!.homeTeam.nameEn,
        logoUrl: p.game!.homeTeam.logoUrl ?? null,
      },
      awayTeam: {
        id: p.game!.awayTeam.id,
        nameHe: p.game!.awayTeam.nameHe || p.game!.awayTeam.nameEn,
        logoUrl: p.game!.awayTeam.logoUrl ?? null,
      },
      dateTime: p.game!.dateTime.toISOString(),
      winnerName: p.winnerTeamNameHe || p.winnerTeamNameEn || null,
      winnerCommentHe: p.winnerCommentHe || null,
      adviceHe: p.adviceHe || null,
      underOver: p.underOver || null,
      percentHome: p.percentHome,
      percentDraw: p.percentDraw,
      percentAway: p.percentAway,
    }));

  return NextResponse.json<PredictionsPayload>({
    season: { id: season.id, year: season.year, name: season.name },
    items,
  });
}
