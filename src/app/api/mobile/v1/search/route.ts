import { NextRequest, NextResponse } from 'next/server';
import { searchEntities } from '@/lib/search';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();
  if (!query || query.length < 2) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await searchEntities(query) });
}
