import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export default async function DossierAdminIndex() {
  await requireAdminUser();
  const seasons = await prisma.season.findMany({ where: { teams: { some: { apiFootballId: 563 } } }, orderBy: { year: 'desc' }, select: { id: true, name: true } });
  const published = await prisma.clubSeasonDossier.findMany({ where: { team: { apiFootballId: 563 } }, select: { seasonId: true, isPublished: true } });
  const status = new Map(published.map(row => [row.seasonId, row.isPublished]));
  return <main dir="rtl" className="mx-auto max-w-4xl space-y-5 px-4 py-8"><Link href="/admin" className="text-sm font-bold text-red-800">חזרה לאדמין</Link><h1 className="text-3xl font-black">ניהול תיקי עונה</h1><p className="text-stone-600">ניתן להכין תיק לכל עונה של באר שבע. עונות היסטוריות זמינות לציבור רק לאחר פרסום מפורש. אימות הכיסוי והמקורות נשאר באחריות העורך.</p><div className="grid gap-3 sm:grid-cols-3">{seasons.map(season => <Link key={season.id} href={`/admin/club/seasons/${season.id}`} className="rounded-2xl border bg-white p-5"><strong className="block">{season.name}</strong><span className="text-sm text-stone-500">{status.get(season.id) ? 'מפורסם' : status.has(season.id) ? 'טיוטה' : 'יצירת תיק'}</span></Link>)}</div></main>;
}
