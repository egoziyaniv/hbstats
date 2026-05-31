import Link from 'next/link';
import prisma from '@/lib/prisma';
import { buildBestXi } from '@/lib/best-xi';

export const dynamic = 'force-dynamic';

export default async function BestXiPage({ searchParams }: { searchParams: { season?: string } }) {
  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' }, take: 8 });
  const selectedSeason = searchParams.season
    ? seasons.find((s) => s.id === searchParams.season) || seasons[0]
    : seasons[0];
  const lineup = await buildBestXi(selectedSeason.id, 5);

  const sections: Array<{ label: string; cat: 'FWD' | 'MID' | 'DEF' | 'GK' }> = [
    { label: 'חלוצים', cat: 'FWD' },
    { label: 'קישור', cat: 'MID' },
    { label: 'הגנה', cat: 'DEF' },
    { label: 'שוער', cat: 'GK' },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">הרכב העונה</h1>
          <p className="mt-1 text-sm text-stone-600">11 השחקנים הכי מדורגים בעונה (לפי דירוג ממוצע ב-GamePlayerStats, מינ&apos; 5 משחקים)</p>
        </header>

        <nav className="flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/statistics/best-xi?season=${s.id}`}
              className={`rounded-full px-3 py-1 text-sm font-bold ${s.id === selectedSeason.id ? 'bg-[var(--accent)] text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>

        {lineup.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
            אין מספיק דירוגים בעונה זו עדיין. הנתונים מתקבלים מ-API-Football וממולאים בהדרגה.
          </div>
        ) : (
          <div className="space-y-5">
            {sections.map(({ label, cat }) => {
              const players = lineup.filter((p) => p.posCategory === cat);
              if (players.length === 0) return null;
              return (
                <section key={cat} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
                  <h2 className="mb-3 text-sm font-black text-stone-700">{label}</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    {players.map((p) => (
                      <Link key={p.playerId} href={`/players/${p.playerId}`} className="flex items-center gap-3 rounded-xl bg-stone-50 p-3 hover:bg-stone-100">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photoUrl} alt={p.displayName} className="h-12 w-12 rounded-full border border-stone-200 object-cover" />
                        ) : (
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-200 text-xs font-black text-stone-500">
                            {p.displayName.split(/\s+/).map((x) => x[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1">
                          <div className="text-sm font-black text-stone-900">{p.displayName}</div>
                          <div className="text-[11px] text-stone-500">{p.team}</div>
                          <div className="text-[10px] text-stone-400">{p.matches} משחקים</div>
                        </div>
                        <span className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-black text-white">
                          {p.avgRating}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
