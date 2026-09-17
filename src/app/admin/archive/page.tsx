import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ARCHIVE_TYPES } from '@/lib/fan-archive';
import ArchiveReviewButtons from '@/components/ArchiveReviewButtons';
export const dynamic = 'force-dynamic';
export default async function ArchiveAdminPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminUser();
  const { status } = await searchParams;
  const published = status === 'published';
  const items = await prisma.fanArchiveItem.findMany({ where: { status: published ? 'PUBLISHED' : 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 });
  return <main dir="rtl" className="mx-auto max-w-4xl space-y-5 px-4 py-8"><Link href="/admin" className="font-bold text-red-800">חזרה לאדמין</Link><h1 className="text-3xl font-black">בדיקת פריטי ארכיון</h1><nav className="flex gap-4 text-sm font-bold"><Link href="/admin/archive" className={!published ? 'text-red-800 underline' : ''}>ממתינים לבדיקה</Link><Link href="/admin/archive?status=published" className={published ? 'text-red-800 underline' : ''}>פריטים שפורסמו</Link></nav><p className="text-sm text-stone-600">בדקו מקור, קרדיט והרשאת פרסום לפני אישור. פריטים שלא אושרו אינם זמינים לציבור.</p>
    {!items.length && <p className="rounded-2xl border bg-white p-8 text-center">אין פריטים ברשימה.</p>}
    {items.map(item => <article key={item.id} className="rounded-2xl border bg-white p-5"><p className="text-xs text-stone-500">{ARCHIVE_TYPES[item.type]} · {item.createdAt.toLocaleDateString('he-IL')} · קרדיט: {item.creditHe}</p><h2 className="mt-2 text-xl font-black">{item.titleHe}</h2><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7">{item.bodyHe}</p><div className="mt-3 flex gap-4 text-sm text-red-800">{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">מקור</a>}{item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="underline">תמונה במקור</a>}</div><p className="mt-3 text-sm font-bold">הרשאת פרסום: {item.permissionGranted ? 'אושרה על ידי התורם' : 'לא ניתנה'}</p><ArchiveReviewButtons id={item.id} published={published} updatedAt={item.updatedAt.toISOString()} initialLinks={{ gameId: item.gameId || '', seasonId: item.seasonId || '', playerId: item.playerId || '', venueId: item.venueId || '' }} /></article>)}
  </main>;
}
