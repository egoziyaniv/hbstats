import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import AdminRatingsEditor from '@/components/AdminRatingsEditor';

export const dynamic = 'force-dynamic';

const SOURCES = ['api-football', 'sofascore', 'fotmob', 'admin'] as const;

export default async function AdminRatingsForGamePage({ params }: { params: { gameId: string } }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen px-4 py-16 text-center">
        <h1 className="text-2xl font-black">נדרשת הרשאת אדמין</h1>
        <Link href="/admin" className="mt-4 inline-block rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white">חזרה</Link>
      </div>
    );
  }

  const game = await prisma.game.findUnique({
    where: { id: params.gameId },
    select: {
      id: true, dateTime: true, homeScore: true, awayScore: true,
      homeTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
      awayTeam: { select: { id: true, nameHe: true, nameEn: true, logoUrl: true } },
      lineupEntries: {
        where: { role: { in: ['STARTER', 'SUBSTITUTE'] } },
        select: {
          playerId: true,
          teamId: true,
          jerseyNumber: true,
          role: true,
          player: { select: { id: true, nameHe: true, nameEn: true, position: true, photoUrl: true } },
        },
        orderBy: [{ role: 'asc' }, { jerseyNumber: 'asc' }],
      },
    },
  });
  if (!game) notFound();

  const ratingRows = await prisma.playerMatchRating.findMany({
    where: { gameId: params.gameId },
    select: { id: true, playerId: true, source: true, rating: true, notes: true },
  });
  const ratingsByPlayer = new Map<string, Record<string, { id: string; rating: number; notes: string | null }>>();
  for (const r of ratingRows) {
    if (!r.playerId) continue;
    let bucket = ratingsByPlayer.get(r.playerId);
    if (!bucket) { bucket = {}; ratingsByPlayer.set(r.playerId, bucket); }
    bucket[r.source] = { id: r.id, rating: r.rating, notes: r.notes };
  }

  const players = game.lineupEntries
    .filter((e) => e.playerId && e.player)
    .map((e) => ({
      playerId: e.playerId!,
      jerseyNumber: e.jerseyNumber,
      role: e.role,
      teamId: e.teamId,
      teamSide: (e.teamId === game.homeTeam.id ? 'home' : 'away') as 'home' | 'away',
      displayName: e.player!.nameHe || e.player!.nameEn,
      position: e.player!.position,
      photoUrl: e.player!.photoUrl,
      ratings: ratingsByPlayer.get(e.playerId!) || {},
    }));

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link href="/admin/ratings" className="text-xs font-semibold text-stone-500 hover:text-stone-800">‹ חזרה למשחקים</Link>
            <h1 className="mt-1 text-2xl font-black text-stone-900">
              {game.homeTeam.nameHe || game.homeTeam.nameEn} <span className="text-stone-400">{game.homeScore}-{game.awayScore}</span> {game.awayTeam.nameHe || game.awayTeam.nameEn}
            </h1>
            <p className="text-xs text-stone-500" dir="ltr">{game.dateTime.toISOString().slice(0, 10)}</p>
          </div>
          <Link href={`/games/${game.id}`} className="rounded-full border border-stone-300 px-4 py-2 text-sm font-bold text-stone-700">צפה במשחק</Link>
        </header>

        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          רק ה-Admin column ניתן לעריכה. ערכי ה-API נטענים אוטומטית. הציון הסופי שמוצג ב-Best XI הוא ממוצע כל המקורות.
        </p>

        <AdminRatingsEditor initial={{ game: {
          id: game.id,
          dateTime: game.dateTime.toISOString(),
          homeScore: game.homeScore,
          awayScore: game.awayScore,
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
        }, sources: SOURCES, players }} />
      </div>
    </div>
  );
}
