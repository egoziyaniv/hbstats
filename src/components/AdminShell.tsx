'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type Season = { id: string; name: string };

const groups = [
  { title: 'סקירה', links: [{ href: '/admin', label: 'לוח בקרה' }] },
  { title: 'כדורגל', links: [
    { href: '/admin/football', label: 'מרכז כדורגל' },
    { href: '/admin/games', label: 'משחקים ואירועים' },
    { href: '/admin/quick-edit', label: 'עריכה מהירה' },
    { href: '/admin/coaches', label: 'מאמנים' },
    { href: '/admin/referees', label: 'שופטים' },
    { href: '/admin/venues', label: 'אצטדיונים' },
    { href: '/admin/ratings', label: 'ציוני שחקנים' },
  ] },
  { title: 'תוכן וארכיון', links: [
    { href: '/admin/content', label: 'מרכז תוכן' },
    { href: '/admin/club/seasons', label: 'תיקי עונה' },
    { href: '/admin/club-pages', label: 'עמודי מועדון' },
    { href: '/admin/archive', label: 'ארכיון אוהדים' },
    { href: '/admin/songs', label: 'שירים' },
    { href: '/admin/hall-of-fame', label: 'היכל התהילה' },
    { href: '/admin/honors', label: 'הישגים' },
  ] },
  { title: 'מקורות וסנכרון', links: [
    { href: '/admin/sync', label: 'מרכז תפעול' },
    { href: '/admin/matchday', label: 'יום משחקים' },
    { href: '/admin/setup', label: 'ייבוא מלא' },
    { href: '/admin/scrape', label: 'סריקות' },
    { href: '/admin/flashscore', label: 'Flashscore' },
    { href: '/admin/sofascore', label: 'Sofascore' },
    { href: '/admin/merge', label: 'מיזוג נתונים' },
  ] },
  { title: 'מערכת', links: [
    { href: '/admin?adminTab=settings', label: 'הגדרות' },
    { href: '/admin/db-transfer', label: 'העברת מסד נתונים' },
  ] },
];

export default function AdminShell({ seasons, selectedSeasonId }: { seasons: Season[]; selectedSeasonId: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeSeasonId = searchParams.get('season') ?? selectedSeasonId;

  function hrefWithSeason(href: string) {
    const [path, query = ''] = href.split('?');
    const params = new URLSearchParams(query);
    if (activeSeasonId) params.set('season', activeSeasonId);
    return `${path}?${params.toString()}`;
  }

  return (
    <aside className="rounded-[24px] border border-slate-700 bg-slate-950 p-4 text-white shadow-xl" aria-label="ניווט אדמין">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
        <Link href="/admin" className="text-xl font-black tracking-tight">StatsAI <span className="text-red-400">Admin</span></Link>
        <label className="flex items-center gap-2 text-xs font-bold text-slate-300">עונה
          <select
            className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            value={activeSeasonId ?? ''}
            onChange={(event) => router.push(`${pathname}?season=${event.target.value}`)}
          >
            {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
          </select>
        </label>
      </div>
      <nav className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {groups.map((group) => (
          <section key={group.title}>
            <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{group.title}</h2>
            <div className="grid gap-1">
              {group.links.map((link) => {
                const active = link.href.split('?')[0] === pathname && (link.href.includes('adminTab=settings') ? pathname === '/admin' : true);
                return <Link key={link.href} href={hrefWithSeason(link.href)} className={`rounded-lg px-2.5 py-2 text-sm font-bold transition ${active ? 'bg-red-600 text-white' : 'text-slate-200 hover:bg-white/10'}`}>{link.label}</Link>;
              })}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}
