import Link from 'next/link';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function AdminRatingsIndexPage({ searchParams }: { searchParams: { round?: string; season?: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen px-4 py-16 text-center">
        <h1 className="text-2xl font-black">נדרשת הרשאת אדמין</h1>
        <Link href="/admin" className="mt-4 inline-block rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">חזרה לאדמין</Link>
      </div>
    );
  }

  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' }, take: 5 });
  const selectedSeason = searchParams.season
    ? seasons.find((s) => s.id === searchParams.season) || seasons[0]
    : seasons[0];

  // Latest 40 completed games for this season; users typically rate from
  // newest to oldest.
  const games = await prisma.game.findMany({
    where: { seasonId: selectedSeason.id, status: 'COMPLETED' },
    include: {
      homeTeam: { select: { nameHe: true, nameEn: true, logoUrl: true } },
      awayTeam: { select: { nameHe: true, nameEn: true, logoUrl: true } },
      competition: { select: { nameHe: true } },
      _count: { select: { matchRatings: true } },
    },
    orderBy: { dateTime: 'desc' },
    take: 40,
  });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-stone-900">ניקוד שחקנים</h1>
            <p className="mt-1 text-sm text-stone-600">בחר משחק כדי לערוך/להוסיף ציונים מכל מקור.</p>
          </div>
          <Link href="/admin" className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">חזרה</Link>
        </header>

        <nav className="flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/admin/ratings?season=${s.id}`}
              className={`rounded-full px-3 py-1 text-sm font-bold ${s.id === selectedSeason.id ? 'bg-[var(--accent)] text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>

        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-stone-50 text-xs font-bold text-stone-600">
              <tr>
                <th className="px-3 py-2">תאריך</th>
                <th className="px-3 py-2">מחזור</th>
                <th className="px-3 py-2">משחק</th>
                <th className="px-3 py-2 text-center">תוצאה</th>
                <th className="px-3 py-2 text-center">ציונים</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => (
                <tr key={g.id} className="border-t border-stone-100 hover:bg-stone-50/60">
                  <td className="px-3 py-2 text-xs text-stone-500" dir="ltr">{g.dateTime.toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs text-stone-500">{g.roundNameHe || g.roundNameEn || '—'}</td>
                  <td className="px-3 py-2 font-bold">
                    {g.homeTeam.nameHe || g.homeTeam.nameEn} <span className="text-stone-400">vs</span> {g.awayTeam.nameHe || g.awayTeam.nameEn}
                  </td>
                  <td className="px-3 py-2 text-center font-black">{g.homeScore}-{g.awayScore}</td>
                  <td className="px-3 py-2 text-center text-xs">{g._count.matchRatings}</td>
                  <td className="px-3 py-2 text-left">
                    <Link href={`/admin/ratings/${g.id}`} className="rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">ערוך</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
