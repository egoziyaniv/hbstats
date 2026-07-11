import { NextRequest, NextResponse } from 'next/server';
import { getClubFamilies, getClubFamily } from '@/lib/history/club-identity';
import { buildFullH2H } from '@/lib/h2h';
import type { FullH2HApiPayload, H2HClubsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const a = searchParams.get('a');
  const b = searchParams.get('b');

  if (!a && !b) {
    // No pair selected yet — return the club picker list (top families by
    // season count, mirrors the web index's "בחרו מועדון" list).
    const families = await getClubFamilies();
    const payload: H2HClubsPayload = {
      clubs: families.slice(0, 40).map((f) => ({ clubKey: f.clubKey, nameHe: f.nameHe })),
    };
    return NextResponse.json(payload);
  }
  if (!a || !b) {
    return NextResponse.json({ error: 'Both a and b are required' }, { status: 400 });
  }
  if (a === b) {
    return NextResponse.json({ error: 'Pick two different clubs' }, { status: 400 });
  }

  const [famA, famB] = await Promise.all([getClubFamily(a), getClubFamily(b)]);
  if (!famA || !famB) {
    return NextResponse.json({ error: 'Unknown club key' }, { status: 400 });
  }

  const h2h = await buildFullH2H(famA.latestTeamId, famB.latestTeamId);
  if (!h2h) {
    return NextResponse.json({ error: 'Unable to resolve rivalry' }, { status: 400 });
  }

  const payload: FullH2HApiPayload = h2h;
  return NextResponse.json(payload);
}
