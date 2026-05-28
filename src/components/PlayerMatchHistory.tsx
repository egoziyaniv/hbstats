'use client';

/**
 * PlayerMatchHistory — rating chart over the last N matches + a compact stats
 * table per match. Uses API-Football per-match stats (GamePlayerStats).
 */

import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface MatchHistoryEntry {
  gameId: string;
  date: string;
  opponent: string;
  scoreLine: string;
  rating: number | null;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shotsOn: number | null;
  shotsTotal: number | null;
  passesKey: number | null;
  duelsWon: number | null;
  duelsTotal: number | null;
}

function ratingBg(rating: number): string {
  if (rating >= 8) return 'bg-emerald-600';
  if (rating >= 7) return 'bg-amber-500';
  if (rating >= 6) return 'bg-stone-500';
  return 'bg-red-500';
}

function ratingFill(rating: number): string {
  if (rating >= 8) return '#059669';
  if (rating >= 7) return '#d97706';
  if (rating >= 6) return '#78716c';
  return '#dc2626';
}

export function PlayerMatchHistory({ entries }: { entries: MatchHistoryEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-stone-500">אין נתונים מפורטים פר-משחק לשחקן זה.</p>;
  }
  const chartData = [...entries].reverse().slice(-15).map((e) => ({
    name: e.date.slice(5),
    rating: e.rating ?? 0,
    fill: e.rating != null ? ratingFill(e.rating) : '#d6d3d1',
  }));

  return (
    <div>
      <div className="mb-4 h-[220px] w-full" dir="ltr">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: '1px solid #e7e5e4', fontSize: 12 }}
              formatter={(value: number) => [value.toFixed(1), 'דירוג']}
              labelFormatter={(label) => `מ-${label}`}
            />
            <Bar dataKey="rating" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs font-bold text-stone-500">
              <th className="px-3 py-2">תאריך</th>
              <th className="px-3 py-2">משחק</th>
              <th className="px-3 py-2 text-center">דירוג</th>
              <th className="px-3 py-2 text-center">דק'</th>
              <th className="px-3 py-2 text-center">⚽</th>
              <th className="px-3 py-2 text-center">🅰</th>
              <th className="px-3 py-2 text-center">בעיטות</th>
              <th className="px-3 py-2 text-center">מסי' מפתח</th>
              <th className="px-3 py-2 text-center">דו-קרבות</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.gameId} className="border-b border-stone-100 hover:bg-stone-50">
                <td className="px-3 py-2 text-xs text-stone-600" dir="ltr">{e.date}</td>
                <td className="px-3 py-2 text-stone-900">
                  <a href={`/games/${e.gameId}`} className="hover:underline">{e.opponent} <span className="text-stone-400" dir="ltr">{e.scoreLine}</span></a>
                </td>
                <td className="px-3 py-2 text-center">
                  {e.rating != null ? (
                    <span className={`inline-flex h-6 w-10 items-center justify-center rounded-md text-[11px] font-black text-white ${ratingBg(e.rating)}`}>
                      {e.rating.toFixed(1)}
                    </span>
                  ) : <span className="text-stone-300">—</span>}
                </td>
                <td className="px-3 py-2 text-center text-stone-700">{e.minutes ?? '—'}</td>
                <td className="px-3 py-2 text-center font-bold text-stone-900">{e.goals || ''}</td>
                <td className="px-3 py-2 text-center font-bold text-stone-900">{e.assists || ''}</td>
                <td className="px-3 py-2 text-center text-stone-600 text-xs">
                  {e.shotsTotal != null ? `${e.shotsOn ?? 0}/${e.shotsTotal}` : '—'}
                </td>
                <td className="px-3 py-2 text-center text-stone-700">{e.passesKey ?? '—'}</td>
                <td className="px-3 py-2 text-center text-stone-600 text-xs">
                  {e.duelsTotal != null ? `${e.duelsWon ?? 0}/${e.duelsTotal}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
