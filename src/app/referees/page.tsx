import Link from 'next/link';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 3600;

export default async function RefereesStatsPage() {
  // For each referee: total games, plus aggregate yellow/red cards and goals
  // across their games. We pre-aggregate in SQL to keep the query cheap.
  const rows = await prisma.$queryRaw<Array<{
    referee_id: string;
    name_he: string | null;
    name_en: string;
    games: number;
    yellows: number;
    reds: number;
    pens: number;
    goals: number;
  }>>`
    SELECT
      r.id AS referee_id,
      r."nameHe" AS name_he,
      r."nameEn" AS name_en,
      COUNT(DISTINCT g.id)::int AS games,
      COUNT(*) FILTER (WHERE ge.type = 'YELLOW_CARD')::int AS yellows,
      COUNT(*) FILTER (WHERE ge.type = 'RED_CARD')::int AS reds,
      COUNT(*) FILTER (WHERE ge.type = 'PENALTY_GOAL')::int AS pens,
      COUNT(*) FILTER (WHERE ge.type IN ('GOAL', 'PENALTY_GOAL', 'OWN_GOAL'))::int AS goals
    FROM "referees" r
    LEFT JOIN "games" g ON g."refereeId" = r.id AND g.status = 'COMPLETED'
    LEFT JOIN "game_events" ge ON ge."gameId" = g.id
    GROUP BY r.id, r."nameHe", r."nameEn"
    HAVING COUNT(DISTINCT g.id) > 0
    ORDER BY COUNT(DISTINCT g.id) DESC
  `;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">שופטים</h1>
          <p className="mt-1 text-sm text-stone-600">סטטיסטיקה לכל שופט — כרטיסים, פנדלים ושערים פר משחק.</p>
        </header>

        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead className="bg-stone-50 text-xs font-bold text-stone-600">
              <tr>
                <th className="px-3 py-2">שופט</th>
                <th className="px-3 py-2 text-center">משחקים</th>
                <th className="px-3 py-2 text-center">צהובים</th>
                <th className="px-3 py-2 text-center">אדומים</th>
                <th className="px-3 py-2 text-center">פנדלים</th>
                <th className="px-3 py-2 text-center">צ/מ</th>
                <th className="px-3 py-2 text-center">שערים/מ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.referee_id} className="border-t border-stone-100 hover:bg-stone-50/60">
                  <td className="px-3 py-2 font-bold">{r.name_he || r.name_en}</td>
                  <td className="px-3 py-2 text-center font-bold">{r.games}</td>
                  <td className="px-3 py-2 text-center text-amber-700">{r.yellows}</td>
                  <td className="px-3 py-2 text-center text-red-700">{r.reds}</td>
                  <td className="px-3 py-2 text-center">{r.pens}</td>
                  <td className="px-3 py-2 text-center font-bold">{r.games > 0 ? (r.yellows / r.games).toFixed(1) : '—'}</td>
                  <td className="px-3 py-2 text-center font-bold">{r.games > 0 ? (r.goals / r.games).toFixed(1) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
