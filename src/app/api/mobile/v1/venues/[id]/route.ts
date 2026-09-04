import { NextRequest, NextResponse } from 'next/server';
import { buildVenueStats } from '@/lib/venue-stats';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const stats = await buildVenueStats(params.id);
  if (!stats) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(stats);
}
