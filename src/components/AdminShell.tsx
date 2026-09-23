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
    { href: '/admin/roster-integrity', label: 'בקרת סגלים והעברות' },
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

const primaryLinks = [
  { href: '/admin', label: 'לוח בקרה' },
  { href: '/admin/football', label: 'כדורגל' },
  { href: '/admin/content', label: 'תוכן' },
  { href: '/admin/sync', label: 'תפעול' },
  { href: '/admin?adminTab=settings', label: 'הגדרות' },
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
    <aside className="rounded-2xl border border-slate-700 bg-slate-950 p-3 text-white shadow-xl" aria-label="ניווט אדמין">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={hrefWithSeason('/admin')} className="shrink-0 text-lg font-black tracking-tight">StatsAI <span className="text-red-400">Admin</span></Link>
        <label className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-300">עונה
          <select
            className="w-32 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
            value={activeSeasonId ?? ''}
            onChange={(event) => router.push(`${pathname}?season=${event.target.value}`)}
          >
            {seasons.map((season) => <option key={season.id} value={season.id}>{season.name}</option>)}
          </select>
        </label>
        <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto whitespace-nowrap" aria-label="קישורי אדמין ראשיים">
          {primaryLinks.map((link) => {
            const active = link.href.split('?')[0] === pathname && (link.href.includes('adminTab=settings') ? searchParams.get('adminTab') === 'settings' : !searchParams.get('adminTab'));
            return <Link key={link.href} href={hrefWithSeason(link.href)} className={`rounded-lg px-3 py-2 text-sm font-bold transition ${active ? 'bg-red-600 text-white' : 'text-slate-200 hover:bg-white/10'}`}>{link.label}</Link>;
          })}
        </nav>
        <details className="relative shrink-0">
          <summary className="cursor-pointer rounded-lg border border-slate-600 px-3 py-2 text-sm font-bold text-slate-100 marker:hidden hover:bg-white/10">כל הכלים</summary>
          <div className="absolute left-0 z-20 mt-2 grid w-[min(90vw,760px)] grid-cols-2 gap-x-5 gap-y-4 rounded-2xl border border-slate-700 bg-slate-950 p-4 shadow-2xl sm:grid-cols-3 xl:grid-cols-5">
            {groups.map((group) => (
              <section key={group.title}>
                <h2 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">{group.title}</h2>
                <div className="grid gap-1">
                  {group.links.map((link) => {
                    const active = link.href.split('?')[0] === pathname && (link.href.includes('adminTab=settings') ? searchParams.get('adminTab') === 'settings' : true);
                    return <Link key={link.href} href={hrefWithSeason(link.href)} className={`rounded-lg px-2 py-1.5 text-sm font-bold transition ${active ? 'bg-red-600 text-white' : 'text-slate-200 hover:bg-white/10'}`}>{link.label}</Link>;
                  })}
                </div>
              </section>
            ))}
          </div>
        </details>
      </div>
    </aside>
  );
}
