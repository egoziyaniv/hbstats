import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export default async function AdminFootballPage({ searchParams }: { searchParams: Promise<{ season?: string }> }) {
  await requireAdminUser();
  const { season: requestedSeason } = await searchParams;
  const seasons = await prisma.season.findMany({ select: { id: true, name: true, year: true }, orderBy: { year: 'desc' } });
  const season = seasons.find((item) => item.id === requestedSeason) ?? seasons[0] ?? null;
  const [games, teams, players, events, lineups, referees, venues] = season ? await Promise.all([
    prisma.game.count({ where: { seasonId: season.id } }),
    prisma.team.count({ where: { seasonId: season.id } }),
    prisma.player.count({ where: { team: { seasonId: season.id } } }),
    prisma.gameEvent.count({ where: { game: { seasonId: season.id } } }),
    prisma.gameLineupEntry.count({ where: { game: { seasonId: season.id } } }),
    prisma.referee.count(),
    prisma.venue.count(),
  ]) : [0, 0, 0, 0, 0, 0, 0];
  const cards = [
    { label: 'משחקים ואירועים', value: games, note: `${events} אירועים · ${lineups} רשומות הרכב`, href: `/admin/games?season=${season?.id ?? ''}`, tone: 'border-red-200 bg-red-50 text-red-950' },
    { label: 'עריכה מהירה', value: games, note: 'תיקונים מהירים לפי עונה', href: `/admin/quick-edit?season=${season?.id ?? ''}`, tone: 'border-amber-200 bg-amber-50 text-amber-950' },
    { label: 'קבוצות ושחקנים', value: teams, note: `${players} שחקנים בעונה`, href: `/admin?season=${season?.id ?? ''}&adminTab=data`, tone: 'border-sky-200 bg-sky-50 text-sky-950' },
    { label: 'מאמנים', value: teams, note: 'ניהול קריירות ושיוך לקבוצות', href: '/admin/coaches', tone: 'border-violet-200 bg-violet-50 text-violet-950' },
    { label: 'שופטים', value: referees, note: 'עריכה ומיזוג כפילויות', href: '/admin/referees', tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
    { label: 'אצטדיונים', value: venues, note: 'פרטי מיקום וגלריית מדיה', href: '/admin/venues', tone: 'border-stone-200 bg-stone-50 text-stone-950' },
  ];
  return <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
    <header className="rounded-2xl bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] px-5 py-4 text-white shadow-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-xs font-bold text-red-200">כדורגל</p><h1 className="mt-1 text-2xl font-black">מרכז ניהול כדורגל</h1></div><p className="text-sm text-slate-200">נתוני העבודה לעונה {season?.name ?? 'שלא נבחרה'}.</p></div></header>
    <form className="flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3"><label className="grid gap-1 text-sm font-bold text-stone-700">עונה<select name="season" defaultValue={season?.id} className="rounded-xl border border-stone-300 px-3 py-2">{seasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button className="rounded-xl bg-stone-900 px-4 py-2 font-black text-white">עדכון</button></form>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => <Link key={card.href} href={card.href} className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}><strong className="block text-2xl font-black">{card.value}</strong><h2 className="mt-1 text-base font-black">{card.label}</h2><p className="mt-1 text-sm opacity-80">{card.note}</p><span className="mt-3 block text-sm font-black">פתיחה ←</span></Link>)}</section>
  </main>;
}
