import Link from 'next/link';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'פרקים בתולדות המועדון | StatsAI' };
export default async function ErasPage() {
  const pages = await prisma.clubPage.findMany({ where: { category: 'HISTORY', isPublished: true }, select: { id: true, slug: true, title: true }, orderBy: [{ displayOrder: 'asc' }, { title: 'asc' }] });
  return <main dir="rtl" className="mx-auto max-w-4xl space-y-6 px-4 py-10"><Link href="/club" className="underline">חזרה למועדון</Link><h1 className="text-3xl font-black">פרקים בתולדות המועדון</h1><p>פרקי ההיסטוריה שפורסמו באתר. התוכן נערך בנפרד מהסטטיסטיקה; הארכיון אינו בהכרח מכסה כל תקופה.</p>{pages.length ? <div className="grid gap-4 sm:grid-cols-2">{pages.map(page => <Link key={page.id} href={`/club/${encodeURIComponent(page.slug)}`} className="rounded-2xl border bg-white p-6 text-xl font-bold">{page.title}<span className="mt-3 block text-sm font-normal underline">לקריאת הפרק</span></Link>)}</div> : <p className="rounded-2xl border bg-white p-6">עדיין לא פורסמו פרקי היסטוריה. אפשר בינתיים לעיין <Link href="/club/seasons" className="underline">בתיקי העונות</Link>.</p>}</main>;
}
