import prisma from '@/lib/prisma';
import { getCurrentSeasonStartYear } from '@/lib/home-live';

export const dynamic = 'force-dynamic';
type Framework = 'all' | 'LEAGUE' | 'CUP' | 'EUROPE';

function teamKey(team: { nameHe: string | null; nameEn: string }) { return (team.nameHe || team.nameEn).trim(); }

function calculateSeason(teamId: string | null, games: Array<{ homeTeamId: string; awayTeamId: string; homeScore: number | null; awayScore: number | null; status: string }>) {
  const completed = teamId ? games.filter((g) => g.status === 'COMPLETED' && g.homeScore !== null && g.awayScore !== null) : [];
  let wins = 0; let draws = 0; let goalsFor = 0; let goalsAgainst = 0;
  for (const game of completed) {
    const home = game.homeTeamId === teamId;
    const scored = home ? game.homeScore! : game.awayScore!;
    const conceded = home ? game.awayScore! : game.homeScore!;
    goalsFor += scored; goalsAgainst += conceded;
    if (scored > conceded) wins += 1;
    if (scored === conceded) draws += 1;
  }
  return { played: completed.length, wins, draws, losses: completed.length - wins - draws, points: wins * 3 + draws, goalsFor, goalsAgainst, cleanSheets: completed.filter((g) => (g.homeTeamId === teamId ? g.awayScore : g.homeScore) === 0).length };
}

async function getSeasonSummary(teamName: string | null, seasonId: string, framework: Framework) {
  if (!teamName) return null;
  const team = await prisma.team.findFirst({ where: { seasonId, OR: [{ nameHe: teamName }, { nameEn: teamName }] }, select: { id: true } });
  if (!team) return null;
  const games = await prisma.game.findMany({ where: { seasonId, OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }], ...(framework === 'all' ? {} : { competition: { type: framework } }) }, select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, status: true } });
  return calculateSeason(team.id, games);
}

export default async function ComparePage({ searchParams: searchParamsPromise }: { searchParams?: Promise<{ team?: string; seasonA?: string; seasonB?: string; framework?: Framework }> }) {
  const searchParams = await searchParamsPromise;
  const [teams, allSeasons] = await Promise.all([
    prisma.team.findMany({ select: { id: true, nameHe: true, nameEn: true }, orderBy: [{ nameHe: 'asc' }, { nameEn: 'asc' }], take: 1200 }),
    prisma.season.findMany({ orderBy: { year: 'desc' }, take: 26 }),
  ]);
  const seasons = allSeasons.filter((season) => season.year <= getCurrentSeasonStartYear());
  const distinctTeams = Array.from(new Map(teams.map((team) => [teamKey(team), team])).values());
  const selectedTeam = distinctTeams.find((team) => teamKey(team) === searchParams?.team) ?? null;
  const seasonA = seasons.find((season) => season.id === searchParams?.seasonA) ?? seasons[0] ?? null;
  const seasonB = seasons.find((season) => season.id === searchParams?.seasonB) ?? seasons[1] ?? seasons[0] ?? null;
  const framework: Framework = ['all', 'LEAGUE', 'CUP', 'EUROPE'].includes(searchParams?.framework || '') ? searchParams!.framework! : 'LEAGUE';
  const [summaryA, summaryB] = await Promise.all([seasonA ? getSeasonSummary(selectedTeam ? teamKey(selectedTeam) : null, seasonA.id, framework) : null, seasonB ? getSeasonSummary(selectedTeam ? teamKey(selectedTeam) : null, seasonB.id, framework) : null]);

  return <div dir="rtl" className="min-h-screen bg-stone-100 px-4 py-8"><div className="mx-auto max-w-7xl space-y-6">
    <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm"><p className="text-sm font-semibold tracking-[0.25em] text-[var(--accent)]">השוואה</p><h1 className="mt-2 text-3xl font-black text-stone-900">השוואת עונות</h1><p className="mt-2 text-stone-600">השוו ביצועי קבוצה בין שתי עונות, בנפרד לליגה, גביעים, אירופה או לכלל המסגרות.</p>
      <form className="mt-6 grid gap-3 md:grid-cols-4" action="/compare"><input list="compare-teams" name="team" defaultValue={selectedTeam ? teamKey(selectedTeam) : ''} placeholder="חיפוש קבוצה" className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold" /><datalist id="compare-teams">{distinctTeams.map((team) => <option key={teamKey(team)} value={teamKey(team)} />)}</datalist><select name="seasonA" defaultValue={seasonA?.id || ''} className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold">{seasons.map((season) => <option key={season.id} value={season.id}>{season.name} — עונה א׳</option>)}</select><select name="seasonB" defaultValue={seasonB?.id || ''} className="rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold">{seasons.map((season) => <option key={season.id} value={season.id}>{season.name} — עונה ב׳</option>)}</select><div className="flex gap-2"><select name="framework" defaultValue={framework} className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-4 py-3 font-semibold"><option value="LEAGUE">ליגה</option><option value="CUP">גביעים</option><option value="EUROPE">אירופה</option><option value="all">כל המסגרות</option></select><button className="rounded-xl bg-[var(--accent)] px-5 font-bold text-white">השוואה</button></div></form>
    </section>
    {selectedTeam && seasonA && seasonB ? <section className="grid gap-6 md:grid-cols-2"><ComparisonCard title={seasonA.name} summary={summaryA} /><ComparisonCard title={seasonB.name} summary={summaryB} /></section> : <section className="rounded-[24px] border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">בחרו קבוצה כדי לראות השוואה.</section>}
  </div></div>;
}

function ComparisonCard({ title, summary }: { title: string; summary: ReturnType<typeof calculateSeason> | null }) {
  const rows = summary ? [['משחקים', summary.played], ['נקודות', summary.points], ['ניצחונות', summary.wins], ['תיקו', summary.draws], ['הפסדים', summary.losses], ['שערי זכות', summary.goalsFor], ['שערי חובה', summary.goalsAgainst], ['רשת נקייה', summary.cleanSheets]] : [];
  return <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm"><h2 className="text-2xl font-black text-stone-900">{title}</h2>{summary ? <dl className="mt-5 grid grid-cols-2 gap-3">{rows.map(([label, value]) => <div key={String(label)} className="rounded-xl bg-stone-50 p-4"><dt className="text-sm font-semibold text-stone-500">{label}</dt><dd className="mt-1 text-2xl font-black text-stone-900">{value}</dd></div>)}</dl> : <p className="mt-4 text-stone-500">אין נתונים לקבוצה בעונה זו.</p>}</section>;
}
