import Link from 'next/link';
import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { RECORD_CATEGORIES } from '@/lib/history/records-engine';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ספר השיאים — כל ההיסטוריה | StatsAI',
  description: 'השיאים הגדולים של ליגת העל הישראלית — הניצחון הגדול ביותר, השער המהיר ביותר, הרצפים הארוכים ביותר ועוד.',
};

function buildHref(cat: string): string {
  const usp = new URLSearchParams();
  usp.set('cat', cat);
  return `/history/records?${usp.toString()}`;
}

// Date-only display, string-derived — never toLocaleDateString (locale/TZ
// dependent and can shift the day). Mirrors the engine's own formatHeDate.
function formatHeDate(d: Date): string {
  const [y, m, day] = d.toISOString().slice(0, 10).split('-');
  return `${Number(day)}.${Number(m)}.${y}`;
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams?: { cat?: string };
}) {
  const catParam = searchParams?.cat;
  const activeCategory = RECORD_CATEGORIES.find((c) => c.key === catParam) ?? RECORD_CATEGORIES[0];

  const rows = activeCategory
    ? await prisma.recordEntry.findMany({
        where: { category: activeCategory.key, scope: 'league' },
        orderBy: { rank: 'asc' },
      })
    : [];

  const latestComputedAt = rows.reduce<Date | null>(
    (max, r) => (!max || r.computedAt > max ? r.computedAt : max),
    null,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">ספר השיאים</h1>
      <p className="mt-2 text-sm text-stone-500">
        השיאים הגדולים של ליגת העל הישראלית ·{' '}
        <Link href="/history/seasons" className="font-bold text-[var(--accent)]">כל העונות ←</Link>
        {' · '}
        <Link href="/history/all-time" className="font-bold text-[var(--accent)]">טבלת כל הזמנים ←</Link>
      </p>

      <div className="mt-6 flex flex-wrap gap-1.5 rounded-[20px] border border-stone-200 bg-white p-1.5 shadow-sm">
        {RECORD_CATEGORIES.map((cat) => {
          const active = cat.key === activeCategory?.key;
          return (
            <Link
              key={cat.key}
              href={buildHref(cat.key)}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                active ? 'bg-[var(--accent)] text-white' : 'text-stone-600 hover:bg-stone-100'
              }`}
            >
              {cat.titleHe}
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">ספר השיאים טרם נבנה — הריצו עדכון מהאדמין.</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-[24px] border border-stone-200 bg-white shadow-sm">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className={`flex items-center gap-4 px-4 py-3 ${i === rows.length - 1 ? '' : 'border-b border-stone-100'}`}
            >
              <span className="w-6 shrink-0 text-center text-sm font-black text-stone-400">{row.rank}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-stone-900">
                  {row.playerId ? (
                    <Link href={`/players/${row.playerId}`} className="hover:text-[var(--accent)]">{row.labelHe}</Link>
                  ) : row.gameId ? (
                    <Link href={`/games/${row.gameId}`} className="hover:text-[var(--accent)]">{row.labelHe}</Link>
                  ) : (
                    row.labelHe
                  )}
                </p>
                {row.detailHe ? <p className="mt-0.5 truncate text-xs text-stone-500">{row.detailHe}</p> : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-1 text-xs text-stone-400">
        {latestComputedAt ? <p>עודכן: {formatHeDate(latestComputedAt)}</p> : null}
        {activeCategory?.eventBased ? <p>נתוני אירועים מ-2006 ואילך</p> : null}
        {activeCategory?.ordered ? <p>רצפים מחושבים מעונות עם תאריכי משחק מלאים</p> : null}
      </div>
    </div>
  );
}
