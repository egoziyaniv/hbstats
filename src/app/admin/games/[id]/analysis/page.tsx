import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getAdminAnalyses } from '@/lib/match-analysis/admin';
import MatchAnalysisClient from '@/components/admin/MatchAnalysisClient';

export const dynamic = 'force-dynamic';

export default async function AdminGameAnalysisPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const game = await prisma.game.findUnique({
    where: { id: params.id },
    select: {
      id: true, homeScore: true, awayScore: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
  });
  if (!game) redirect('/admin/games');

  const homeName = game.homeTeam.nameHe || game.homeTeam.nameEn;
  const awayName = game.awayTeam.nameHe || game.awayTeam.nameEn;
  const analyses = await getAdminAnalyses(game.id);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-10" dir="rtl">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-stone-900">
              ניתוח — {homeName} {game.homeScore ?? ''}-{game.awayScore ?? ''} {awayName}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              ניתוח אחרי המשחק וטור לקראת המשחק הבא. המספרים מחושבים מהנתונים; ה-AI רק מנסח. שום דבר לא מוצג לפני אישור.
            </p>
          </div>
          <Link href={`/games/${game.id}`} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700">
            לדף המשחק
          </Link>
        </div>
        <MatchAnalysisClient gameId={game.id} initial={analyses} />
      </div>
    </div>
  );
}
