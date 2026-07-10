import { NextRequest, NextResponse } from 'next/server';
import { searchEntities } from '@/lib/search';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  return NextResponse.json({ results: await searchEntities(query) });
}
