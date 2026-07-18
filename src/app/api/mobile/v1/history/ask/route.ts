import { NextRequest, NextResponse } from 'next/server';
import { answerQuestion, listQuestions } from '@/lib/stats-qa';
import { getCurrentLeagueClubFamilies } from '@/lib/history/club-identity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const id = sp.get('q');
  if (!id) {
    const clubs = (await getCurrentLeagueClubFamilies()).map((f) => ({ clubKey: f.clubKey, nameHe: f.nameHe }));
    return NextResponse.json({ questions: listQuestions(), clubs });
  }
  const card = await answerQuestion(id, { clubKey: sp.get('club') ?? undefined, rivalKey: sp.get('rival') ?? undefined });
  return NextResponse.json({ card });
}
