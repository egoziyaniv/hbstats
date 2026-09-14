import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { buildSeasonDossier } from '@/lib/season-dossier';
import {
  adminError,
  readAdminJson,
  requireAdminApi,
  resolvePilotDossier,
} from '@/lib/season-dossier-admin';
import { parseDossierInput } from '@/lib/season-dossier-validation';

type Context = { params: Promise<{ seasonId: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const forbidden = await requireAdminApi();
  if (forbidden) return forbidden;
  const { seasonId } = await context.params;
  const dossier = await buildSeasonDossier(seasonId, { includeDrafts: true });
  if (!dossier) return NextResponse.json({ error: 'תיק העונה לא נמצא' }, { status: 404 });
  const row = await prisma.clubSeasonDossier.findUnique({
    where: { seasonId_teamId: { seasonId, teamId: dossier.team.id } },
    select: { isPublished: true, publishedAt: true },
  });
  return NextResponse.json({
    dossier,
    publication: {
      isPublished: row?.isPublished ?? false,
      publishedAt: row?.publishedAt?.toISOString() ?? null,
    },
  });
}

export async function PUT(request: NextRequest, context: Context) {
  const forbidden = await requireAdminApi();
  if (forbidden) return forbidden;
  try {
    const input = parseDossierInput(await readAdminJson(request));
    const { seasonId } = await context.params;
    const saved = await prisma.$transaction(async (tx) => {
      const identity = await resolvePilotDossier(tx, seasonId, false);
      if (!identity) return null;
      const now = new Date();
      const publishedAt = input.isPublished
        ? identity.dossier?.isPublished
          ? identity.dossier.publishedAt
          : now
        : null;
      return tx.clubSeasonDossier.upsert({
        where: { seasonId_teamId: { seasonId, teamId: identity.team.id } },
        create: {
          seasonId,
          teamId: identity.team.id,
          ...input,
          publishedAt,
        },
        update: { ...input, publishedAt },
      });
    });
    if (!saved) return NextResponse.json({ error: 'תיק העונה לא נמצא' }, { status: 404 });
    return NextResponse.json(saved);
  } catch (error) {
    return adminError(error);
  }
}
