import type { PublicAnalysis } from '@/lib/match-analysis/public';

// The owner-approved data column for a game. Standalone on the overview tab (post-match), or
// `embedded` inside the "לקראת המשחק" section, where it replaces the short AI paragraph.
export function MatchAnalysisBlock({ analysis, embedded = false }: { analysis: PublicAnalysis; embedded?: boolean }) {
  const body = (
    <>
      {analysis.titleHe ? <h3 className="text-base font-black text-stone-900">{analysis.titleHe}</h3> : null}
      <div className="mt-2 space-y-3 text-sm leading-7 text-stone-700">
        {analysis.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <p className="mt-3 text-xs text-stone-400">נכתב בעזרת AI מנתוני האתר ונבדק בידי העורך</p>
    </>
  );
  if (embedded) return <div className="rounded-[18px] bg-amber-50 px-4 py-3">{body}</div>;
  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm" dir="rtl">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-5 w-1 rounded bg-[var(--accent,#dc2626)]" />
        <h2 className="text-lg font-black text-stone-900">ניתוח</h2>
      </div>
      {body}
    </section>
  );
}
