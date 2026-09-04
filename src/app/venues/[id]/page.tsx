import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buildVenueStats } from '@/lib/venue-stats';

export const dynamic = 'force-dynamic';

function heDate(iso: string): string {
  return new Date(iso).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export default async function VenuePage({ params }: { params: { id: string } }) {
  const s = await buildVenueStats(params.id);
  if (!s) notFound();

  const rec = s.bsRecord;
  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* hero */}
      <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
        {s.venue.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.venue.imageUrl} alt={s.venue.nameHe} className="h-48 w-full object-cover" />
        ) : (
          <div className="h-24 w-full bg-gradient-to-bl from-[var(--accent-deep)] to-[var(--accent)]" />
        )}
        <div className="p-6">
          <h1 className="text-2xl font-black text-stone-900">{s.venue.nameHe}</h1>
          <p className="mt-1 text-sm font-semibold text-stone-500">
            {[s.venue.cityHe, s.venue.capacity ? `${s.venue.capacity.toLocaleString('he-IL')} מושבים` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </section>

      {/* stat tiles */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
          <div className="text-xs font-bold text-stone-400">משחקים באצטדיון</div>
          <div className="mt-1 text-3xl font-black text-stone-900">{s.totalGames}</div>
        </div>
        {rec ? (
          <div className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold text-stone-400">מאזן הפועל ב״ש</div>
            <div className="mt-1 text-xl font-black text-stone-900">
              {rec.wins}<span className="text-sm text-stone-400"> נ׳ </span>
              {rec.draws}<span className="text-sm text-stone-400"> ת׳ </span>
              {rec.losses}<span className="text-sm text-stone-400"> ה׳</span>
            </div>
            <div className="mt-1 text-xs font-semibold text-stone-500">שערים {rec.goalsFor}:{rec.goalsAgainst}</div>
          </div>
        ) : null}
        {s.attendance ? (
          <div className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <div className="text-xs font-bold text-stone-400">קהל ממוצע</div>
            <div className="mt-1 text-3xl font-black text-stone-900">{s.attendance.avg.toLocaleString('he-IL')}</div>
            <div className="mt-1 text-xs font-semibold text-stone-500">שיא: {s.attendance.max.toLocaleString('he-IL')}</div>
          </div>
        ) : null}
        {s.biggestWin ? (
          <Link
            href={`/games/${s.biggestWin.gameId}`}
            className="modern-card rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm transition hover:border-amber-300"
          >
            <div className="text-xs font-bold text-amber-700">הניצחון הגדול</div>
            <div className="mt-1 text-2xl font-black text-stone-900">{s.biggestWin.scoreHe}</div>
            <div className="mt-1 truncate text-xs font-semibold text-stone-600">מול {s.biggestWin.opponentHe} · {heDate(s.biggestWin.dateISO)}</div>
          </Link>
        ) : null}
      </section>

      {/* games list */}
      {s.games.length ? (
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="mb-4 border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">משחקים באצטדיון</h2>
          <div className="divide-y divide-stone-100">
            {s.games.map((g) => (
              <Link key={g.id} href={`/games/${g.id}`} className="flex items-center gap-3 py-3 transition hover:bg-stone-50">
                <span className="w-20 shrink-0 text-xs font-semibold text-stone-400">{heDate(g.dateISO)}</span>
                <span className="flex-1 truncate text-right text-sm font-bold text-stone-800">{g.homeHe}</span>
                <span className="shrink-0 rounded-lg bg-stone-100 px-2.5 py-1 text-sm font-black text-stone-900">{g.homeScore}-{g.awayScore}</span>
                <span className="flex-1 truncate text-sm font-bold text-stone-800">{g.awayHe}</span>
                <span className="hidden w-24 shrink-0 truncate text-xs text-stone-400 sm:block">{g.competitionHe}</span>
                {g.attendance ? <span className="hidden w-16 shrink-0 text-xs text-stone-400 md:block">{g.attendance.toLocaleString('he-IL')}</span> : <span className="hidden w-16 md:block" />}
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
