import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { labelGames } from '@/lib/videos/service';
import VideosAdminClient, { type VideoRow } from '@/components/admin/VideosAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminVideosPage() {
  await requireAdminUser();
  const [pending, linked, counts] = await Promise.all([
    prisma.gameVideoCandidate.findMany({ where: { status: 'PENDING', gameId: { not: null } }, orderBy: [{ publishedAt: 'desc' }], take: 100 }),
    prisma.gameVideoCandidate.findMany({ where: { status: { in: ['AUTO', 'APPROVED'] } }, orderBy: { updatedAt: 'desc' }, take: 60 }),
    prisma.gameVideoCandidate.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const labels = await labelGames([...pending, ...linked].map((c) => c.gameId!).filter(Boolean));
  const toRow = (c: (typeof pending)[number]): VideoRow => ({
    id: c.id, videoId: c.videoId, title: c.title, channel: c.channel,
    publishedAt: c.publishedAt?.toISOString() ?? null, durationSec: c.durationSec,
    kind: c.kind as 'recap' | 'full', status: c.status, confidence: c.confidence, reason: c.reason,
    game: c.gameId ? labels.get(c.gameId) ?? null : null,
  });
  const count = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8" dir="rtl">
      <h1 className="text-3xl font-black text-stone-900">סרטוני משחקים</h1>
      <p className="mt-1 text-sm text-stone-600">
        סריקה יומית ביוטיוב מחפשת תקצירים ומשחקים מלאים של באר שבע ומשייכת אותם למשחק. התאמה ודאית
        (יריבה + תוצאה + תאריך) עולה לדף המשחק לבד; השאר ממתינים כאן לאישור.
        {' '}שויכו: {(count.AUTO ?? 0) + (count.APPROVED ?? 0)} · ממתינים: {pending.length} · נדחו: {count.REJECTED ?? 0}
      </p>
      <VideosAdminClient pending={pending.map(toRow)} linked={linked.map(toRow)} />
    </div>
  );
}
