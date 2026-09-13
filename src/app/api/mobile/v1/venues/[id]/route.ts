import { NextRequest, NextResponse } from 'next/server';
import { buildVenueStats } from '@/lib/venue-stats';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const stats = await buildVenueStats(params.id);
  if (!stats) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(stats);
}
