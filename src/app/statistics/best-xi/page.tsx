import Link from 'next/link';
import prisma from '@/lib/prisma';
import { buildBestXi } from '@/lib/best-xi';
import { BestXiPitch } from '@/components/BestXiPitch';

export const dynamic = 'force-dynamic';

export default async function BestXiPage({ searchParams }: { searchParams: { season?: string } }) {
  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' }, take: 8 });
  const selectedSeason = searchParams.season
    ? seasons.find((s) => s.id === searchParams.season) || seasons[0]
    : seasons[0];
  const lineup = await buildBestXi(selectedSeason.id);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">הרכב העונה</h1>
          <p className="mt-1 text-sm text-stone-600">11 השחקנים הכי מדורגים בעונה לפי דירוג ממוצע — מינימום 50% מהמשחקים של עומס שיא בעונה.</p>
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
          <BestXiPitch players={lineup} />
        )}
      </div>
    </div>
  );
}
