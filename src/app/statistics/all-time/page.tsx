import Link from 'next/link';
import { buildAllTimeLeaderboard, type AllTimeCategory } from '@/lib/all-time-stats';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

const CATEGORIES: Array<{ id: AllTimeCategory; label: string; suffix: string }> = [
  { id: 'TOP_SCORERS', label: 'מלכי שערים', suffix: 'שערים' },
  { id: 'TOP_ASSISTS', label: 'מלכי בישולים', suffix: 'בישולים' },
  { id: 'TOP_YELLOW_CARDS', label: 'כרטיסים צהובים', suffix: 'צהובים' },
  { id: 'TOP_RED_CARDS', label: 'כרטיסים אדומים', suffix: 'אדומים' },
];

export default async function AllTimeStatsPage({ searchParams }: { searchParams: { cat?: string } }) {
  const selected = (CATEGORIES.find((c) => c.id === searchParams.cat) || CATEGORIES[0]);
  const rows = await buildAllTimeLeaderboard(selected.id, 100);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">סטטיסטיקה היסטורית</h1>
          <p className="mt-1 text-sm text-stone-600">דירוג מצרפי לאורך כל העונות (Walla + IFA, 2000+)</p>
        </header>

        <nav className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Link
              key={c.id}
              href={`/statistics/all-time?cat=${c.id}`}
              className={`rounded-full px-4 py-1.5 text-sm font-bold ${c.id === selected.id ? 'bg-[var(--accent)] text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
            >
              {c.label}
            </Link>
          ))}
        </nav>

        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-stone-50 text-xs font-bold text-stone-600">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">שחקן</th>
                <th className="px-3 py-2">קבוצות</th>
                <th className="px-3 py-2 text-center">עונות</th>
                <th className="px-3 py-2 text-center">עונה הטובה</th>
                <th className="px-3 py-2 text-center">סה&quot;כ {selected.suffix}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.canonicalId} className="border-t border-stone-100 hover:bg-stone-50/60">
                  <td className="px-3 py-2 font-bold text-stone-400">{r.rank}</td>
                  <td className="px-3 py-2">
                    <Link href={`/players/${r.canonicalId}`} className="flex items-center gap-3 font-bold hover:text-[var(--accent)]">
                      {r.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photoUrl} alt={r.displayName} className="h-8 w-8 rounded-full border border-stone-200 object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100 text-[10px] font-black text-stone-500">
                          {r.displayName.split(/\s+/).map((p) => p[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                      )}
                      <span>{r.displayName}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs text-stone-600">{r.teams.join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-center">{r.seasons}</td>
                  <td className="px-3 py-2 text-center text-xs">
                    {r.bestSeason ? <span>{r.bestSeason.value} <span className="text-stone-400">({r.bestSeason.seasonName})</span></span> : '—'}
                  </td>
                  <td className="px-3 py-2 text-center text-base font-black text-stone-900">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
