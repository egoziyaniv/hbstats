import { NextRequest, NextResponse } from 'next/server';
import { getLegend } from '@/lib/club-hub';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const legend = await getLegend(params.id);
  if (!legend) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(legend);
}
