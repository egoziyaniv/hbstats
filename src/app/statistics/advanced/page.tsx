import Link from 'next/link';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const METRIC_LABELS: Record<string, { title: string; col: string }> = {
  passesKey: { title: 'מסירות מפתח', col: 'passesKey' },
  duelsWon: { title: 'דו-קרבות שזכה', col: 'duelsWon' },
  dribblesSuccess: { title: 'דריבלים מוצלחים', col: 'dribblesSuccess' },
};

type LeaderboardRow = {
  canonicalId: string;
  name: string;
  team: string;
  value: number;
  matches: number;
};

type BreakdownRow = {
  gameId: string;
  date: string;
  opponent: string;
  scoreLine: string;
  value: number;
  rating: number | null;
  minutes: number | null;
};

async function buildBreakdown(seasonId: string, canonicalId: string, metric: keyof typeof METRIC_LABELS): Promise<{ name: string; rows: BreakdownRow[] }> {
  const col = METRIC_LABELS[metric].col;
  // All linked Player records sharing this canonical
  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalId }, { canonicalPlayerId: canonicalId }] },
    select: { id: true, nameHe: true, nameEn: true },
  });
  const linkedIds = linked.map((p) => p.id);
  const name = linked.find((p) => p.nameHe)?.nameHe || linked[0]?.nameEn || '—';
  const rows = await prisma.$queryRawUnsafe<Array<{ gameId: string; dateTime: Date; home: string; away: string; homeScore: number | null; awayScore: number | null; value: number; rating: number | null; minutes: number | null }>>(`
    SELECT
      gs."gameId",
      g."dateTime",
      COALESCE(ht."nameHe", ht."nameEn") AS home,
      COALESCE(at."nameHe", at."nameEn") AS away,
      g."homeScore", g."awayScore",
      COALESCE(gs."${col}", 0)::int AS value,
      gs.rating,
      gs.minutes
    FROM "game_player_stats" gs
    JOIN "games" g ON g.id = gs."gameId"
    LEFT JOIN "teams" ht ON ht.id = g."homeTeamId"
    LEFT JOIN "teams" at ON at.id = g."awayTeamId"
    WHERE g."seasonId" = $1
      AND gs."playerId" = ANY($2::text[])
      AND COALESCE(gs."${col}", 0) > 0
    ORDER BY g."dateTime" DESC
  `, seasonId, linkedIds);

  return {
    name,
    rows: rows.map((r) => ({
      gameId: r.gameId,
      date: r.dateTime.toISOString().slice(0, 10),
      opponent: `${r.home} - ${r.away}`,
      scoreLine: r.homeScore != null && r.awayScore != null ? `${r.homeScore}-${r.awayScore}` : '',
      value: r.value,
      rating: r.rating,
      minutes: r.minutes,
    })),
  };
}

// Map UI position group → which Player.position values qualify.
const POSITION_FILTERS: Record<string, string[]> = {
  GK: ['Goalkeeper', 'GK'],
  DEF: ['Defender', 'D', 'CB', 'LB', 'RB'],
  MID: ['Midfielder', 'M', 'CM', 'CDM', 'CAM'],
  FWD: ['Attacker', 'F', 'ST', 'CF', 'LW', 'RW'],
};

