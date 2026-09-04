import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { generateMatchSummary } from '@/lib/match-summary';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const draft = await generateMatchSummary(params.id);
  if (!draft) return NextResponse.json({ error: 'לא ניתן להפיק טיוטה (אין מפתח AI פעיל או נתוני משחק).' }, { status: 502 });
  return NextResponse.json({ draft });
}
