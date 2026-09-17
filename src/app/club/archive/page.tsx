import Link from 'next/link';
import prisma from '@/lib/prisma';
import { ARCHIVE_TYPES } from '@/lib/fan-archive';
export const dynamic = 'force-dynamic';
export default async function FanArchivePage() {
  const items = await prisma.fanArchiveItem.findMany({ where: { status: 'PUBLISHED', permissionGranted: true }, orderBy: { publishedAt: 'desc' }, take: 100, select: { id: true, titleHe: true, type: true, creditHe: true, bodyHe: true } });
  return <main dir="rtl" className="mx-auto max-w-6xl space-y-6 px-4 py-8"><header className="rounded-3xl bg-red-950 p-7 text-white"><p className="text-sm text-red-200">הזיכרונות שמאחורי המספרים</p><h1 className="mt-2 text-3xl font-black">ארכיון האוהדים</h1><p className="mt-3">כרטיסים, תמונות וסיפורים מהיציע — עם קרדיט ומקור.</p><Link href="/club/archive/submit" className="mt-5 inline-block rounded-full bg-white px-5 py-2 font-bold text-red-950">הוספת פריט לארכיון</Link></header>
    <p className="text-sm text-stone-600">זיכרונות הם עדויות אישיות. פריטים מופיעים לאחר בדיקת עורך והרשאת פרסום.</p>
    {items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{items.map(item => <Link key={item.id} href={`/club/archive/${item.id}`} className="rounded-2xl border bg-white p-5"><span className="text-xs font-bold text-red-800">{ARCHIVE_TYPES[item.type]}</span><h2 className="mt-2 text-lg font-black">{item.titleHe}</h2><p className="mt-2 line-clamp-3 text-sm text-stone-600">{item.bodyHe}</p><p className="mt-4 text-xs text-stone-500">באדיבות {item.creditHe}</p></Link>)}</div> : <p className="rounded-2xl border border-dashed p-8 text-center">הארכיון מחכה לסיפורים שלכם. עדיין אין פריטים שפורסמו.</p>}
  </main>;
}
