import Link from 'next/link';
import { readFile, readdir, stat as fsStat } from 'node:fs/promises';
import path from 'node:path';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminFlashscoreClient from '@/components/AdminFlashscoreClient';

export const dynamic = 'force-dynamic';

// Inspect the latest cups/seasons queue log to detect which (slug, season) is
// currently mid-sync. Returns null when no queue has logged recently or all
// queues finished. The match is the most-recent "===== [N/M] SLUG / SEASON ====="
// line that does NOT have a matching "DONE" line after it.
async function detectCurrentSync(): Promise<{ key: string } | null> {
  try {
    const root = path.join(process.cwd(), 'logs', 'flashscore-queue');
    const entries = await readdir(root).catch(() => [] as string[]);
    if (entries.length === 0) return null;
    const stats = await Promise.all(
      entries.map(async (name) => {
        const p = path.join(root, name);
        const s = await fsStat(p).catch(() => null);
        return s ? { name, p, mtime: s.mtimeMs } : null;
      }),
    );
    const dirs = stats.filter((s): s is { name: string; p: string; mtime: number } => s !== null);
    dirs.sort((a, b) => b.mtime - a.mtime);
    // Look at the freshest directory; if its queue.log was touched in the last
    // 15 minutes consider the queue alive and parse its current entry.
    for (const d of dirs.slice(0, 3)) {
      const logPath = path.join(d.p, 'queue.log');
      const log = await readFile(logPath, 'utf8').catch(() => '');
      if (!log) continue;
      // Quick exit: queue ended cleanly.
      if (/===\s*(Cups queue|Flashscore queue|Current-season refresh)\s*(finished|complete)\s*===/i.test(log)) {
        continue;
      }
      // Find lines like `===== [N/M] slug / season =====` (no DONE).
      const lines = log.split('\n').reverse();
      for (const line of lines) {
        const m = line.match(/=====\s*\[\d+\/\d+\]\s+(\S+)\s*\/\s*([\d-]+)\s*=====\s*$/);
        if (m && !line.includes('DONE')) {
          return { key: `${m[1]} / ${m[2]}` };
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export default async function AdminFlashscorePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">צריך משתמש מנהל.</p>
          <div className="mt-6">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
          </div>
        </div>
      </div>
    );
  }

  // Quick stats so the user sees what's already in the archive.
  // - withEvents: any goal/card/sub event scraped (89% of cup matches have these).
  // - withStats:  xG / possession / shots etc. (Flashscore only covers these for
  //   league + late-round cup matches; early-round cup games skip this).
  const matches = await prisma.flashscoreScrapedMatch.findMany({ select: { leagueSlug: true, season: true, payload: true } });
  const buckets: Record<string, { season: string; baseSlug: string; total: number; withStats: number; withEvents: number }> = {};
  // Strip the trailing year suffix from the slug ("ligat-ha-al-2024-2025"
  // → "ligat-ha-al", "super-cup-2024" → "super-cup") so the same competition
  // groups together across seasons.
  function baseSlugOf(slug: string): string {
    return slug.replace(/-(19|20)\d{2}(-(19|20)\d{2})?$/, '');
  }
  // Fixed order so rows within a season read league → cups consistently.
  const COMPETITION_ORDER = ['ligat-ha-al', 'leumit-league', 'state-cup', 'super-cup', 'toto-cup', 'liga-alef-north', 'liga-alef-south'];
  function competitionRank(base: string): number {
    const idx = COMPETITION_ORDER.indexOf(base);
    return idx === -1 ? COMPETITION_ORDER.length : idx;
  }
  for (const m of matches) {
    const k = `${m.leagueSlug} / ${m.season}`;
    if (!buckets[k]) buckets[k] = { season: m.season, baseSlug: baseSlugOf(m.leagueSlug), total: 0, withStats: 0, withEvents: 0 };
    buckets[k].total += 1;
    const payload = m.payload as { stats?: unknown[]; events?: unknown[] } | null;
    if (Array.isArray(payload?.stats) && payload!.stats!.length > 0) buckets[k].withStats += 1;
    if (Array.isArray(payload?.events) && payload!.events!.length > 0) buckets[k].withEvents += 1;
  }
  const summary = Object.entries(buckets)
    .sort(([, a], [, b]) => {
      // Season DESC (latest first), then competition by fixed rank.
      const seasonCmp = b.season.localeCompare(a.season);
      if (seasonCmp !== 0) return seasonCmp;
      return competitionRank(a.baseSlug) - competitionRank(b.baseSlug);
    })
    .map(([k, v]) => ({ key: k, season: v.season, total: v.total, withStats: v.withStats, withEvents: v.withEvents }));

  const teamCount = await prisma.flashscoreScrapedTeam.count();
  const playerCount = await prisma.flashscoreScrapedPlayer.count();
  const transferCount = await prisma.flashscoreScrapedTransfer.count();
  const currentSync = await detectCurrentSync();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-stone-900">ייבוא Flashscore</h1>
          <Link href="/admin" className="text-sm font-bold text-stone-600 underline">חזרה לאדמין</Link>
        </div>

        <div className="mb-6 rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-stone-900">ארכיון נוכחי</h2>
          <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סך קבוצות סרוקות</div>
              <div className="text-2xl font-black text-stone-900">{teamCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סך שחקנים</div>
              <div className="text-2xl font-black text-stone-900">{playerCount}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סך העברות</div>
              <div className="text-2xl font-black text-stone-900">{transferCount}</div>
            </div>
          </div>
          {currentSync ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500" />
              </span>
              <div>
                <span className="font-bold text-emerald-900">מסונכרן עכשיו:</span>{' '}
                <code className="text-emerald-900" dir="ltr">{currentSync.key}</code>
              </div>
            </div>
          ) : null}
          {summary.length > 0 ? (
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">משחקים לפי ליגה/עונה</div>
              <table className="mt-2 w-full text-right text-sm">
                <thead className="bg-stone-100">
                  <tr>
                    <th className="px-3 py-2">ליגה / עונה</th>
                    <th className="px-3 py-2">סה"כ משחקים</th>
                    <th className="px-3 py-2">עם אירועים</th>
                    <th className="px-3 py-2">עם xG/סטטיסטיקה</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((s, i) => {
                    const eventsPct = s.total > 0 ? Math.round((s.withEvents / s.total) * 100) : 0;
                    const statsPct = s.total > 0 ? Math.round((s.withStats / s.total) * 100) : 0;
                    const isNewSeason = i === 0 || summary[i - 1].season !== s.season;
                    const isSyncing = currentSync?.key === s.key;
                    const baseRowClass = isNewSeason ? 'border-t-2 border-stone-300' : 'border-t border-stone-100';
                    return (
                      <tr key={s.key} className={`${baseRowClass}${isSyncing ? ' bg-emerald-50' : ''}`}>
                        <td className="px-3 py-2 font-bold">
                          {isSyncing ? <span className="me-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> : null}
                          {s.key}
                        </td>
                        <td className="px-3 py-2">{s.total}</td>
                        <td className="px-3 py-2">{s.withEvents} <span className="text-xs text-stone-500">({eventsPct}%)</span></td>
                        <td className="px-3 py-2">{s.withStats} <span className="text-xs text-stone-500">({statsPct}%)</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <AdminFlashscoreClient />
      </div>
    </div>
  );
}
