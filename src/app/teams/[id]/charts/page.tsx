import { notFound } from 'next/navigation';
import { TeamChartsView } from '@/components/Charts';
import { formatPlayerName } from '@/lib/player-display';
import { buildLeaguePositionSeries, getRoundNumber } from '@/lib/team-chart-data';
import prisma from '@/lib/prisma';

type SearchParams = Promise<{ season?: string; competition?: string; compare?: string | string[]; compare1?: string; compare2?: string; compare3?: string }>;
const COMPARISON_COLORS = ['#dc2626', '#1d4ed8', '#ca8a04', '#0f766e'];

export default async function TeamChartsPage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const [{ id }, searchParams] = await Promise.all([paramsPromise, searchParamsPromise]);
  const baseTeam = await prisma.team.findUnique({ where: { id }, include: { season: { select: { id: true, name: true } } } });
  if (!baseTeam) notFound();

  const identity = baseTeam.apiFootballId ? { apiFootballId: baseTeam.apiFootballId } : { nameEn: baseTeam.nameEn };
  const clubSeasons = await prisma.team.findMany({ where: identity, include: { season: { select: { id: true, name: true, year: true } } }, orderBy: { season: { year: 'desc' } } });
  const selectedSeasonId = clubSeasons.some((entry) => entry.seasonId === searchParams.season) ? searchParams.season! : baseTeam.seasonId;
  const team = clubSeasons.find((entry) => entry.seasonId === selectedSeasonId) ?? baseTeam;

  const [season, ownGames] = await Promise.all([
    prisma.season.findUnique({ where: { id: selectedSeasonId }, select: { id: true, name: true } }),
    prisma.game.findMany({
      where: { seasonId: selectedSeasonId, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }] },
      include: { competition: { select: { id: true, nameHe: true, nameEn: true, type: true } } },
      orderBy: { dateTime: 'asc' },
    }),
  ]);
  if (!season) notFound();

  const competitions = [...new Map(ownGames.filter((game) => game.competition).map((game) => [game.competitionId!, game.competition!])).values()]
    .sort((left, right) => Number(right.type === 'LEAGUE') - Number(left.type === 'LEAGUE') || left.nameHe.localeCompare(right.nameHe, 'he'));
  const defaultCompetition = competitions.find((competition) => competition.type === 'LEAGUE') ?? competitions[0];
  const selectedCompetitionId = searchParams.competition === 'all' ? 'all' : competitions.some((competition) => competition.id === searchParams.competition) ? searchParams.competition! : defaultCompetition?.id ?? 'all';
  const selectedCompetition = competitions.find((competition) => competition.id === selectedCompetitionId) ?? null;
  const filteredGames = ownGames.filter((game) => selectedCompetitionId === 'all' || game.competitionId === selectedCompetitionId);
  const completedGames = filteredGames.filter((game) => game.status === 'COMPLETED' && game.homeScore !== null && game.awayScore !== null);

  const [leagueGames, standingRows, players] = selectedCompetition?.type === 'LEAGUE'
    ? await Promise.all([
        prisma.game.findMany({ where: { seasonId: selectedSeasonId, competitionId: selectedCompetition.id }, include: { homeTeam: { select: { id: true, nameHe: true, nameEn: true } }, awayTeam: { select: { id: true, nameHe: true, nameEn: true } } }, orderBy: { dateTime: 'asc' } }),
        prisma.standing.findMany({ where: { seasonId: selectedSeasonId, competitionId: selectedCompetition.id }, include: { team: { select: { id: true, nameHe: true, nameEn: true } } } }),
        prisma.player.findMany({ where: { teamId: team.id }, include: { playerStats: { where: { seasonId: selectedSeasonId, competitionId: selectedCompetition.id } } } }),
      ])
    : await Promise.all([
        Promise.resolve([]),
        Promise.resolve([]),
        prisma.player.findMany({ where: { teamId: team.id }, include: { playerStats: { where: { seasonId: selectedSeasonId, ...(selectedCompetitionId === 'all' ? {} : { competitionId: selectedCompetitionId }) } } } }),
      ]);

  const leagueTeamsById = new Map<string, { id: string; name: string }>();
  for (const row of standingRows) leagueTeamsById.set(row.team.id, { id: row.team.id, name: row.team.nameHe || row.team.nameEn });
  for (const game of leagueGames) {
    leagueTeamsById.set(game.homeTeam.id, { id: game.homeTeam.id, name: game.homeTeam.nameHe || game.homeTeam.nameEn });
    leagueTeamsById.set(game.awayTeam.id, { id: game.awayTeam.id, name: game.awayTeam.nameHe || game.awayTeam.nameEn });
  }
  const leagueTeams = [...leagueTeamsById.values()].sort((left, right) => left.name.localeCompare(right.name, 'he'));
  const legacyComparisonValues = Array.isArray(searchParams.compare) ? searchParams.compare : searchParams.compare ? [searchParams.compare] : [];
  const compareValues = [searchParams.compare1, searchParams.compare2, searchParams.compare3, ...legacyComparisonValues]
    .filter((teamId): teamId is string => Boolean(teamId));
  const selectedComparisonIds = [team.id, ...Array.from(new Set(compareValues)).filter((teamId) => teamId !== team.id && leagueTeams.some((entry) => entry.id === teamId)).slice(0, 3)];
  const comparedTeams = leagueTeams.filter((entry) => selectedComparisonIds.includes(entry.id)).map((entry, index) => ({ ...entry, color: COMPARISON_COLORS[index] }));
  const leaguePositions = buildLeaguePositionSeries(
    leagueTeams,
    leagueGames.map((game) => ({ id: game.id, homeTeamId: game.homeTeamId, awayTeamId: game.awayTeamId, homeScore: game.homeScore, awayScore: game.awayScore, status: game.status, round: getRoundNumber(game.roundNameHe ?? game.roundNameEn), dateTime: game.dateTime })),
    selectedComparisonIds,
  );

  const resultBreakdown = [
    { name: 'ניצחונות', value: completedGames.filter((game) => game.homeTeamId === team.id ? game.homeScore! > game.awayScore! : game.awayScore! > game.homeScore!).length },
    { name: 'תיקו', value: completedGames.filter((game) => game.homeScore === game.awayScore).length },
    { name: 'הפסדים', value: completedGames.filter((game) => game.homeTeamId === team.id ? game.homeScore! < game.awayScore! : game.awayScore! < game.homeScore!).length },
  ];
  const goalsByMatchday = completedGames.map((game, index) => {
    const isHome = game.homeTeamId === team.id;
    return { מחזור: String(getRoundNumber(game.roundNameHe ?? game.roundNameEn) ?? index + 1), זכות: isHome ? game.homeScore! : game.awayScore!, חובה: isHome ? game.awayScore! : game.homeScore! };
  });
  const playerContributions = players.map((player) => ({ שחקן: formatPlayerName(player), שערים: player.playerStats.reduce((sum, item) => sum + item.goals, 0), בישולים: player.playerStats.reduce((sum, item) => sum + item.assists, 0) }));
  const topScorers = playerContributions.filter((player) => player.שערים > 0).sort((left, right) => right.שערים - left.שערים || right.בישולים - left.בישולים).map(({ שחקן, שערים }) => ({ שחקן, שערים })).slice(0, 5);
  const topAssisters = playerContributions.filter((player) => player.בישולים > 0).sort((left, right) => right.בישולים - left.בישולים || right.שערים - left.שערים).map(({ שחקן, בישולים }) => ({ שחקן, בישולים })).slice(0, 5);

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8" dir="rtl">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">{`סטטיסטיקות קבוצה: ${team.nameHe}`}</h1>
          <p className="mt-2 text-stone-600">{`${season.name} · ${selectedCompetition?.nameHe ?? 'כל המסגרות'}`}</p>
          <form className="mt-5 grid gap-3 border-t border-stone-100 pt-5 md:grid-cols-3" method="get">
            <label className="grid gap-1 text-sm font-bold text-stone-700">עונה<select className="rounded-xl border border-stone-300 bg-white px-3 py-2" name="season" defaultValue={selectedSeasonId}>{clubSeasons.map((entry) => <option key={entry.id} value={entry.seasonId}>{entry.season.name}</option>)}</select></label>
            <label className="grid gap-1 text-sm font-bold text-stone-700">מסגרת<select className="rounded-xl border border-stone-300 bg-white px-3 py-2" name="competition" defaultValue={selectedCompetitionId}><option value="all">כל המסגרות</option>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.nameHe}</option>)}</select></label>
            <div className="flex items-end"><button className="w-full rounded-xl bg-red-600 px-4 py-2 font-black text-white hover:bg-red-700" type="submit">עדכון גרפים</button></div>
            {selectedCompetition?.type === 'LEAGUE' && leagueTeams.length > 1 && <div className="grid gap-3 md:col-span-3 md:grid-cols-3">{[0, 1, 2].map((index) => <label key={index} className="grid gap-1 text-sm font-bold text-stone-700">{`קבוצה ${index + 1} להשוואה`}<select className="rounded-xl border border-stone-300 bg-white px-3 py-2" name={`compare${index + 1}`} defaultValue={selectedComparisonIds[index + 1] ?? ''}><option value="">ללא השוואה</option>{leagueTeams.filter((entry) => entry.id !== team.id).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>)}</div>}
          </form>
        </section>
        <TeamChartsView goalsByMatchday={goalsByMatchday} leaguePositions={leaguePositions} comparedTeams={comparedTeams} leagueTeamCount={selectedCompetition?.type === 'LEAGUE' ? leagueTeams.length : null} resultBreakdown={resultBreakdown} topScorers={topScorers} topAssisters={topAssisters} />
      </div>
    </div>
  );
}
