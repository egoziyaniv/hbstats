import { NextRequest, NextResponse } from 'next/server';
import { getLegend } from '@/lib/club-hub';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const legend = await getLegend(params.id);
  if (!legend) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(legend);
}
