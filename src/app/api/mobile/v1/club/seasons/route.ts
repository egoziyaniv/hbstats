import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildClubSeasons } from '@/lib/club-hub';
import type { ClubSeasonsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [rows, published] = await Promise.all([
    buildClubSeasons(),
    prisma.clubSeasonDossier.findMany({ where: { isPublished: true, team: { apiFootballId: 563 } }, select: { seasonId: true } }),
  ]);
  const available = new Set(published.map(dossier => dossier.seasonId));
  const seasons: ClubSeasonsPayload['seasons'] = rows.map(row => ({
    ...row, dossierAvailable: row.year === 2025 || row.year === 2026 || available.has(row.seasonId),
  }));
  return NextResponse.json({ seasons } satisfies ClubSeasonsPayload);
}
