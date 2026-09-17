import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { ARCHIVE_STATUSES } from '@/lib/fan-archive';
import FanArchiveForm from '@/components/FanArchiveForm';
export const dynamic = 'force-dynamic';
export default async function SubmitArchivePage() {
  const user = await requireUser();
  const items = await prisma.fanArchiveItem.findMany({ where: { authorId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  return <main dir="rtl" className="mx-auto max-w-3xl space-y-6 px-4 py-8"><Link href="/club/archive" className="font-bold text-red-800">לארכיון הציבורי</Link><h1 className="text-3xl font-black">הסיפור שלכם ביציע</h1><p className="text-sm text-stone-600">פריטים נבדקים לפני פרסום. טיוטות נשארות פרטיות. בשלב זה אפשר לשלוח קישור לתמונה; אין העלאת קבצים. מחיקת החשבון תמחק גם את הפריטים ששלחתם.</p><section className="rounded-2xl border bg-white p-5"><h2 className="mb-4 text-xl font-bold">פריט חדש</h2><FanArchiveForm /></section><h2 className="text-xl font-black">הפריטים שלי</h2>{items.map(item => <details key={item.id} className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer font-bold">{item.titleHe} · {ARCHIVE_STATUSES[item.status]}</summary>{item.reviewNoteHe && <p className="my-3 rounded-lg bg-amber-50 p-3 text-sm">הערת העורך: {item.reviewNoteHe}</p>}{item.status === 'PUBLISHED' ? <Link href={`/club/archive/${item.id}`} className="mt-3 block text-red-800 underline">לפריט שפורסם</Link> : <div className="mt-4"><FanArchiveForm initial={{ ...item, updatedAt: item.updatedAt.toISOString(), eventDate: item.eventDate?.toISOString().slice(0,10) || '', sourceUrl: item.sourceUrl || '', imageUrl: item.imageUrl || '', gameId: item.gameId || '', seasonId: item.seasonId || '', playerId: item.playerId || '', venueId: item.venueId || '' }} /></div>}</details>)}</main>;
}
