import Link from 'next/link';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type LeaderboardRow = {
  canonicalId: string;
  name: string;
  team: string;
  value: number;
  matches: number;
};

async function buildLeaderboard(seasonId: string, metric: 'passesKey' | 'duelsWon' | 'dribblesSuccess', limit = 20): Promise<LeaderboardRow[]> {
  // Aggregate GamePlayerStats by canonical player for the season, sorted by metric.
  const rows = await prisma.$queryRawUnsafe<Array<{ canon: string; total: number; matches: number; name: string; team: string }>>(`
    SELECT
      COALESCE(p."canonicalPlayerId", p.id) AS canon,
      SUM(COALESCE(gs."${metric}", 0))::int AS total,
      COUNT(DISTINCT gs."gameId")::int AS matches,
      MAX(COALESCE(p."nameHe", p."nameEn", gs."playerName"))::text AS name,
      MAX(COALESCE(t."nameHe", t."nameEn"))::text AS team
    FROM "game_player_stats" gs
    JOIN "games" g ON g.id = gs."gameId" AND g."seasonId" = $1
    LEFT JOIN "players" p ON p.id = gs."playerId"
    LEFT JOIN "teams" t ON t.id = p."teamId"
    WHERE gs."${metric}" IS NOT NULL
    GROUP BY canon
    HAVING SUM(COALESCE(gs."${metric}", 0)) > 0
    ORDER BY total DESC
    LIMIT $2
  `, seasonId, limit);
  return rows.map((r) => ({ canonicalId: r.canon, name: r.name || '—', team: r.team || '—', value: r.total, matches: r.matches }));
}

export default async function AdvancedStatsPage({ searchParams }: { searchParams?: { season?: string } }) {
  const seasons = await prisma.season.findMany({ where: { year: { gte: 2016 } }, orderBy: { year: 'desc' }, select: { id: true, name: true, year: true } });
  const selected = (searchParams?.season && seasons.find((s) => s.id === searchParams.season)) || seasons[0];
  const [keyPasses, duels, dribbles] = await Promise.all([
    buildLeaderboard(selected.id, 'passesKey'),
    buildLeaderboard(selected.id, 'duelsWon'),
    buildLeaderboard(selected.id, 'dribblesSuccess'),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8" dir="rtl">
      <header className="mb-6">
        <h1 className="text-3xl font-black text-stone-900">סטטיסטיקה מתקדמת</h1>
        <p className="mt-1 text-sm text-stone-500">מבוסס על נתוני API-Football פר-משחק. מסירות מפתח, דו-קרבות, דריבלים מוצלחים.</p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {seasons.map((s) => (
          <Link
            key={s.id}
            href={`/statistics/advanced?season=${s.id}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${s.id === selected.id ? 'bg-[var(--accent)] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Board title="מסירות מפתח" subtitle="כל המסירות שיצרו הזדמנות" rows={keyPasses} unit="" />
        <Board title="דו-קרבות שזכה" subtitle="מספר הדו-קרבות שנוצחו" rows={duels} unit="" />
        <Board title="דריבלים מוצלחים" subtitle="דריבלים שעברו את היריב" rows={dribbles} unit="" />
      </div>
    </main>
  );
}

function Board({ title, subtitle, rows, unit }: { title: string; subtitle: string; rows: LeaderboardRow[]; unit: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-stone-900">{title}</h2>
      <p className="mt-1 text-xs text-stone-500">{subtitle}</p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">אין נתונים זמינים.</p>
      ) : (
        <ol className="mt-4 divide-y divide-stone-100">
          {rows.map((row, i) => (
            <li key={row.canonicalId} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="flex items-center gap-3">
                <span className="w-6 text-center text-xs font-black text-stone-500">{i + 1}</span>
                <div>
                  <Link href={`/players/${row.canonicalId}`} className="font-semibold text-stone-900 hover:underline">
                    {row.name}
                  </Link>
                  <div className="text-[11px] text-stone-500">{row.team} · {row.matches} משחקים</div>
                </div>
              </div>
              <span className="text-lg font-black text-stone-900">
                {row.value.toLocaleString('he')}
                {unit ? <span className="ml-0.5 text-xs font-medium text-stone-400">{unit}</span> : null}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
