/**
 * Find YouTube videos of Hapoel Beer Sheva games and link them to the games.
 * Confident matches go straight onto the game page; the rest wait in /admin/videos.
 *
 *   npx tsx scripts/videos/scan-youtube.ts                 # recent games (last 21 days) + newest uploads
 *   npx tsx scripts/videos/scan-youtube.ts --backfill 40   # also 40 older games without a video
 *   npx tsx scripts/videos/scan-youtube.ts --days 60 --dry # print matches, write nothing
 */
import prisma from '@/lib/prisma';
import { searchYouTube, fetchVideoMeta } from '@/lib/videos/youtube-fetch';
import { matchVideo, mentionsHbs } from '@/lib/videos/match';
import { loadHbsGames, recordVideo, hbsGameWhere } from '@/lib/videos/service';

const arg = (name: string, def: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : def;
};
const DRY = process.argv.includes('--dry');
const DAYS = arg('days', 21);
const BACKFILL = arg('backfill', 0);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const games = await loadHbsGames();
  const byId = new Map(games.map((g) => [g.id, g]));
  const label = (id: string) => {
    const g = byId.get(id);
    return g ? `${g.dateTime.toISOString().slice(0, 10)} ${g.homeName} ${g.homeScore}-${g.awayScore} ${g.awayName}` : id;
  };
  const opp = (id: string) => { const g = byId.get(id)!; return g.hbsHome ? g.awayName : g.homeName; };

  type Q = { q: string; newestFirst: boolean; gameId?: string };
  const queries: Q[] = [
    { q: 'הפועל באר שבע תקציר', newestFirst: true },
    { q: 'הפועל באר שבע משחק מלא', newestFirst: true },
  ];
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const noVideo = { OR: [{ editorial: null }, { editorial: { recapVideoUrl: null } }] };
  const recent = await prisma.game.findMany({
    where: { ...hbsGameWhere, status: 'COMPLETED', dateTime: { gte: since }, AND: [noVideo] },
    select: { id: true }, orderBy: { dateTime: 'desc' },
  });
  for (const g of recent) if (byId.has(g.id)) queries.push({ q: `הפועל באר שבע ${opp(g.id)} תקציר`, newestFirst: true, gameId: g.id });
  if (BACKFILL > 0) {
    const old = await prisma.game.findMany({
      where: { ...hbsGameWhere, status: 'COMPLETED', dateTime: { lt: since }, AND: [noVideo] },
      select: { id: true },
      orderBy: [{ videoScannedAt: { sort: 'asc', nulls: 'first' } }, { dateTime: 'desc' }],
      take: BACKFILL,
    });
    for (const g of old) {
      if (!byId.has(g.id)) continue;
      const x = byId.get(g.id)!;
      queries.push({ q: `הפועל באר שבע ${opp(g.id)} ${x.homeScore}-${x.awayScore} ${x.dateTime.getUTCFullYear()}`, newestFirst: false, gameId: g.id });
    }
  }

  const known = new Set((await prisma.gameVideoCandidate.findMany({ select: { videoId: true } })).map((c) => c.videoId));
  const tally: Record<string, number> = {};
  let searched = 0, fetched = 0, throttled = false;
  const is429 = (e: unknown) => /\b429\b/.test((e as Error)?.message ?? '');
  for (const q of queries) {
    if (throttled) break;
    let hits;
    try { hits = await searchYouTube(q.q, { newestFirst: q.newestFirst }); searched++; }
    catch (e) {
      console.error(`search failed "${q.q}": ${(e as Error).message}`);
      if (is429(e)) { throttled = true; break; } // YouTube is rate-limiting us — stop, the next run continues
      await sleep(5000); continue;
    }
    if (q.gameId && !DRY && !throttled) await prisma.game.update({ where: { id: q.gameId }, data: { videoScannedAt: new Date() } });
    for (const h of hits.slice(0, 20)) {
      if (known.has(h.videoId) || !mentionsHbs(h.title)) continue;
      known.add(h.videoId);
      await sleep(1200);
      let meta;
      try { meta = await fetchVideoMeta(h.videoId); fetched++; }
      catch (e) {
        if (is429(e)) { console.error('YouTube 429 — stopping this run'); throttled = true; break; }
        continue;
      }
      if (!meta) continue;
      if (DRY) {
        const r = matchVideo(meta, games);
        if (r.candidates[0]) console.log(`[${r.confidence}/${r.kind}] ${meta.title}\n    → ${label(r.candidates[0].gameId)} (${r.why})`);
        continue;
      }
      const { result, status } = await recordVideo(meta, games, 'scan');
      tally[status ?? 'skip'] = (tally[status ?? 'skip'] ?? 0) + 1;
      if (status === 'AUTO' || status === 'PENDING') {
        console.log(`${status} [${result.kind}] ${meta.title}\n    → ${label(result.candidates[0].gameId)} (${result.why})`);
      }
    }
    await sleep(1500);
  }
  console.log(`${new Date().toISOString()}${throttled ? ' THROTTLED' : ''} queries=${searched}/${queries.length} videos=${fetched} ${JSON.stringify(tally)}`);
  await prisma.$disconnect();
})().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
