import Link from 'next/link';
import { buildClubSeasons } from '@/lib/club-hub';

export const dynamic = 'force-dynamic';

export default async function ClubSeasonsPage() {
  const seasons = await buildClubSeasons();

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900">עונה אחר עונה</h1>
        <p className="mt-1 text-sm font-semibold text-stone-500">מאזן הפועל באר שבע בליגת העל לאורך השנים — לחצו על עונה למשחקים שלה.</p>
      </div>

      {seasons.length === 0 ? (
        <div className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 text-center text-sm text-stone-500 shadow-sm">
          אין נתונים זמינים.
        </div>
      ) : (
        <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 text-xs font-bold text-stone-500">
                  <th className="px-3 py-3 text-right">עונה</th>
                  <th className="px-2 py-3 text-center">מיקום</th>
                  <th className="px-2 py-3 text-center">מ׳</th>
                  <th className="px-2 py-3 text-center">נ</th>
                  <th className="px-2 py-3 text-center">ת</th>
                  <th className="px-2 py-3 text-center">ה</th>
                  <th className="px-2 py-3 text-center">שערים</th>
                  <th className="px-2 py-3 text-center">נק׳</th>
                  <th className="px-3 py-3 text-right">תארים</th>
                </tr>
              </thead>
              <tbody>
                {seasons.map((s) => {
                  const champion = s.honors.includes('ליגת העל');
                  return (
                    <tr
                      key={s.seasonId}
                      className={`border-b border-stone-100 transition hover:bg-stone-50 ${champion ? 'bg-amber-50/60' : ''}`}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5 font-bold text-stone-900">
                        <Link href={`/games?season=${s.seasonId}&teamId=${s.teamId}`} className="hover:text-[var(--accent)] hover:underline">
                          {s.name}
                        </Link>
                      </td>
                      <td className="px-2 py-2.5 text-center font-black text-stone-900">
                        {s.position === 1 ? <span className="text-amber-600">1</span> : s.position}
                      </td>
                      <td className="px-2 py-2.5 text-center text-stone-500">{s.played}</td>
                      <td className="px-2 py-2.5 text-center text-stone-700">{s.wins}</td>
                      <td className="px-2 py-2.5 text-center text-stone-700">{s.draws}</td>
                      <td className="px-2 py-2.5 text-center text-stone-700">{s.losses}</td>
                      <td className="px-2 py-2.5 text-center text-stone-500">{s.goalsFor}:{s.goalsAgainst}</td>
                      <td className="px-2 py-2.5 text-center font-black text-stone-900">{s.points}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {s.honors.map((h) => (
                            <span key={h} className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">{h}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
