import Link from 'next/link';
import { getLatestPublishedAnalysis } from '@/lib/match-analysis/public';
import { countAnalysesByStatus } from '@/lib/match-analysis/admin';

// Home teaser for the newest approved analysis: the preview of a game this week, else the
// latest post-match piece. Shows the title and first item; the rest is on the game page.
// Admins also get a notice when drafts await approval, with a link to the approval queue.
export async function HomeAnalysisTeaser({ isAdmin = false }: { isAdmin?: boolean }) {
  const [a, pending] = await Promise.all([
    getLatestPublishedAnalysis().catch(() => null),
    isAdmin ? countAnalysesByStatus().then((c) => c.DRAFT).catch(() => 0) : Promise.resolve(0),
  ]);
  const notice = pending > 0 ? (
    <Link href="/admin/analyses" className="block rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100" dir="rtl">
      {pending === 1 ? 'ניתוח אחד ממתין לאישור' : `${pending} ניתוחים ממתינים לאישור`} · לאישור באדמין ←
    </Link>
  ) : null;
  if (!a || !a.paragraphs.length) return notice;
  return (
    <div className="space-y-2">
      {notice}
      <Link href={`/games/${a.gameId}`} className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:bg-stone-50" dir="rtl">
        <div className="text-xs text-stone-400">{a.kind === 'PRE' ? 'לקראת המשחק · ניתוח' : 'ניתוח אחרי המשחק'}</div>
        {a.titleHe ? <div className="mt-1 font-black text-stone-900">{a.titleHe}</div> : null}
        <p className="mt-1 line-clamp-3 text-sm leading-6 text-stone-700">{a.paragraphs[0]}</p>
        <div className="mt-1 text-xs font-bold text-red-800">להמשך ←</div>
      </Link>
    </div>
  );
}
