import { NextRequest, NextResponse } from 'next/server';
import { getClubPage } from '@/lib/club-hub';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const page = await getClubPage(params.slug);
  if (!page) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(page);
}
