/**
 * PlayerRatingsTable — per-player FotMob ratings + advanced stats for a game
 * (xG, xA, xG+xA, defensive actions). Both teams, sorted by rating; team shown
 * by a colour dot. Server component.
 */
export type PlayerRatingRow = {
  isHome: boolean;
  name: string;
  isGK: boolean;
  rating: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  xg: number | null;
  xa: number | null;
  xgxa: number | null;
  shots: number | null;
  chancesCreated: number | null;
  defActions: number | null;
};

const HOME = '#e11d48';
const AWAY = '#2563eb';

function ratingClass(r: number) {
  if (r >= 8) return 'bg-blue-600 text-white';
  if (r >= 7) return 'bg-emerald-500 text-white';
  if (r >= 6) return 'bg-amber-400 text-stone-900';
  return 'bg-orange-500 text-white';
}
const n2 = (v: number | null) => (v == null ? '—' : v.toFixed(2));
const n0 = (v: number | null) => (v == null ? '—' : String(v));

export function PlayerRatingsTable({ players, homeName, awayName }: { players: PlayerRatingRow[]; homeName: string; awayName: string }) {
  if (!players || players.length === 0) return null;
  const rows = [...players].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  const topRating = rows.length ? rows[0].rating ?? 0 : 0;

  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">דירוגי שחקנים</h2>
        <div className="flex items-center gap-3 text-xs font-bold">
          <span className="flex items-center gap-1.5 text-stone-700"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: HOME }} />{homeName}</span>
          <span className="flex items-center gap-1.5 text-stone-700"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: AWAY }} />{awayName}</span>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="px-2 py-2.5 text-right font-bold">שחקן</th>
              <th className="px-2 py-2.5 font-bold">דירוג</th>
              <th className="px-2 py-2.5 font-bold">דק׳</th>
              <th className="px-2 py-2.5 font-bold">ש׳</th>
              <th className="px-2 py-2.5 font-bold">ב׳</th>
              <th className="px-2 py-2.5 font-bold">xG</th>
              <th className="px-2 py-2.5 font-bold">xA</th>
              <th className="px-2 py-2.5 font-bold">xG+xA</th>
              <th className="px-2 py-2.5 font-bold">הגנה</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={i} className="border-b border-stone-100 last:border-0">
                <td className="px-2 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: p.isHome ? HOME : AWAY }} />
                    <span className="font-semibold text-stone-800">{p.name}{p.isGK ? ' (ש)' : ''}</span>
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  {p.rating != null ? (
                    <span className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-black ${ratingClass(p.rating)}`}>
                      {p.rating.toFixed(1)}{p.rating === topRating && topRating >= 7 ? ' ★' : ''}
                    </span>
                  ) : '—'}
                </td>
                <td className="px-2 py-2.5 text-stone-600">{n0(p.minutes)}</td>
                <td className="px-2 py-2.5 font-semibold text-stone-800">{n0(p.goals)}</td>
                <td className="px-2 py-2.5 font-semibold text-stone-800">{n0(p.assists)}</td>
                <td className="px-2 py-2.5 text-stone-600">{n2(p.xg)}</td>
                <td className="px-2 py-2.5 text-stone-600">{n2(p.xa)}</td>
                <td className="px-2 py-2.5 text-stone-600">{n2(p.xgxa)}</td>
                <td className="px-2 py-2.5 text-stone-600">{n0(p.defActions)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
