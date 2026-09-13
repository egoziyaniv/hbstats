import { NextResponse } from 'next/server';
import { buildSeasonDossier } from '@/lib/season-dossier';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params: paramsPromise }: { params: Promise<{ seasonId: string }> },
) {
  const { seasonId } = await paramsPromise;
  const dossier = await buildSeasonDossier(seasonId);
  if (!dossier) {
    return NextResponse.json({ error: 'Season dossier not found' }, { status: 404 });
  }
  return NextResponse.json(dossier);
}
