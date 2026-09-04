import { NextResponse } from 'next/server';
import { buildClubHubPayload } from '@/lib/club-hub';

export const dynamic = 'force-dynamic';

export async function GET() {
  const payload = await buildClubHubPayload();
  return NextResponse.json(payload);
}
