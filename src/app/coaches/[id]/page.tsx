import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildCoachProfile } from '@/lib/coach-stats';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function CoachProfilePage({ params }: { params: { id: string } }) {
  const { coach, tenures } = await buildCoachProfile(params.id);
  if (!coach) notFound();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <Link href="/coaches" className="text-xs font-semibold text-stone-500 hover:text-stone-800">‹ חזרה לדירוג מאמנים</Link>

        <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
            {coach.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coach.photoUrl} alt={coach.displayName} className="h-24 w-24 rounded-full border border-stone-200 object-cover" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-stone-100 text-2xl font-black text-stone-500">
                {coach.displayName.split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2)}
              </div>
            )}
            <div className="flex-1 text-center sm:text-right">
              <h1 className="text-3xl font-black text-stone-900">{coach.displayName}</h1>
              {coach.nameHe && coach.nameEn !== coach.displayName ? (
                <p className="text-sm text-stone-500" dir="ltr">{coach.nameEn}</p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-3 sm:justify-end">
                <span className="rounded-md bg-stone-100 px-2 py-1 text-sm font-bold">{coach.matches} משחקים</span>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-sm font-bold text-emerald-700">נ&apos; {coach.wins}</span>
                <span className="rounded-md bg-stone-50 px-2 py-1 text-sm font-bold text-stone-700">ת&apos; {coach.draws}</span>
                <span className="rounded-md bg-red-50 px-2 py-1 text-sm font-bold text-red-700">ה&apos; {coach.losses}</span>
                <span className="rounded-md bg-red-600 px-2 py-1 text-sm font-bold text-white">{coach.winPct}%</span>
                <span className="rounded-md bg-stone-900 px-2 py-1 text-sm font-bold text-white">{coach.pointsPerGame.toFixed(1)} Pts/Game</span>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <header className="border-b border-stone-100 p-4">
            <h2 className="text-lg font-black text-stone-900">קריירת אימון</h2>
            <p className="text-xs text-stone-500">פירוט לפי קבוצה ועונה — חדש למעלה</p>
          </header>
          <table className="w-full text-right text-sm">
            <thead className="bg-stone-50 text-xs font-bold text-stone-600">
              <tr>
                <th className="px-3 py-2">קבוצה</th>
                <th className="px-3 py-2">עונה</th>
                <th className="px-3 py-2 text-center">משחקים</th>
                <th className="px-3 py-2 text-center">נ&apos;-ת&apos;-ה&apos;</th>
                <th className="px-3 py-2 text-center">%</th>
                <th className="px-3 py-2 text-center">Pts/G</th>
              </tr>
            </thead>
            <tbody>
              {tenures.map((t) => (
                <tr key={`${t.teamId}-${t.seasonId}`} className="border-t border-stone-100 hover:bg-stone-50/60">
                  <td className="px-3 py-2">
                    <Link href={`/teams/${t.teamId}`} className="flex items-center gap-2 font-bold hover:text-[var(--accent)]">
                      {t.teamLogo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.teamLogo} alt={t.teamName} className="h-6 w-6 rounded" />
                      ) : null}
                      <span>{t.teamName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-bold text-stone-700">{t.seasonName}</td>
                  <td className="px-3 py-2 text-center">{t.matches}</td>
                  <td className="px-3 py-2 text-center text-stone-700">{t.wins}-{t.draws}-{t.losses}</td>
                  <td className="px-3 py-2 text-center font-bold">{t.winPct}%</td>
                  <td className="px-3 py-2 text-center">{t.pointsPerGame.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
