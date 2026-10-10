import { notFound } from 'next/navigation';
import { PlayerChartsView } from '@/components/Charts';
import { formatPlayerName } from '@/lib/player-display';
import prisma from '@/lib/prisma';

export default async function PlayerChartsPage({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ season?: string; competition?: string }>;
}) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  const matchedPlayer = await prisma.player.findFirst({
    where: {
      OR: [{ id: params.id }, { canonicalPlayerId: params.id }],
    },
  });

  if (!matchedPlayer) {
    notFound();
  }

  const canonicalPlayerId = matchedPlayer.canonicalPlayerId || matchedPlayer.id;
  const linkedPlayers = await prisma.player.findMany({
    where: {
      OR: [{ id: canonicalPlayerId }, { canonicalPlayerId }],
    },
    include: {
      playerStats: {
        orderBy: [{ season: { year: 'asc' } }],
        include: { season: true, competition: true },
      },
    },
  });

  const canonicalPlayer = linkedPlayers.find((player) => player.id === canonicalPlayerId) || linkedPlayers[0];
  const playerDisplayName = formatPlayerName(canonicalPlayer);

  const allStats = linkedPlayers.flatMap((player) => player.playerStats);
  const selectedCompetition = searchParams?.competition
    ? allStats.find((stat) => stat.competitionId === searchParams.competition)?.competition
    : null;
  const scopedStats = selectedCompetition
    ? allStats.filter((stat) => stat.competitionId === selectedCompetition.id)
    : allStats;

  const aggregatedBySeason = Array.from(
    scopedStats
      .reduce((map, stat) => {
        const key = stat.seasonId || stat.seasonLabelHe || stat.seasonLabelEn || 'season';
        const seasonName = stat.season?.name || stat.seasonLabelHe || stat.seasonLabelEn || 'עונה';
        const existing = map.get(key);

        if (!existing) {
          map.set(key, {
            seasonName,
            goals: stat.goals,
            assists: stat.assists,
            minutesPlayed: stat.minutesPlayed,
            yellowCards: stat.yellowCards,
            redCards: stat.redCards,
          });
          return map;
        }

        existing.goals += stat.goals;
        existing.assists += stat.assists;
        existing.minutesPlayed += stat.minutesPlayed;
        existing.yellowCards += stat.yellowCards;
        existing.redCards += stat.redCards;

        return map;
      }, new Map<string, { seasonName: string; goals: number; assists: number; minutesPlayed: number; yellowCards: number; redCards: number }>())
      .values()
  );

  const goalsAssists = aggregatedBySeason.map((stat) => ({
    'עונה': stat.seasonName,
    'שערים': stat.goals,
    'בישולים': stat.assists,
  }));

  const minutesPlayed = aggregatedBySeason.map((stat) => ({
    'עונה': stat.seasonName,
    'דקות': stat.minutesPlayed,
  }));

  const cards = aggregatedBySeason.map((stat) => ({
    'עונה': stat.seasonName,
    'צהובים': stat.yellowCards,
    'אדומים': stat.redCards,
  }));

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">{`סטטיסטיקות שחקן: ${playerDisplayName}`}</h1>
          <p className="mt-2 text-stone-600">
            גרפים עונתיים מצטברים של השחקן לאורך כל הקריירה במערכת.
            {selectedCompetition ? ` מסגרת: ${selectedCompetition.nameHe || selectedCompetition.nameEn}.` : ''}
          </p>
        </section>
        <PlayerChartsView goalsAssists={goalsAssists} minutesPlayed={minutesPlayed} cards={cards} />
      </div>
    </div>
  );
}
