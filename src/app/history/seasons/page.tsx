import Link from 'next/link';
import type { Metadata } from 'next';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'כל העונות — ליגת העל | StatsAI',
  description: 'אלופות, מלכי שערים ויורדות בכל עונה של ליגת העל הישראלית מאז 2000.',
};

export default async function SeasonsSpinePage() {
  const rows = await getSeasonsSpine();
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">כל העונות</h1>
      <p className="mt-2 text-sm text-stone-500">
        ליגת העל · {rows.length} עונות · כל שם הוא קישור ·{' '}
        <Link href="/history/all-time" className="font-bold text-[var(--accent)]">טבלת כל הזמנים ←</Link>
      </p>
      {rows.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">אין נתונים להצגה.</p>
      ) : (
      <div className="mt-6 overflow-x-auto rounded-[24px] border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
              <th className="px-4 py-3">עונה</th>
              <th className="px-4 py-3">אלופה</th>
              <th className="px-4 py-3">סגנית</th>
              <th className="px-4 py-3">מלך השערים</th>
              <th className="px-4 py-3">יורדות</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.seasonId} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                <td className="px-4 py-3 font-black text-stone-900">{row.name}</td>
                <td className="px-4 py-3">
                  {row.champion ? (
                    <Link href={`/teams/${row.champion.teamId}`} className="font-bold text-stone-900 hover:text-[var(--accent)]">
                      🏆 {row.champion.nameHe}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  {row.runnerUp ? (
                    <Link href={`/teams/${row.runnerUp.teamId}`} className="text-stone-700 hover:text-[var(--accent)]">
                      {row.runnerUp.nameHe}
                    </Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3">
                  {row.topScorer ? (
                    row.topScorer.playerId ? (
                      <Link href={`/players/${row.topScorer.playerId}`} className="text-stone-700 hover:text-[var(--accent)]">
                        {row.topScorer.nameHe} · {row.topScorer.goals}
                      </Link>
                    ) : `${row.topScorer.nameHe} · ${row.topScorer.goals}`
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-stone-500">{row.relegated.map((r) => r.nameHe).join(', ') || '—'}</td>
                <td className="px-4 py-3">
                  {/* /standings expects the season ID (standings/page.tsx:153), not the year */}
                  <Link href={`/standings?season=${row.seasonId}`} className="text-xs font-bold text-[var(--accent)]">
                    ← טבלה מלאה
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
