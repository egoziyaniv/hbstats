import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

type ContentCard = { title: string; description: string; href: string; total: number; published?: number; pending?: number; tone: string };

export default async function AdminContentPage() {
  await requireAdminUser();
  const [dossiers, pages, songs, hallEntries, honors, archivePending, archivePublished] = await Promise.all([
    prisma.clubSeasonDossier.groupBy({ by: ['isPublished'], _count: { _all: true } }),
    prisma.clubPage.groupBy({ by: ['isPublished'], _count: { _all: true } }),
    prisma.song.groupBy({ by: ['isPublished'], _count: { _all: true } }),
    prisma.hallOfFameEntry.groupBy({ by: ['isPublished'], _count: { _all: true } }),
    prisma.clubHonor.count(),
    prisma.fanArchiveItem.count({ where: { status: 'PENDING' } }),
    prisma.fanArchiveItem.count({ where: { status: 'PUBLISHED' } }),
  ]);
  const split = (rows: Array<{ isPublished: boolean; _count: { _all: number } }>) => ({
    published: rows.find((row) => row.isPublished)?._count._all ?? 0,
    draft: rows.find((row) => !row.isPublished)?._count._all ?? 0,
  });
  const dossier = split(dossiers);
  const clubPages = split(pages);
  const song = split(songs);
  const hall = split(hallEntries);
  const cards: ContentCard[] = [
    { title: 'תיקי עונה', description: 'סיכומי עונה, רגעים ומקורות מאומתים.', href: '/admin/club/seasons', total: dossier.published + dossier.draft, published: dossier.published, pending: dossier.draft, tone: 'border-red-200 bg-red-50 text-red-950' },
    { title: 'עמודי מועדון', description: 'היסטוריה, זהות, אצטדיון ותרבות.', href: '/admin/club-pages', total: clubPages.published + clubPages.draft, published: clubPages.published, pending: clubPages.draft, tone: 'border-sky-200 bg-sky-50 text-sky-950' },
    { title: 'ארכיון אוהדים', description: 'בדיקת מקור, קרדיט והרשאת פרסום.', href: '/admin/archive', total: archivePending + archivePublished, published: archivePublished, pending: archivePending, tone: 'border-amber-200 bg-amber-50 text-amber-950' },
    { title: 'שירי יציע', description: 'שירים, שחקנים ומקורות וידאו.', href: '/admin/songs', total: song.published + song.draft, published: song.published, pending: song.draft, tone: 'border-violet-200 bg-violet-50 text-violet-950' },
    { title: 'היכל התהילה', description: 'דמויות מופת, סיפורים והישגים.', href: '/admin/hall-of-fame', total: hall.published + hall.draft, published: hall.published, pending: hall.draft, tone: 'border-emerald-200 bg-emerald-50 text-emerald-950' },
    { title: 'הישגי המועדון', description: 'תארים ואבני דרך בהיסטוריה.', href: '/admin/honors', total: honors, tone: 'border-stone-200 bg-stone-50 text-stone-950' },
  ];

  return <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
    <header className="rounded-2xl bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] px-5 py-4 text-white shadow-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-xs font-bold text-red-200">תוכן וארכיון</p><h1 className="mt-1 text-2xl font-black">מרכז ניהול תוכן</h1></div><p className="max-w-2xl text-sm text-slate-200">סקירה של התוכן הציבורי, הטיוטות והפריטים שממתינים לאימות.</p></div></header>
    <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {cards.map((card) => <Link key={card.href} href={card.href} className={`rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}><div className="flex items-start justify-between gap-3"><h2 className="text-lg font-black">{card.title}</h2><span className="rounded-full bg-white/70 px-3 py-1 text-sm font-black">{card.total}</span></div><p className="mt-1 text-sm leading-5 opacity-80">{card.description}</p>{card.published !== undefined && <div className="mt-3 flex gap-2 text-xs font-bold"><span className="rounded-full bg-white/70 px-2.5 py-1">מפורסם: {card.published}</span><span className="rounded-full bg-white/70 px-2.5 py-1">{card.title === 'ארכיון אוהדים' ? 'לבדיקה' : 'טיוטה'}: {card.pending}</span></div>}<span className="mt-3 block text-sm font-black">לניהול ←</span></Link>)}
    </section>
    {archivePending > 0 && <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950"><div><strong className="text-lg font-black">{archivePending} פריטים מחכים לבדיקה</strong><p className="mt-1 text-sm">יש לאמת מקור, קרדיט והרשאה לפני פרסום לציבור.</p></div><Link href="/admin/archive" className="rounded-xl bg-amber-700 px-4 py-2 font-black text-white">פתיחת תור הבדיקה</Link></section>}
  </main>;
}
