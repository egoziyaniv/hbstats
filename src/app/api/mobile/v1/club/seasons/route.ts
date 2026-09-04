import { NextResponse } from 'next/server';
import { buildClubSeasons } from '@/lib/club-hub';
import type { ClubSeasonsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET() {
  const seasons = (await buildClubSeasons()) as ClubSeasonsPayload['seasons'];
  return NextResponse.json({ seasons } satisfies ClubSeasonsPayload);
}
