import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminSofascoreClient from '@/components/AdminSofascoreClient';

export const dynamic = 'force-dynamic';

export default async function AdminSofascorePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">צריך משתמש מנהל.</p>
          <div className="mt-6">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
          </div>
        </div>
      </div>
    );
  }

  const [ratingsCount, teamStatsCount, lineupRatedCount] = await Promise.all([
    prisma.playerMatchRating.count({ where: { source: 'sofascore' } }),
    prisma.sofascoreTeamStats.count(),
    prisma.gameLineupEntry.count({ where: { rating: { not: null }, playerId: { not: null } } }),
  ]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-3xl font-black text-stone-900">משיכת נתוני Sofascore</h1>
          <Link href="/admin" className="text-sm font-bold text-stone-600 underline">חזרה לאדמין</Link>
        </div>

        <div className="mb-6 rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-stone-900">ארכיון נוכחי</h2>
          <div className="mt-3 grid gap-2 text-sm text-stone-700 sm:grid-cols-3">
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">ציוני משחק (Sofascore)</div>
              <div className="text-2xl font-black text-stone-900">{ratingsCount.toLocaleString('he-IL')}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">סטטיסטיקות קבוצה (Sofascore)</div>
              <div className="text-2xl font-black text-stone-900">{teamStatsCount.toLocaleString('he-IL')}</div>
            </div>
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="text-stone-500">Lineup Entries עם ציון (Flashscore)</div>
              <div className="text-2xl font-black text-stone-900">{lineupRatedCount.toLocaleString('he-IL')}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-stone-500">
            צריך משתנה סביבה <code dir="ltr">FIRECRAWL_API_KEY</code> בשרת לפעולות Sofascore. ה-Backfill עובד בלי API חיצוני.
          </p>
        </div>

        <AdminSofascoreClient />
      </div>
    </div>
  );
}
