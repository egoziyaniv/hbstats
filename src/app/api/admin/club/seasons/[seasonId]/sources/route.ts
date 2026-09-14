import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { adminError, readAdminJson, requireAdminApi, resolvePilotDossier, validateSourceLinks } from '@/lib/season-dossier-admin';
import { parseSourceInput } from '@/lib/season-dossier-validation';

type Context = { params: Promise<{ seasonId: string }> };

export async function POST(request: NextRequest, context: Context) {
  const forbidden = await requireAdminApi();
  if (forbidden) return forbidden;
  try {
    const input = parseSourceInput(await readAdminJson(request));
    const { seasonId } = await context.params;
    const source = await prisma.$transaction(async (tx) => {
      const identity = await resolvePilotDossier(tx, seasonId);
      if (!identity?.dossier) return null;
      await validateSourceLinks(tx, identity, input);
      return tx.clubSeasonSource.create({ data: { dossierId: identity.dossier.id, ...input } });
    });
    if (!source) return NextResponse.json({ error: 'תיק העונה לא נמצא' }, { status: 404 });
    return NextResponse.json(source, { status: 201 });
  } catch (error) {
    return adminError(error);
  }
}
