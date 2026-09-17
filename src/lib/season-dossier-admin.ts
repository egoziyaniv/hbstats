import type { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { requireAdminUser } from '@/lib/auth';
import { SeasonDossierValidationError } from '@/lib/season-dossier-validation';

const BEER_SHEVA_API_FOOTBALL_ID = 563;

export async function requireAdminApi(): Promise<NextResponse | null> {
  try {
    await requireAdminUser();
    return null;
  } catch {
    return NextResponse.json({ error: 'אין הרשאת מנהל' }, { status: 403 });
  }
}

export async function readAdminJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new SeasonDossierValidationError('גוף הבקשה אינו JSON תקין');
  }
}

export function adminError(error: unknown): NextResponse {
  if (error instanceof SeasonDossierValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error('Season dossier admin operation failed');
  return NextResponse.json({ error: 'הפעולה נכשלה' }, { status: 500 });
}

export async function resolvePilotDossier(
  tx: Prisma.TransactionClient,
  seasonId: string,
  requireExisting = true,
) {
  const season = await tx.season.findUnique({
    where: { id: seasonId },
    select: { id: true, year: true },
  });
  if (!season) return null;
  const team = await tx.team.findFirst({
    where: { seasonId, apiFootballId: BEER_SHEVA_API_FOOTBALL_ID },
    select: { id: true },
  });
  if (!team) return null;
  const dossier = await tx.clubSeasonDossier.findUnique({
    where: { seasonId_teamId: { seasonId, teamId: team.id } },
  });
  if (requireExisting && !dossier) return null;
  return { season, team, dossier };
}

export async function validateMomentLinks(
  tx: Prisma.TransactionClient,
  identity: { season: { id: string }; team: { id: string } },
  input: { gameId: string | null; mediaAssetId: string | null },
) {
  if (input.gameId) {
    const game = await tx.game.findFirst({
      where: {
        id: input.gameId,
        seasonId: identity.season.id,
        OR: [{ homeTeamId: identity.team.id }, { awayTeamId: identity.team.id }],
      },
      select: { id: true },
    });
    if (!game) throw new SeasonDossierValidationError('המשחק אינו שייך לעונה ולקבוצה של התיק');
  }
  if (input.mediaAssetId) {
    const asset = await tx.mediaAsset.findFirst({
      where: { id: input.mediaAssetId, seasonId: identity.season.id },
      select: { id: true },
    });
    if (!asset) throw new SeasonDossierValidationError('קובץ המדיה אינו שייך לעונה');
  }
}

export async function validateSourceLinks(
  tx: Prisma.TransactionClient,
  identity: { season: { id: string }; dossier: { id: string } | null },
  input: { competitionId: string | null; momentId: string | null },
) {
  if (!identity.dossier) throw new SeasonDossierValidationError('תיק העונה לא נמצא');
  if (input.competitionId) {
    const competition = await tx.competitionSeason.findUnique({
      where: {
        competitionId_seasonId: {
          competitionId: input.competitionId,
          seasonId: identity.season.id,
        },
      },
      select: { id: true },
    });
    if (!competition) throw new SeasonDossierValidationError('המסגרת אינה שייכת לעונה');
  }
  if (input.momentId) {
    const moment = await tx.clubSeasonMoment.findFirst({
      where: { id: input.momentId, dossierId: identity.dossier.id },
      select: { id: true },
    });
    if (!moment) throw new SeasonDossierValidationError('הרגע אינו שייך לתיק העונה');
  }
}
