import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import {
  runSofascoreAction,
  getSofascoreStatus,
  type SofascoreAction,
} from '@/lib/sofascore-runner';

export const dynamic = 'force-dynamic';

const VALID_ACTIONS: SofascoreAction[] = ['ratings-season', 'team-stats', 'match-stats', 'coach-photos', 'backfill'];

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const action = body?.action as string;

  if (action === 'status') {
    return NextResponse.json(getSofascoreStatus());
  }

  if (!VALID_ACTIONS.includes(action as SofascoreAction)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  if (getSofascoreStatus().running) {
    return NextResponse.json(
      { error: 'תהליך כבר רץ', status: getSofascoreStatus() },
      { status: 429 },
    );
  }

  const extraArgs: string[] = [];
  if (action === 'ratings-season') {
    const season = String(body?.season || '').trim();
    if (season) extraArgs.push('--season', season);
    const competition = String(body?.competition || '').trim();
    if (competition) extraArgs.push('--competition', competition);
    const limit = parseInt(String(body?.limit || '0'), 10);
    if (Number.isFinite(limit) && limit > 0) extraArgs.push('--limit', String(limit));
  } else if (action === 'team-stats') {
    const limit = parseInt(String(body?.limit || '0'), 10);
    if (Number.isFinite(limit) && limit > 0) extraArgs.push('--limit', String(limit));
  } else if (action === 'match-stats') {
    const competition = String(body?.competition || '').trim();
    if (competition) extraArgs.push('--competition', competition);
    const limit = parseInt(String(body?.limit || '0'), 10);
    if (Number.isFinite(limit) && limit > 0) extraArgs.push('--limit', String(limit));
  } else if (action === 'coach-photos') {
    if (body?.force) extraArgs.push('--force');
    const limit = parseInt(String(body?.limit || '0'), 10);
    if (Number.isFinite(limit) && limit > 0) extraArgs.push('--limit', String(limit));
  }

  runSofascoreAction(action as SofascoreAction, extraArgs).catch((e) =>
    console.error('[sofascore] background action failed:', e?.message || e),
  );
  return NextResponse.json({
    success: true,
    message: 'התהליך התחיל',
    action,
    args: extraArgs,
  });
}
