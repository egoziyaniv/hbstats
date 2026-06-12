import prisma from '@/lib/prisma';

/**
 * Long-running fetch/scrape jobs run inside an HTTP request. If the process is
 * killed mid-job (a deploy `pm2 restart`, OOM, crash), the row is left RUNNING
 * forever — there is no other code path that ever marks it failed. This sweep
 * marks such stale rows FAILED so the admin UI reflects reality and a future
 * "is a job already running?" guard isn't wedged by a ghost.
 *
 * Thresholds are generous so a genuinely long job is never killed:
 *  - FetchJob heartbeats via updatedAt (advanced per step) → 60 min of silence.
 *  - ScrapeJob has no heartbeat (only startedAt/createdAt) and a full setup can
 *    run ~90 min → 4 hours.
 */
const FETCH_STALE_MINUTES = Number(process.env.FETCH_JOB_STALE_MIN || 60);
const SCRAPE_STALE_MINUTES = Number(process.env.SCRAPE_JOB_STALE_MIN || 240);

export async function sweepStaleJobs(): Promise<{ fetchJobs: number; scrapeJobs: number }> {
  const fetchCutoff = new Date(Date.now() - FETCH_STALE_MINUTES * 60_000);
  const scrapeCutoff = new Date(Date.now() - SCRAPE_STALE_MINUTES * 60_000);

  try {
    const [fetchRes, scrapeRes] = await prisma.$transaction([
      prisma.fetchJob.updateMany({
        where: { status: { in: ['PENDING', 'RUNNING'] }, updatedAt: { lt: fetchCutoff } },
        data: {
          status: 'FAILED',
          errorMessage: 'הופסק אוטומטית — העבודה נתקעה (ככל הנראה איתחול שרת באמצע ריצה).',
          finishedAt: new Date(),
        },
      }),
      prisma.scrapeJob.updateMany({
        // ScrapeJob has no updatedAt; fall back to startedAt, then createdAt.
        where: {
          status: { in: ['pending', 'running'] },
          OR: [
            { startedAt: { lt: scrapeCutoff } },
            { startedAt: null, createdAt: { lt: scrapeCutoff } },
          ],
        },
        data: { status: 'failed', finishedAt: new Date() },
      }),
    ]);
    return { fetchJobs: fetchRes.count, scrapeJobs: scrapeRes.count };
  } catch {
    // Never let a sweep failure break the page/endpoint that triggered it.
    return { fetchJobs: 0, scrapeJobs: 0 };
  }
}
