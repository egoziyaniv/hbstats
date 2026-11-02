import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import { countAnalysesByStatus, listAdminAnalyses } from '@/lib/match-analysis/admin';

export const dynamic = 'force-dynamic';

const STATUSES = { DRAFT: 'ממתינים לאישור', PUBLISHED: 'פורסמו' } as const;
type Status = keyof typeof STATUSES;
const KIND_HE = { POST: 'אחרי המשחק', PRE: 'לקראת המשחק' } as const;

const dateHe = (iso: string) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' });

export default async function AdminAnalysesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminUser();
  const { status } = await searchParams;
  const selected: Status = status === 'PUBLISHED' ? 'PUBLISHED' : 'DRAFT';
  const [items, counts] = await Promise.all([listAdminAnalyses(selected), countAnalysesByStatus()]);

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8" dir="rtl">
    <header className="rounded-[28px] bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] p-7 text-white shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-red-200">תוכן</p>
          <h1 className="mt-2 text-3xl font-black">ניתוחי משחק</h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
            אחרי כל משחק רשמי נוצרים אוטומטית ניתוח המשחק וטור לקראת המשחק הבא. המספרים מחושבים מהנתונים, ה-AI רק מנסח. שום דבר לא מוצג באתר לפני אישור כאן.
          </p>
        </div>
        <Link href="/admin/content" className="rounded-xl border border-white/25 px-4 py-2 text-sm font-bold hover:bg-white/10">מרכז התוכן</Link>
      </div>
    </header>

    <nav className="grid gap-3 sm:grid-cols-2" aria-label="סינון ניתוחים">
      {(Object.keys(STATUSES) as Status[]).map((s) => (
        <Link key={s} href={`/admin/analyses?status=${s}`}
          className={`rounded-2xl border p-4 transition ${selected === s ? 'border-red-700 bg-red-700 text-white' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400'}`}>
          <strong className="block text-2xl font-black">{counts[s]}</strong>
          <span className="text-sm font-bold">{STATUSES[s]}</span>
        </Link>
      ))}
    </nav>

    {!items.length ? (
      <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-600">
        {selected === 'DRAFT' ? 'אין ניתוחים שממתינים לאישור.' : 'עוד לא פורסמו ניתוחים.'}
      </p>
    ) : (
      <div className="space-y-4">
        {items.map((a) => {
          const preview = a.bodyHe.split(/\n\s*\n/)[0]?.trim();
          const kept = a.facts.filter((f) => !f.removed).length;
          return (
            <article key={a.id} className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-stone-500">
                    {KIND_HE[a.kind]} · משחק {dateHe(a.gameDate)}
                    {a.publishedAt ? ` · פורסם ${dateHe(a.publishedAt)}` : ` · נוצר ${dateHe(a.updatedAt)}`}
                  </p>
                  <h2 className="mt-2 text-xl font-black text-stone-900">{a.headline}</h2>
                  {a.titleHe ? <p className="mt-1 font-bold text-stone-700">{a.titleHe}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black">
                  <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">{kept} עובדות</span>
                  {!a.bodyHe ? <span className="rounded-full bg-rose-100 px-3 py-1 text-rose-900">אין טקסט</span> : null}
                  {a.unknownNumbers.length ? <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">מספר לא מגובה: {a.unknownNumbers.join(', ')}</span> : null}
                  {a.scoreChanged ? <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">התוצאה השתנתה</span> : null}
                </div>
              </div>
              {preview ? <p className="mt-3 line-clamp-3 text-sm leading-7 text-stone-700">{preview}</p> : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={`/admin/games/${a.editorGameId}/analysis?kind=${a.kind}`} className="rounded-xl bg-red-800 px-4 py-2 text-sm font-black text-white">
                  {selected === 'DRAFT' ? 'לבדיקה ואישור' : 'לעריכה'}
                </Link>
                <Link href={`/games/${a.gameId}`} className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">לדף המשחק</Link>
              </div>
            </article>
          );
        })}
      </div>
    )}
  </main>;
}
