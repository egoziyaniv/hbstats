import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildMatchdaySummary, HAPOEL_BEER_SHEVA_API_ID } from '@/lib/matchday-summary';
import { resolveCanonicalVenueId } from '@/lib/venue-identity';
import MatchdayMemoryEditor from '@/components/MatchdayMemoryEditor';

export const dynamic = 'force-dynamic';
const formatDate = (date: Date) => new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium', timeZone: 'Asia/Jerusalem' }).format(date);

export default async function MyMatchdaysPage({ searchParams }: { searchParams: Promise<{ season?: string; side?: string; venue?: string }> }) {
  const user = await requireUser();
  const filters = await searchParams;
  const attendances = await prisma.userMatchAttendance.findMany({
    where: { userId: user.id },
    include: { game: { include: {
      homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
      awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
      competition: { select: { nameHe: true, nameEn: true } },
      season: { select: { id: true, name: true } },
      venue: { select: { id: true, nameHe: true, nameEn: true } },
    } } },
    orderBy: { game: { dateTime: 'desc' } },
  });
  const seasons = [...new Map(attendances.map(({ game }) => [game.season.id, game.season])).values()];
  const venues = [...new Map(attendances.flatMap(({ game }) => game.venue ? [[resolveCanonicalVenueId(game.venue.id), game.venue] as const] : [])).entries()];
  const filtered = attendances.filter(({ game }) => {
    if (filters.season && game.seasonId !== filters.season) return false;
    if (filters.venue && (!game.venueId || resolveCanonicalVenueId(game.venueId) !== filters.venue)) return false;
    if (filters.side === 'home' && game.homeTeam.apiFootballId !== HAPOEL_BEER_SHEVA_API_ID) return false;
    if (filters.side === 'away' && game.awayTeam.apiFootballId !== HAPOEL_BEER_SHEVA_API_ID) return false;
    return true;
  });
  const summary = buildMatchdaySummary(filtered.map(({ game }) => ({
    status: game.status, homeScore: game.homeScore, awayScore: game.awayScore, venueId: game.venueId,
    homeTeamApiId: game.homeTeam.apiFootballId, awayTeamApiId: game.awayTeam.apiFootballId,
  })));
  const tiles = [
    ['משחקים בסינון', summary.attended], ['ניצחונות', summary.wins], ['תיקו', summary.draws], ['הפסדים', summary.losses],
    ['שערי זכות שראיתי', summary.goalsFor], ['שערי חובה שראיתי', summary.goalsAgainst],
    ['משחקי בית', summary.homeGames], ['משחקי חוץ', summary.awayGames], ['אצטדיונים', summary.venues],
  ];
  return <main dir="rtl" className="min-h-screen bg-[#f5f0e8] px-4 py-8"><div className="mx-auto max-w-5xl space-y-6">
    <header className="rounded-3xl bg-[linear-gradient(135deg,#450a0a,#991b1b)] p-6 text-white shadow-sm">
      <p className="text-xs font-black text-white/70">הארכיון האישי של {user.name}</p>
      <h1 className="mt-2 text-3xl font-black">המשחקים שלי</h1>
      <p className="mt-2 text-sm text-white/80">סמנו ״הייתי במשחק״ בדף המשחק ושמרו זיכרונות שרק אתם רואים.</p>
      <p className="mt-3 text-sm font-bold">{attendances.length} משחקים בארכיון · {filtered.length} בסינון הנוכחי</p>
    </header>
    <form className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4">
      <label className="flex min-w-36 flex-1 flex-col gap-1 text-sm font-bold">עונה<select name="season" defaultValue={filters.season || ''} className="rounded-lg border p-2"><option value="">כל העונות</option>{seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}</select></label>
      <label className="flex min-w-36 flex-1 flex-col gap-1 text-sm font-bold">בית או חוץ<select name="side" defaultValue={filters.side || ''} className="rounded-lg border p-2"><option value="">כל המשחקים</option><option value="home">באר שבע בבית</option><option value="away">באר שבע בחוץ</option></select></label>
      <label className="flex min-w-36 flex-1 flex-col gap-1 text-sm font-bold">אצטדיון<select name="venue" defaultValue={filters.venue || ''} className="rounded-lg border p-2"><option value="">כל האצטדיונים</option>{venues.map(([id, venue]) => <option key={id} value={id}>{venue.nameHe || venue.nameEn}</option>)}</select></label>
      <button className="rounded-lg bg-red-800 px-4 py-2 font-bold text-white">סינון</button><Link href="/matchdays" className="px-2 py-2 text-sm underline">איפוס</Link>
    </form>
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="סיכום משחקים אישיים">{tiles.map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-stone-200 bg-white p-4 text-center"><strong className="block text-2xl font-black">{value}</strong><span className="mt-1 block text-xs font-bold text-stone-500">{label}</span></div>)}</section>
    <p className="text-xs text-stone-600">המאזן, השערים והאצטדיונים מחושבים רק ממשחקי הפועל באר שבע שהסתיימו עם תוצאה ידועה, בסינון הנוכחי. אצטדיון לא ידוע אינו נספר. הנוכחות היא דיווח אישי.</p>
    {filtered.length ? <section className="divide-y divide-stone-100 overflow-hidden rounded-3xl border border-stone-200 bg-white">{filtered.map(({ game, note }) => <article key={game.id}>
      <Link href={`/games/${game.id}`} className="flex flex-wrap items-center gap-3 px-5 py-4 hover:bg-stone-50">
        <time className="text-xs text-stone-500">{formatDate(game.dateTime)}</time>
        <span className="min-w-0 flex-1"><span className="block text-sm font-black">{game.homeTeam.nameHe || game.homeTeam.nameEn} נגד {game.awayTeam.nameHe || game.awayTeam.nameEn}</span><span className="mt-1 block text-xs text-stone-500">{game.season.name} · {game.competition?.nameHe || game.competition?.nameEn} · {game.venue?.nameHe || game.venue?.nameEn || 'אצטדיון לא ידוע'}</span></span>
        <strong dir="ltr" className="rounded-lg bg-stone-950 px-3 py-1.5 text-sm text-white">{game.homeScore === null || game.awayScore === null ? 'אין תוצאה' : `${game.awayScore}:${game.homeScore}`}</strong>
      </Link><MatchdayMemoryEditor gameId={game.id} initialNote={note} />
    </article>)}</section> : <section className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center"><h2 className="text-xl font-black">{attendances.length ? 'אין משחקים שמתאימים לסינון' : 'עדיין אין משחקים בארכיון האישי'}</h2><Link href={attendances.length ? '/matchdays' : '/games'} className="mt-5 inline-block rounded-full bg-red-800 px-5 py-2.5 text-sm font-black text-white">{attendances.length ? 'הצגת כל המשחקים שלי' : 'לרשימת המשחקים'}</Link></section>}
  </div></main>;
}
