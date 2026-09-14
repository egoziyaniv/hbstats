import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { adminError, readAdminJson, requireAdminApi, resolvePilotDossier, validateMomentLinks } from '@/lib/season-dossier-admin';
import { parseMomentInput } from '@/lib/season-dossier-validation';

type Context = { params: Promise<{ seasonId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const forbidden = await requireAdminApi();
  if (forbidden) return forbidden;
  try {
    const input = parseMomentInput(await readAdminJson(request));
    const { seasonId } = await context.params;
    const moment = await prisma.$transaction(async (tx) => {
      const identity = await resolvePilotDossier(tx, seasonId);
      if (!identity?.dossier) return null;
      await validateMomentLinks(tx, identity, input);
      return tx.clubSeasonMoment.create({ data: { dossierId: identity.dossier.id, ...input } });
    });
    if (!moment) return NextResponse.json({ error: 'תיק העונה לא נמצא' }, { status: 404 });
    return NextResponse.json(moment, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
