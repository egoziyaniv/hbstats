import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { isChatSqlPublic } from '@/lib/chat-sql/run';
import ChatSavedQueriesClient from '@/components/admin/ChatSavedQueriesClient';

export const dynamic = 'force-dynamic';

const TABS = { frequent: 'שאלות נפוצות', failed: 'כשלונות ו-👎', saved: 'שאלות שמורות' } as const;
type Tab = keyof typeof TABS;
type QueryLog = { sql: string; rows?: number; error?: string };

const usd = (n: number) => `$${n.toFixed(n < 1 ? 3 : 2)}`;
const when = (d: Date) => d.toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export default async function ChatQuestionsAdminPage({ searchParams }: { searchParams: Promise<{ tab?: string; pin?: string }> }) {
  await requireAdminUser();
  const { tab: rawTab, pin } = await searchParams;
  const tab: Tab = rawTab === 'failed' || rawTab === 'saved' ? rawTab : 'frequent';
  const dayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [today, month, total, groups, failed, saved, pinned] = await Promise.all([
    prisma.chatQuestion.aggregate({ where: { createdAt: { gte: dayStart } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.chatQuestion.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.chatQuestion.count(),
    tab === 'frequent'
      ? prisma.chatQuestion.groupBy({ by: ['normalized'], _count: { _all: true }, _max: { createdAt: true }, orderBy: [{ _count: { normalized: 'desc' } }, { _max: { createdAt: 'desc' } }], take: 60 })
      : Promise.resolve([]),
    tab === 'failed'
      ? prisma.chatQuestion.findMany({ where: { OR: [{ outcome: { in: ['failed', 'error', 'escalated'] } }, { feedback: -1 }] }, orderBy: { createdAt: 'desc' }, take: 80 })
      : Promise.resolve([]),
    prisma.chatSavedQuery.findMany({ orderBy: [{ hits: 'desc' }, { createdAt: 'desc' }] }),
    pin ? prisma.chatQuestion.findUnique({ where: { id: pin } }) : Promise.resolve(null),
  ]);
  const latest = tab === 'frequent'
    ? await prisma.chatQuestion.findMany({
        where: { normalized: { in: groups.map((g) => g.normalized) } },
        orderBy: { createdAt: 'desc' },
        distinct: ['normalized'],
      })
    : [];
  const byNorm = new Map(latest.map((q) => [q.normalized, q]));
  const lastSql = (queries: unknown) => ((queries as QueryLog[]) || []).filter((q) => !q.error).at(-1)?.sql ?? '';

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8" dir="rtl">
    <header className="rounded-[28px] bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] p-7 text-white shadow-md">
      <p className="text-sm font-bold text-red-200">עוזר הסטטיסטיקות</p>
      <h1 className="mt-2 text-3xl font-black">שאלות הצ'אט</h1>
      <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">
        כל שאלה שנשאלת נשמרת: התשובה, השאילתות שהורצו, המודל והעלות. שאלה נפוצה אפשר להפוך לשאלה שמורה — שאילתה מאומתת שעונה מיד, בלי שה-AI יכתוב SQL.
      </p>
      {!isChatSqlPublic() ? <p className="mt-3 rounded-xl bg-amber-500/20 px-3 py-2 text-sm font-bold text-amber-100">כרגע שאילתות על כל הנתונים פתוחות לאדמינים בלבד — עד שיוגדר משתמש ה-DB לקריאה בלבד (hbs_chat).</p> : null}
    </header>

    <section className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-2xl border border-stone-200 bg-white p-4"><strong className="block text-2xl font-black">{today._count._all}</strong><span className="text-sm text-stone-600">שאלות היום · {usd(today._sum.costUsd ?? 0)}</span></div>
      <div className="rounded-2xl border border-stone-200 bg-white p-4"><strong className="block text-2xl font-black">{month._count._all}</strong><span className="text-sm text-stone-600">החודש · {usd(month._sum.costUsd ?? 0)}</span></div>
      <div className="rounded-2xl border border-stone-200 bg-white p-4"><strong className="block text-2xl font-black">{total}</strong><span className="text-sm text-stone-600">סה"כ שאלות (שנה אחרונה)</span></div>
    </section>

    <nav className="flex flex-wrap gap-2">
      {(Object.keys(TABS) as Tab[]).map((t) => (
        <Link key={t} href={`/admin/chat-questions?tab=${t}`} className={`rounded-full px-4 py-2 text-sm font-bold ${tab === t ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
          {TABS[t]}{t === 'saved' ? ` (${saved.length})` : ''}
        </Link>
      ))}
    </nav>

    {tab === 'frequent' ? (
      !groups.length ? <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-600">עוד לא נשאלו שאלות.</p> : (
        <div className="space-y-3">
          {groups.map((g) => {
            const q = byNorm.get(g.normalized)!;
            const sql = lastSql(q.queries);
            return <article key={g.normalized} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="min-w-0 font-black text-stone-900">{q.question}</h2>
                <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-black">{g._count._all} פעמים · אחרונה {when(q.createdAt)}</span>
              </div>
              <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-stone-700">{q.answer || '—'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-stone-500">
                <span>{q.model}</span><span>· {q.outcome}</span><span>· {(q.latencyMs / 1000).toFixed(1)} שנ׳</span>
                {q.feedback ? <span>· {q.feedback > 0 ? '👍' : '👎'}</span> : null}
                {sql ? <Link href={`/admin/chat-questions?tab=saved&pin=${q.id}`} className="font-bold text-red-800 underline">הפוך לשאלה שמורה</Link> : null}
              </div>
              {sql ? <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-stone-50 p-2 text-left text-xs leading-5 text-stone-700" dir="ltr">{sql}</pre> : null}
            </article>;
          })}
        </div>
      )
    ) : null}

    {tab === 'failed' ? (
      !failed.length ? <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-600">אין כשלונות.</p> : (
        <div className="space-y-3">
          {failed.map((q) => (
            <article key={q.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h2 className="min-w-0 font-black text-stone-900">{q.question}</h2>
                <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-black text-rose-900">{q.feedback === -1 ? '👎' : q.outcome} · {q.model} · {when(q.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-stone-700">{q.answer || '—'}</p>
              {((q.queries as QueryLog[]) || []).map((x, i) => (
                <pre key={i} className={`mt-2 max-h-40 overflow-auto rounded-xl p-2 text-left text-xs leading-5 ${x.error ? 'bg-rose-50 text-rose-900' : 'bg-stone-50 text-stone-700'}`} dir="ltr">{x.sql}{x.error ? `\n-- ${x.error}` : `\n-- ${x.rows} rows`}</pre>
              ))}
            </article>
          ))}
        </div>
      )
    ) : null}

    {tab === 'saved' ? (
      <ChatSavedQueriesClient
        initial={JSON.parse(JSON.stringify(saved))}
        pinned={pinned ? { question: pinned.question, sql: lastSql(pinned.queries) } : null}
      />
    ) : null}
  </main>;
}
