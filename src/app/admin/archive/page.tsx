import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ARCHIVE_STATUSES, ARCHIVE_TYPES } from '@/lib/fan-archive';
import ArchiveReviewButtons from '@/components/ArchiveReviewButtons';

export const dynamic = 'force-dynamic';
const statuses = ['PENDING', 'PUBLISHED', 'REJECTED'] as const;
type ArchiveStatus = (typeof statuses)[number];

export default async function ArchiveAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminUser();
  const { status } = await searchParams;
  const selectedStatus: ArchiveStatus = statuses.includes(status as ArchiveStatus) ? status as ArchiveStatus : 'PENDING';
  const [items, grouped] = await Promise.all([
    prisma.fanArchiveItem.findMany({ where: { status: selectedStatus }, include: { author: { select: { name: true, email: true } }, reviewedBy: { select: { name: true } }, season: { select: { name: true } } }, orderBy: selectedStatus === 'PENDING' ? { createdAt: 'asc' } : { updatedAt: 'desc' }, take: 100 }),
    prisma.fanArchiveItem.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);
  const counts = new Map(grouped.map((row) => [row.status, row._count._all]));

  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
    <header className="rounded-[28px] bg-[linear-gradient(135deg,#7f1d1d,#1f2937)] p-7 text-white shadow-md"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-bold text-red-200">תוכן וארכיון</p><h1 className="mt-2 text-3xl font-black">תור בדיקת ארכיון אוהדים</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-slate-200">פריט אינו ציבורי עד שמאמתים מקור, קרדיט והרשאת פרסום.</p></div><Link href="/admin/content" className="rounded-xl border border-white/25 px-4 py-2 text-sm font-bold hover:bg-white/10">מרכז התוכן</Link></div></header>
    <nav className="grid gap-3 sm:grid-cols-3" aria-label="סינון סטטוס ארכיון">{statuses.map((itemStatus) => <Link key={itemStatus} href={`/admin/archive?status=${itemStatus}`} className={`rounded-2xl border p-4 transition ${selectedStatus === itemStatus ? 'border-red-700 bg-red-700 text-white' : 'border-stone-200 bg-white text-stone-800 hover:border-stone-400'}`}><strong className="block text-2xl font-black">{counts.get(itemStatus) ?? 0}</strong><span className="text-sm font-bold">{ARCHIVE_STATUSES[itemStatus]}</span></Link>)}</nav>
    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-950"><strong>תצוגה: {ARCHIVE_STATUSES[selectedStatus]}.</strong> אפשר לפרסם רק פריט שממתין לבדיקה ובו הרשאת פרסום מאושרת. החזרה לתיקון דורשת הערה לתורם.</section>
    {!items.length ? <p className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-stone-600">אין פריטים בסטטוס זה.</p> : <div className="space-y-4">{items.map((item) => <article key={item.id} className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-stone-500">{ARCHIVE_TYPES[item.type]} · נשלח {item.createdAt.toLocaleDateString('he-IL')} · {item.author.name || item.author.email}</p><h2 className="mt-2 text-xl font-black text-stone-900">{item.titleHe}</h2></div><span className={`rounded-full px-3 py-1 text-xs font-black ${item.permissionGranted ? 'bg-emerald-100 text-emerald-900' : 'bg-rose-100 text-rose-900'}`}>{item.permissionGranted ? 'הרשאת פרסום אושרה' : 'ללא הרשאת פרסום'}</span></div><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-stone-700">{item.bodyHe}</p><div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-stone-600"><span className="rounded-full bg-stone-100 px-3 py-1">קרדיט: {item.creditHe}</span>{item.season && <span className="rounded-full bg-stone-100 px-3 py-1">עונה: {item.season.name}</span>}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-sky-50 px-3 py-1 text-sky-800 hover:underline">מקור ↗</a>}{item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="rounded-full bg-sky-50 px-3 py-1 text-sky-800 hover:underline">תמונה ↗</a>}</div>{item.reviewNoteHe && <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm text-stone-700"><strong>הערת בדיקה:</strong> {item.reviewNoteHe}</p>}{item.reviewedBy && <p className="mt-3 text-xs text-stone-500">נבדק על ידי {item.reviewedBy.name} · {item.reviewedAt?.toLocaleDateString('he-IL')}</p>}{(selectedStatus === 'PENDING' || selectedStatus === 'PUBLISHED') && <ArchiveReviewButtons id={item.id} published={selectedStatus === 'PUBLISHED'} updatedAt={item.updatedAt.toISOString()} initialLinks={{ gameId: item.gameId || '', seasonId: item.seasonId || '', playerId: item.playerId || '', venueId: item.venueId || '' }} />}</article>)}</div>}
  </main>;
}
