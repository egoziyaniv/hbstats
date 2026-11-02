import Link from 'next/link';
import { getLatestPublishedAnalysis } from '@/lib/match-analysis/public';

// Home teaser for the newest approved analysis: the preview of a game this week, else the
// latest post-match piece. Shows the title and first item; the rest is on the game page.
export async function HomeAnalysisTeaser() {
  const a = await getLatestPublishedAnalysis().catch(() => null);
  if (!a || !a.paragraphs.length) return null;
  return (
    <Link href={`/games/${a.gameId}`} className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:bg-stone-50" dir="rtl">
      <div className="text-xs text-stone-400">{a.kind === 'PRE' ? 'לקראת המשחק · ניתוח' : 'ניתוח אחרי המשחק'}</div>
      {a.titleHe ? <div className="mt-1 font-black text-stone-900">{a.titleHe}</div> : null}
      <p className="mt-1 line-clamp-3 text-sm leading-6 text-stone-700">{a.paragraphs[0]}</p>
      <div className="mt-1 text-xs font-bold text-red-800">להמשך ←</div>
    </Link>
  );
}
