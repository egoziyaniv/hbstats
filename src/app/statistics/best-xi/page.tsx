import Link from 'next/link';
import prisma from '@/lib/prisma';
import { buildSeasonXi, buildMatchdayXi, listSeasonMatchdays } from '@/lib/player-ratings';
import { BestXiPitch } from '@/components/BestXiPitch';

export const dynamic = 'force-dynamic';

type Mode = 'season' | 'matchday';

export default async function BestXiPage({ searchParams }: { searchParams: { season?: string; mode?: string; round?: string } }) {
  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' }, take: 8 });
  const selectedSeason = searchParams.season
    ? seasons.find((s) => s.id === searchParams.season) || seasons[0]
    : seasons[0];

  const matchdays = await listSeasonMatchdays(selectedSeason.id);
  const mode: Mode = searchParams.mode === 'matchday' ? 'matchday' : 'season';
  const selectedRound = mode === 'matchday'
    ? (searchParams.round && matchdays.find((m) => m.roundNameEn === searchParams.round)
      ? searchParams.round
      : (matchdays[0]?.roundNameEn || ''))
    : null;

  const lineup = mode === 'matchday' && selectedRound
    ? await buildMatchdayXi(selectedSeason.id, selectedRound)
    : await buildSeasonXi(selectedSeason.id);

  const selectedMatchday = selectedRound ? matchdays.find((m) => m.roundNameEn === selectedRound) : null;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-5">
        <header>
          <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">הרכב מצטיינים</h1>
          <p className="mt-1 text-sm text-stone-600">
            הרכב מחזור — 11 השחקנים המצטיינים של המחזור.<br />
            הרכב עונה — מצטבר: סכום ציוני המשחק חלקי מחזורי הליגה ששוחקו.
          </p>
        </header>

        <nav className="flex flex-wrap gap-2">
          {seasons.map((s) => (
            <Link
              key={s.id}
              href={`/statistics/best-xi?season=${s.id}${mode === 'matchday' ? '&mode=matchday' : ''}`}
              className={`rounded-full px-3 py-1 text-sm font-bold ${s.id === selectedSeason.id ? 'bg-[var(--accent)] text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
            >
              {s.name}
            </Link>
          ))}
        </nav>

        <div className="rounded-2xl border border-stone-200 bg-white p-1 shadow-sm">
          <div className="grid grid-cols-2 gap-1">
            <Link
              href={`/statistics/best-xi?season=${selectedSeason.id}`}
              className={`rounded-xl px-4 py-2 text-center text-sm font-black ${mode === 'season' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}
            >
              הרכב העונה
            </Link>
            <Link
              href={`/statistics/best-xi?season=${selectedSeason.id}&mode=matchday`}
              className={`rounded-xl px-4 py-2 text-center text-sm font-black ${mode === 'matchday' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}
            >
              הרכב המחזור
            </Link>
          </div>
        </div>

        {mode === 'matchday' && matchdays.length > 0 ? (
          <div className="rounded-xl bg-white/70 px-3 py-2 backdrop-blur">
            <div className="mb-1 text-xs font-bold text-stone-500">בחר מחזור:</div>
            <div className="flex flex-wrap gap-1.5">
              {matchdays.slice(0, 24).map((m) => (
                <Link
                  key={m.roundNameEn}
                  href={`/statistics/best-xi?season=${selectedSeason.id}&mode=matchday&round=${encodeURIComponent(m.roundNameEn)}`}
                  className={`rounded px-2 py-1 text-xs font-bold ${m.roundNameEn === selectedRound ? 'bg-[var(--accent)] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
                >
                  {m.roundNameHe || m.roundNameEn}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {selectedMatchday ? (
          <p className="text-center text-xs text-stone-500">
            {selectedMatchday.roundNameHe || selectedMatchday.roundNameEn} · {selectedMatchday.gamesPlayed} משחקים
          </p>
        ) : null}

        {lineup.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
            עדיין אין מספיק נתוני ציון לבניית הרכב. הציון נצבר ממקורות מרובים ויתעדכן בהדרגה.
          </div>
        ) : (
          <BestXiPitch players={lineup} />
        )}
      </div>
    </div>
  );
}
