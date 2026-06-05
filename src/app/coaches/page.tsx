import Link from 'next/link';
import { buildCoachLeagueRanking } from '@/lib/coach-stats';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export const metadata = { title: 'דירוג מאמנים' };

export default async function CoachesRankingPage() {
  const coaches = await buildCoachLeagueRanking(30);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">דירוג מאמנים</h1>
            <p className="mt-1 text-sm text-stone-600">דירוג כל המאמנים בכדורגל הישראלי לפי נקודות למשחק — מינימום 30 משחקים.</p>
          </div>
          <span className="text-xs font-semibold text-stone-500">{coaches.length} מאמנים</span>
        </header>

        {coaches.length === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            עדיין אין נתונים. הרץ seed-coaches.js בשרת.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-right text-sm">
              <thead className="bg-stone-50 text-xs font-bold text-stone-600">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">מאמן</th>
                  <th className="px-3 py-2 text-center">משחקים</th>
                  <th className="px-3 py-2 text-center">נ&apos;</th>
                  <th className="px-3 py-2 text-center">ת&apos;</th>
                  <th className="px-3 py-2 text-center">ה&apos;</th>
                  <th className="px-3 py-2 text-center">% ניצחונות</th>
                  <th className="px-3 py-2 text-center">Pts/Game</th>
                </tr>
              </thead>
              <tbody>
                {coaches.map((c, i) => (
                  <tr key={c.coachId} className="border-t border-stone-100 hover:bg-stone-50/60">
                    <td className="px-3 py-2 font-bold text-stone-400">{i + 1}</td>
                    <td className="px-3 py-2">
                      <Link href={`/coaches/${c.coachId}`} className="flex items-center gap-3 hover:text-[var(--accent)]">
                        {c.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photoUrl} alt={c.displayName} className="h-10 w-10 rounded-full border border-stone-200 object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xs font-black text-stone-500">
                            {c.displayName.split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        <span className="font-bold">{c.displayName}</span>
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-center font-bold">{c.matches}</td>
                    <td className="px-3 py-2 text-center text-emerald-700">{c.wins}</td>
                    <td className="px-3 py-2 text-center text-stone-600">{c.draws}</td>
                    <td className="px-3 py-2 text-center text-red-700">{c.losses}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="rounded-md bg-red-50 px-2 py-0.5 font-bold text-red-700">{c.winPct}%</span>
                    </td>
                    <td className="px-3 py-2 text-center font-bold">{c.pointsPerGame.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
