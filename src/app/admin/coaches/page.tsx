import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminCoachesClient from '@/components/AdminCoachesClient';

export const dynamic = 'force-dynamic';

export default async function AdminCoachesPage() {
  const user = await getCurrentUser();

  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-16">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-stone-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-3xl font-black text-stone-900">גישה לאזור אדמין</h1>
          <p className="mt-4 text-sm leading-7 text-stone-600">
            צריך להיות מחובר עם משתמש מנהל כדי לנהל מאמנים.
          </p>
          <div className="mt-6 flex items-center justify-center gap-3">
            <Link href="/login" className="rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white">להתחברות</Link>
            <Link href="/admin" className="rounded-full border border-stone-300 px-5 py-3 text-sm font-bold text-stone-700">חזרה לאדמין</Link>
          </div>
        </div>
      </div>
    );
  }

  const coaches = await prisma.coach.findMany({
    include: {
      aliases: { select: { alias: true } },
      _count: { select: { assignments: true } },
    },
    orderBy: { nameEn: 'asc' },
  });

  // Aggregate match counts per alias from GameLineupEntry COACH rows.
  const lineupCounts = await prisma.gameLineupEntry.groupBy({
    by: ['participantName'],
    where: { role: 'COACH', participantName: { not: null } },
    _count: { _all: true },
  });
  const matchesByAlias = new Map<string, number>();
  for (const row of lineupCounts) {
    if (row.participantName) matchesByAlias.set(row.participantName, row._count._all);
  }

  const enriched = coaches.map((c) => ({
    ...c,
    matchCount: c.aliases.reduce((sum, a) => sum + (matchesByAlias.get(a.alias) || 0), 0),
  }));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black text-stone-900">ניהול מאמנים</h1>
            <p className="text-sm text-stone-600">{coaches.length} מאמנים סה&quot;כ — איחוד כפילויות + שמות בעברית</p>
          </div>
          <Link href="/admin" className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">חזרה לאדמין</Link>
        </header>
        <AdminCoachesClient initialCoaches={enriched} />
      </div>
    </div>
  );
}
