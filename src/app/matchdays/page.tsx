import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildMatchdaySummary } from '@/lib/matchday-summary';

export const dynamic = 'force-dynamic';

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(date);
}

export default async function MyMatchdaysPage() {
  const user = await requireUser();
  const attendances = await prisma.userMatchAttendance.findMany({
    where: { userId: user.id },
    include: {
      game: {
        include: {
          homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
          awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
          competition: { select: { nameHe: true, nameEn: true } },
          season: { select: { name: true } },
        },
      },
    },
    orderBy: { game: { dateTime: 'desc' } },
  });
  const games = attendances.map((entry) => entry.game);
  const summary = buildMatchdaySummary(games.map((game) => ({
    status: game.status, homeScore: game.homeScore, awayScore: game.awayScore,
    homeTeamApiId: game.homeTeam.apiFootballId, awayTeamApiId: game.awayTeam.apiFootballId,
  })));

  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f0e8] px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="rounded-3xl bg-[linear-gradient(135deg,#450a0a,#991b1b)] p-6 text-white shadow-sm">
          <p className="text-xs font-black text-white/70">הארכיון האישי של {user.name}</p>
          <h1 className="mt-2 text-3xl font-black">המשחקים שלי</h1>
          <p className="mt-2 text-sm font-semibold text-white/80">סמנו בדף משחק את המשחקים שבהם נכחתם, והמאזן מתעדכן כאן.</p>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5" aria-label="סיכום משחקים אישיים">
          {[
            ['משחקים שסומנו', summary.attended], ['הסתיימו', summary.completed], ['משחקי הפועל ב״ש', summary.hbsGames],
            ['ניצחונות', summary.wins], ['תיקו / הפסדים', `${summary.draws} / ${summary.losses}`],
          ].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-stone-200 bg-white p-4 text-center shadow-sm"><strong className="block text-2xl font-black text-stone-900">{value}</strong><span className="mt-1 block text-xs font-bold text-stone-500">{label}</span></div>)}
        </section>

        {games.length ? <section className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-100 px-5 py-4"><h2 className="font-black text-stone-900">המשחקים שסימנתם</h2></div><div className="divide-y divide-stone-100">{games.map((game) => <Link key={game.id} href={`/games/${game.id}`} className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-3 px-5 py-4 transition hover:bg-stone-50"><time className="text-xs font-semibold text-stone-500">{formatDate(game.dateTime)}</time><span className="min-w-0"><span className="block truncate text-sm font-black text-stone-900">{game.homeTeam.nameHe || game.homeTeam.nameEn} <bdi className="mx-1 text-stone-400">נגד</bdi> {game.awayTeam.nameHe || game.awayTeam.nameEn}</span><span className="mt-1 block text-xs text-stone-500">{game.competition?.nameHe || game.competition?.nameEn || game.season.name}</span></span><strong className="rounded-lg bg-stone-950 px-3 py-1.5 text-sm text-white">{game.homeScore === null || game.awayScore === null ? 'טרם שוחק' : `${game.homeScore}:${game.awayScore}`}</strong></Link>)}</div></section> : <section className="rounded-3xl border border-dashed border-stone-300 bg-white p-10 text-center"><h2 className="text-xl font-black text-stone-900">עדיין אין משחקים בארכיון האישי</h2><p className="mt-2 text-sm text-stone-500">פתחו משחק וסמנו “הייתי במשחק”.</p><Link href="/games" className="mt-5 inline-block rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-black text-white">לרשימת המשחקים</Link></section>}
      </div>
    </main>
  );
}
