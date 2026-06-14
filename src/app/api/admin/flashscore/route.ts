import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import {
  runFlashscoreImport,
  runFlashscoreMergeOnly,
  runFlashscoreSingleMatch,
  getFlashscoreStatus,
  type FlashscoreOptions,
} from '@/lib/flashscore-runner';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action;

  if (action === 'status') {
    return NextResponse.json(getFlashscoreStatus());
  }

  if (action === 'merge') {
    if (getFlashscoreStatus().running) {
      return NextResponse.json({ error: 'תהליך כבר רץ', status: getFlashscoreStatus() }, { status: 429 });
    }
    runFlashscoreMergeOnly().catch((e) =>
      console.error('[flashscore] background merge failed:', e?.message || e),
    );
    return NextResponse.json({ success: true, message: 'מיזוג התחיל' });
  }

  if (action === 'start') {
    if (getFlashscoreStatus().running) {
      return NextResponse.json({ error: 'תהליך כבר רץ', status: getFlashscoreStatus() }, { status: 429 });
    }
    const opts: FlashscoreOptions = {
      leagueSlug: String(body?.leagueSlug || 'ligat-ha-al'),
      season: String(body?.season || '2025-2026'),
      skipFixtures: !!body?.skipFixtures,
      skipTeams: !!body?.skipTeams,
      skipMatches: !!body?.skipMatches,
      skipPlayers: !!body?.skipPlayers,
      skipMerge: !!body?.skipMerge,
      headful: !!body?.headful,
    };
    runFlashscoreImport(opts).catch((e) =>
      console.error('[flashscore] background import failed:', e?.message || e),
    );
    return NextResponse.json({ success: true, message: 'ייבוא התחיל', options: opts });
  }

  if (action === 'import-single') {
    if (getFlashscoreStatus().running) {
      return NextResponse.json({ error: 'תהליך כבר רץ', status: getFlashscoreStatus() }, { status: 429 });
    }
    const url = String(body?.url || '').trim();
    const leagueSlug = String(body?.leagueSlug || '').trim();
    const season = String(body?.season || '').trim();
    if (!url || !leagueSlug || !season) {
      return NextResponse.json({ error: 'חסר url / leagueSlug / season' }, { status: 400 });
    }
    if (!/^https:\/\/www\.flashscore\.com\/match\/football\//.test(url)) {
      return NextResponse.json({ error: 'URL לא תואם פורמט Flashscore match' }, { status: 400 });
    }
    runFlashscoreSingleMatch({ url, leagueSlug, season }).catch((e) =>
      console.error('[flashscore] background single-match import failed:', e?.message || e),
    );
    return NextResponse.json({ success: true, message: 'ייבוא משחק בודד התחיל', url, leagueSlug, season });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
