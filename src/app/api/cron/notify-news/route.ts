import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import {
  DEFAULT_TELEGRAM_SOURCES,
  fetchTelegramMessagesFromSources,
  normalizeTelegramSource,
} from '@/lib/telegram';
import { isCategoryEnabled, tokensForNews, sendIfAny } from '@/lib/push-notify';

export const dynamic = 'force-dynamic';

/**
 * Phase 3 news push. Polls the configured Telegram channels, and for each
 * channel pushes the newest message we haven't pushed yet (deduped via
 * news_notification_state). First sight of a channel just sets the baseline so
 * we never backfill its history. Obeys the admin 'news' master switch and each
 * user's notifyNews toggle (both enforced inside tokensForNews).
 *
 * Guarded by the CRON_SECRET env via the `x-cron-secret` HEADER only — a query
 * string secret leaks into access logs. The server crontab MUST call this with
 * `curl -H "x-cron-secret: $CRON_SECRET"` (not `?secret=`).
 * Add `?dry=1` to detect without sending. Called by the server crontab via curl.
 */
async function getConfiguredSources() {
  const setting = await prisma.siteSetting.findUnique({ where: { key: 'telegram_sources' } });
  const raw = Array.isArray(setting?.valueJson) ? (setting!.valueJson as Array<Record<string, unknown>>) : [];
  const sources = raw
    .map((s) =>
      normalizeTelegramSource({
        slug: typeof s.slug === 'string' ? s.slug : null,
        url: typeof s.url === 'string' ? s.url : null,
        label: typeof s.label === 'string' ? s.label : '',
        teamLabel: typeof s.teamLabel === 'string' ? s.teamLabel : '',
      }),
    )
    .filter((s): s is NonNullable<typeof s> => Boolean(s));
  return sources.length ? sources : DEFAULT_TELEGRAM_SOURCES;
}

const idNum = (id: string) => {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
};
// Newer message? Prefer numeric id compare, fall back to lexicographic.
function isNewer(id: string, lastId: string): boolean {
  const a = idNum(id), b = idNum(lastId);
  if (a !== null && b !== null) return a > b;
  return id.localeCompare(lastId) > 0;
}

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  // Header only — a `?secret=` query string leaks the secret into access logs.
  const provided = req.headers.get('x-cron-secret');
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const dry = req.nextUrl.searchParams.get('dry') === '1';

  if (!(await isCategoryEnabled('news'))) {
    return NextResponse.json({ ok: true, skipped: 'news disabled by admin' });
  }

  const sources = await getConfiguredSources();
  const messages = await fetchTelegramMessagesFromSources(sources, 5).catch(() => []);

  // Group by channel, newest first within each.
  const byChannel = new Map<string, typeof messages>();
  for (const m of messages) {
    if (!m.sourceSlug || !m.id) continue;
    const arr = byChannel.get(m.sourceSlug) || [];
    arr.push(m);
    byChannel.set(m.sourceSlug, arr);
  }

  const tokens = await tokensForNews();
  const results: Array<Record<string, unknown>> = [];
  let pushed = 0;

  for (const [slug, msgs] of byChannel) {
    msgs.sort((a, b) => (isNewer(a.id, b.id) ? -1 : 1)); // newest first
    const newest = msgs[0];
    const state = await prisma.newsNotificationState.findUnique({ where: { channelSlug: slug } });

    if (!state) {
      // First sight: set baseline, do not push history.
      if (!dry) {
        await prisma.newsNotificationState.upsert({
          where: { channelSlug: slug },
          update: { lastMessageId: newest.id },
          create: { channelSlug: slug, lastMessageId: newest.id },
        });
      }
      results.push({ slug, baseline: newest.id });
      continue;
    }

    if (!isNewer(newest.id, state.lastMessageId)) {
      results.push({ slug, nothingNew: true });
      continue;
    }

    // Push the single newest item; advance the pointer past everything seen.
    const title = `📰 ${newest.teamLabel || newest.sourceLabel || 'חדשות'}`;
    const body = (newest.text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
    results.push({ slug, push: newest.id, body });
    if (!dry) {
      const r = await sendIfAny(tokens, { title, body, data: { type: 'news', url: newest.url } });
      pushed += r.sent;
      await prisma.newsNotificationState.upsert({
        where: { channelSlug: slug },
        update: { lastMessageId: newest.id },
        create: { channelSlug: slug, lastMessageId: newest.id },
      });
    }
  }

  return NextResponse.json({ ok: true, dry, devices: tokens.length, pushed, channels: results });
}

export async function POST(req: NextRequest) {
  return run(req);
}
export async function GET(req: NextRequest) {
  return run(req);
}
