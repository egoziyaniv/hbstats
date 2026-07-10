import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getOnThisDay } from '@/lib/on-this-day';
import { tokensForOnThisDay, sendIfAny } from '@/lib/push-notify';

export const dynamic = 'force-dynamic';

const LAST_SENT_KEY = 'on_this_day_last_sent';

/**
 * Daily "היום לפני X שנים" push. Guarded by CRON_SECRET via the `x-cron-secret`
 * HEADER only (a query-string secret leaks into access logs). Idempotent per
 * calendar day via SiteSetting — safe to retry. `?dry=1` previews without
 * sending or marking. Crontab: daily 09:00, curl -H "x-cron-secret: ...".
 */
async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1';

  const today = new Date().toISOString().slice(0, 10);
  const lastSent = await prisma.siteSetting.findUnique({ where: { key: LAST_SENT_KEY } });
  if (!dry && lastSent?.valueJson === today) {
    return NextResponse.json({ ok: true, skipped: 'already sent today' });
  }

  const payload = await getOnThisDay();
  if (!payload.match) {
    return NextResponse.json({ ok: true, skipped: 'no anniversary match today' });
  }

  const tokens = await tokensForOnThisDay();
  const title = `📅 היום לפני ${payload.match.yearsAgo} שנים`;
  const body = `${payload.match.homeName} ${payload.match.homeScore}–${payload.match.awayScore} ${payload.match.awayName}. זוכרים?`;

  let sent = 0;
  if (!dry && tokens.length) {
    const r = await sendIfAny(tokens, { title, body, data: { type: 'onThisDay', gameId: payload.match.gameId } });
    sent = r.sent;
  }
  if (!dry) {
    await prisma.siteSetting.upsert({
      where: { key: LAST_SENT_KEY },
      update: { valueJson: today },
      create: { key: LAST_SENT_KEY, valueJson: today },
    });
  }
  return NextResponse.json({ ok: true, dry, devices: tokens.length, sent, headline: payload.match.headline });
}

export async function POST(req: NextRequest) { return run(req); }
export async function GET(req: NextRequest) { return run(req); }
