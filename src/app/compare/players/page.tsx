import Link from 'next/link';
import prisma from '@/lib/prisma';
import ComparePlayersPicker from '@/components/ComparePlayersPicker';

export const dynamic = 'force-dynamic';

interface PlayerStats {
  id: string;
  displayName: string;
  photoUrl: string | null;
  team: string;
  seasonName: string;
  matches: number;
  goals: number;
  assists: number;
  keyPasses: number;
  duelsWon: number;
  dribbles: number;
  minutes: number;
  avgRating: number | null;
}

async function fetchPlayerStats(playerId: string): Promise<PlayerStats | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true, nameHe: true, nameEn: true, photoUrl: true,
      canonicalPlayerId: true, apiFootballId: true, teamId: true,
      team: { select: { nameHe: true, nameEn: true, seasonId: true, season: { select: { name: true } } } },
    },
  });
  if (!player || !player.team) return null;

  // For the single (player, season) we picked: aggregate GamePlayerStats
  // joined to games in THIS season only. We deliberately do NOT cross seasons
  // here — the picker already represents the (player, season) tuple.
  const canonicalKey = player.canonicalPlayerId ?? player.id;
  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
    select: { id: true, apiFootballId: true },
  });
  const ids = linked.map((l) => l.id);
  const apiIds = linked.map((l) => l.apiFootballId).filter((v): v is number => typeof v === 'number');

  const agg = await prisma.gamePlayerStats.aggregate({
    where: {
      game: { seasonId: player.team.seasonId },
      OR: [
        ...(ids.length > 0 ? [{ playerId: { in: ids } }] : []),
        ...(apiIds.length > 0 ? [{ apiFootballPlayerId: { in: apiIds } }] : []),
      ],
    },
    _avg: { rating: true },
    _sum: { goals: true, assists: true, passesKey: true, duelsWon: true, dribblesSuccess: true, minutes: true },
    _count: { _all: true },
  });

  return {
    id: player.id,
    displayName: player.nameHe || player.nameEn,
    photoUrl: player.photoUrl,
    team: player.team.nameHe || player.team.nameEn,
    seasonName: player.team.season.name,
    matches: agg._count._all || 0,
    goals: agg._sum.goals || 0,
    assists: agg._sum.assists || 0,
    keyPasses: agg._sum.passesKey || 0,
    duelsWon: agg._sum.duelsWon || 0,
    dribbles: agg._sum.dribblesSuccess || 0,
    minutes: agg._sum.minutes || 0,
    avgRating: agg._avg.rating ? Math.round(agg._avg.rating * 10) / 10 : null,
  };
}

export default async function ComparePlayersPage({ searchParams }: { searchParams: { a?: string; b?: string; c?: string } }) {
  const seasons = await prisma.season.findMany({ orderBy: { year: 'desc' } });

  // Hydrate the picker with seasons/teams already known for the selected players
  // so the dropdowns boot pre-filled when the user lands on a shared URL.
  const ids = [searchParams.a, searchParams.b, searchParams.c].filter((x): x is string => !!x);
  const playerRecords = ids.length > 0
    ? await prisma.player.findMany({
        where: { id: { in: ids } },
        select: { id: true, teamId: true, team: { select: { seasonId: true } } },
      })
    : [];

  const initialSlots = [searchParams.a, searchParams.b, searchParams.c].map((id) => {
    const found = id ? playerRecords.find((p) => p.id === id) : null;
    return {
      seasonId: found?.team?.seasonId || '',
      teamId: found?.teamId || '',
      playerId: id || '',
    };
  });

  const usedSeasonIds = Array.from(new Set(initialSlots.map((s) => s.seasonId).filter(Boolean)));
  const teamsBySeason: Record<string, Array<{ id: string; nameHe: string; nameEn: string; logoUrl: string | null }>> = {};
  for (const sid of usedSeasonIds) {
    teamsBySeason[sid] = await prisma.team.findMany({
      where: { seasonId: sid },
      select: { id: true, nameHe: true, nameEn: true, logoUrl: true },
      orderBy: [{ nameHe: 'asc' }],
    });
  }

  const players = (await Promise.all(ids.map(fetchPlayerStats))).filter((p): p is PlayerStats => !!p);

  const metrics: Array<{ label: string; key: keyof PlayerStats }> = [
    { label: 'משחקים', key: 'matches' },
    { label: 'דקות', key: 'minutes' },
    { label: 'דירוג ממוצע', key: 'avgRating' },
    { label: 'שערים', key: 'goals' },
    { label: 'בישולים', key: 'assists' },
    { label: 'מסירות מפתח', key: 'keyPasses' },
    { label: 'דו-קרבות שזכה', key: 'duelsWon' },
    { label: 'דריבלים', key: 'dribbles' },
  ];

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <header>
          <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">השוואת שחקנים</h1>
          <p className="mt-1 text-sm text-stone-600">בחר עונה, קבוצה ושחקן — עד 3 הצבות. ניתן להשוות אותו שחקן בעונות שונות.</p>
        </header>

        <ComparePlayersPicker
          seasons={seasons.map((s) => ({ id: s.id, name: s.name, year: s.year }))}
          initialSlots={initialSlots}
          initialTeamsBySeason={teamsBySeason}
        />

        {players.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
            בחר לפחות שחקן אחד והקש &quot;השווה&quot;.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <table className="w-full text-right text-sm">
              <thead>
                <tr>
                  <th className="px-3 py-3"></th>
                  {players.map((p) => (
                    <th key={p.id} className="px-3 py-3">
                      <Link href={`/players/${p.id}`} className="flex flex-col items-center gap-2">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photoUrl} alt={p.displayName} className="h-16 w-16 rounded-full border border-stone-200 object-cover" />
                        ) : (
                          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 text-lg font-black text-stone-500">
                            {p.displayName.split(/\s+/).map((x) => x[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        <span className="text-sm font-black text-stone-900">{p.displayName}</span>
                        <span className="text-[11px] text-stone-500">{p.team} · {p.seasonName}</span>
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.map((m) => {
                  const values = players.map((p) => p[m.key] as number | null);
                  const max = Math.max(...values.map((v) => v ?? 0));
                  return (
                    <tr key={m.label} className="border-t border-stone-100">
                      <td className="px-3 py-2 font-bold text-stone-600">{m.label}</td>
                      {players.map((p, i) => {
                        const v = values[i];
                        const isMax = v != null && v === max && max > 0 && players.length > 1;
                        return (
                          <td key={p.id} className={`px-3 py-2 text-center font-black ${isMax ? 'text-emerald-700' : 'text-stone-900'}`}>
                            {v ?? '—'}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
