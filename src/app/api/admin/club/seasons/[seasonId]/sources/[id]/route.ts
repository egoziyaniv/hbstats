import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { adminError, readAdminJson, requireAdminApi, resolvePilotDossier, validateSourceLinks } from '@/lib/season-dossier-admin';
import { parseSourceInput } from '@/lib/season-dossier-validation';

type Context = { params: Promise<{ seasonId: string; id: string }> };

export async function PUT(request: NextRequest, context: Context) {
  const forbidden = await requireAdminApi();
  if (forbidden) return forbidden;
  try {
    const input = parseSourceInput(await readAdminJson(request));
    const { seasonId, id } = await context.params;
    const result = await prisma.$transaction(async (tx) => {
      const identity = await resolvePilotDossier(tx, seasonId);
      if (!identity?.dossier) return null;
      const source = await tx.clubSeasonSource.findFirst({ where: { id, dossierId: identity.dossier.id }, select: { id: true } });
      if (!source) return null;
      await validateSourceLinks(tx, identity, input);
      return tx.clubSeasonSource.update({ where: { id }, data: input });
    });
    if (!result) return NextResponse.json({ error: 'המקור לא נמצא' }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    return adminError(error);
  }
}

export async function DELETE(_request: NextRequest, context: Context) {
  const forbidden = await requireAdminApi();
  if (forbidden) return forbidden;
  try {
    const { seasonId, id } = await context.params;
    const deleted = await prisma.$transaction(async (tx) => {
      const identity = await resolvePilotDossier(tx, seasonId);
      if (!identity?.dossier) return false;
      const source = await tx.clubSeasonSource.findFirst({ where: { id, dossierId: identity.dossier.id }, select: { id: true } });
      if (!source) return false;
      await tx.clubSeasonSource.delete({ where: { id } });
      return true;
    });
    if (!deleted) return NextResponse.json({ error: 'המקור לא נמצא' }, { status: 404 });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return adminError(error);
  }
}
