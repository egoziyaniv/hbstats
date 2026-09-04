import Link from 'next/link';
import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import GameEditorialClient from '@/components/admin/GameEditorialClient';

export const dynamic = 'force-dynamic';

export default async function AdminGameEditorialPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const game = await prisma.game.findUnique({
    where: { id: params.id },
    include: {
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      editorial: true,
      mediaAssets: {
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, filePath: true, title: true },
      },
    },
  });

  if (!game) redirect('/admin/games');

  const homeName = game.homeTeam.nameHe || game.homeTeam.nameEn;
  const awayName = game.awayTeam.nameHe || game.awayTeam.nameEn;

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-stone-900">
              עריכת תוכן — {homeName} נגד {awayName}
            </h1>
            <p className="mt-1 text-sm text-stone-600">
              תקציר וידאו, כתבת סיכום, פקט מהמשחק וגלריית תמונות.
            </p>
          </div>
          <Link
            href={`/games/${game.id}`}
            className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700"
          >
            לדף המשחק
          </Link>
        </div>

        <GameEditorialClient
          gameId={game.id}
          homeName={homeName}
          awayName={awayName}
          initialEditorial={JSON.parse(JSON.stringify(game.editorial))}
          initialGallery={JSON.parse(JSON.stringify(game.mediaAssets))}
        />
      </div>
    </div>
  );
}
