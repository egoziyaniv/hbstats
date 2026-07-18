import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion, listQuestions } from '@/lib/stats-qa';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get('q');
  if (!id) return NextResponse.json({ questions: listQuestions() });
  const clubKey = sp.get('club') ?? undefined;
  const rivalKey = sp.get('rival') ?? undefined;
  const card = await answerQuestion(id, { clubKey, rivalKey });
  if (!card) return NextResponse.json({ error: 'unknown question' }, { status: 404 });
  return NextResponse.json({ card });
}