async function buildLeaderboard(seasonId: string, metric: 'passesKey' | 'duelsWon' | 'dribblesSuccess', position: string | null, limit = 20): Promise<LeaderboardRow[]> {
  // Aggregate GamePlayerStats by canonical player for the season, sorted by metric.
  const posList = position && POSITION_FILTERS[position] ? POSITION_FILTERS[position] : null;
  const posClause = posList ? `AND p.position = ANY($3)` : '';
  const args: unknown[] = [seasonId, limit];
  if (posList) args.push(posList);
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
    WHERE gs."${metric}" IS NOT NULL ${posClause}
    GROUP BY canon
    HAVING SUM(COALESCE(gs."${metric}", 0)) > 0
    ORDER BY total DESC
    LIMIT $2
  `, ...args);
  return rows.map((r) => ({ canonicalId: r.canon, name: r.name || '—', team: r.team || '—', value: r.total, matches: r.matches }));
}

export default async function AdvancedStatsPage({ searchParams }: { searchParams?: { season?: string; player?: string; metric?: string; pos?: string } }) {
  const seasons = await prisma.season.findMany({ where: { year: { gte: 2016 } }, orderBy: { year: 'desc' }, select: { id: true, name: true, year: true } });
  const selected = (searchParams?.season && seasons.find((s) => s.id === searchParams.season)) || seasons[0];
  const position = searchParams?.pos && ['GK', 'DEF', 'MID', 'FWD'].includes(searchParams.pos) ? searchParams.pos : null;

  const breakdownMetric = searchParams?.metric && METRIC_LABELS[searchParams.metric] ? (searchParams.metric as keyof typeof METRIC_LABELS) : null;
  const breakdown = searchParams?.player && breakdownMetric
    ? await buildBreakdown(selected.id, searchParams.player, breakdownMetric)
    : null;

  const [keyPasses, duels, dribbles] = await Promise.all([
    buildLeaderboard(selected.id, 'passesKey', position),
    buildLeaderboard(selected.id, 'duelsWon', position),
    buildLeaderboard(selected.id, 'dribblesSuccess', position),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8" dir="rtl">
      <header className="mb-6">
        <h1 className="text-3xl font-black text-stone-900">סטטיסטיקה מתקדמת</h1>
        <p className="mt-1 text-sm text-stone-500">מבוסס על נתונים פר-משחק. מסירות מפתח, דו-קרבות, דריבלים מוצלחים.</p>
      </header>

      <div className="mb-3 flex flex-wrap gap-2">
        {seasons.map((s) => (
          <Link
            key={s.id}
            href={`/statistics/advanced?season=${s.id}${position ? `&pos=${position}` : ''}`}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${s.id === selected.id ? 'bg-[var(--accent)] text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
          >
            {s.name}
          </Link>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href={`/statistics/advanced?season=${selected.id}`}
          className={`rounded-full px-3 py-1 text-xs font-bold ${!position ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
        >
          הכל
        </Link>
        {[
          { id: 'GK', label: 'שוערים' },
          { id: 'DEF', label: 'הגנה' },
          { id: 'MID', label: 'קישור' },
          { id: 'FWD', label: 'התקפה' },
        ].map((p) => (
          <Link
            key={p.id}
            href={`/statistics/advanced?season=${selected.id}&pos=${p.id}`}
            className={`rounded-full px-3 py-1 text-xs font-bold ${position === p.id ? 'bg-stone-900 text-white' : 'bg-white text-stone-700 border border-stone-200'}`}
          >
            {p.label}
          </Link>
        ))}
      </div>

      {breakdown ? (
        <section className="mb-8 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-stone-900">פירוט: {METRIC_LABELS[breakdownMetric!].title} — {breakdown.name}</h2>
              <p className="mt-0.5 text-xs text-stone-500">סה"כ {breakdown.rows.reduce((s, r) => s + r.value, 0)} ב-{breakdown.rows.length} משחקים · {selected.name}</p>
            </div>
            <Link href={`/statistics/advanced?season=${selected.id}`} className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700 hover:bg-stone-200">סגור</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-right text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs font-bold text-stone-500">
                  <th className="px-3 py-2">תאריך</th>
                  <th className="px-3 py-2">משחק</th>
                  <th className="px-3 py-2 text-center">{METRIC_LABELS[breakdownMetric!].title}</th>
                  <th className="px-3 py-2 text-center">דירוג</th>
                  <th className="px-3 py-2 text-center">דק'</th>
                </tr>
              </thead>
              <tbody>
                {breakdown.rows.map((r) => (
                  <tr key={r.gameId} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="px-3 py-2 text-xs text-stone-600" dir="ltr">{r.date}</td>
                    <td className="px-3 py-2 text-stone-900">
                      <Link href={`/games/${r.gameId}`} className="hover:underline">{r.opponent} <span className="text-stone-400" dir="ltr">{r.scoreLine}</span></Link>
                    </td>
                    <td className="px-3 py-2 text-center font-black text-stone-900">{r.value}</td>
                    <td className="px-3 py-2 text-center text-stone-700">{r.rating != null ? r.rating.toFixed(1) : '—'}</td>
                    <td className="px-3 py-2 text-center text-stone-600">{r.minutes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <Board title="מסירות מפתח" subtitle="כל המסירות שיצרו הזדמנות" rows={keyPasses} unit="" metric="passesKey" seasonId={selected.id} />
        <Board title="דו-קרבות שזכה" subtitle="מספר הדו-קרבות שנוצחו" rows={duels} unit="" metric="duelsWon" seasonId={selected.id} />
        <Board title="דריבלים מוצלחים" subtitle="דריבלים שעברו את היריב" rows={dribbles} unit="" metric="dribblesSuccess" seasonId={selected.id} />
      </div>
    </main>
  );
}

function Board({ title, subtitle, rows, unit, metric, seasonId }: { title: string; subtitle: string; rows: LeaderboardRow[]; unit: string; metric: string; seasonId: string }) {
  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-black text-stone-900">{title}</h2>
      <p className="mt-1 text-xs text-stone-500">{subtitle} <span className="text-stone-400">· לחץ על שחקן לפירוט פר-משחק</span></p>
      {rows.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">אין נתונים זמינים.</p>
      ) : (
        <ol className="mt-4 divide-y divide-stone-100">
          {rows.map((row, i) => (
            <li key={row.canonicalId}>
              <Link
                href={`/statistics/advanced?season=${seasonId}&player=${row.canonicalId}&metric=${metric}`}
                className="flex items-center justify-between gap-3 rounded-lg py-2 px-1 text-sm transition hover:bg-stone-50"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-center text-xs font-black text-stone-500">{i + 1}</span>
                  <div>
                    <div className="font-semibold text-stone-900">{row.name}</div>
                    <div className="text-[11px] text-stone-500">{row.team} · {row.matches} משחקים</div>
                  </div>
                </div>
                <span className="text-lg font-black text-stone-900">
                  {row.value.toLocaleString('he')}
                  {unit ? <span className="ml-0.5 text-xs font-medium text-stone-400">{unit}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
