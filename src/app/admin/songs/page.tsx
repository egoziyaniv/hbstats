import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import SongsAdminClient from '@/components/admin/SongsAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminSongsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const [songs, players] = await Promise.all([
    prisma.song.findMany({
      orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
      include: { player: { select: { id: true, nameHe: true } } },
    }),
    prisma.player.findMany({
      select: { id: true, nameHe: true },
      orderBy: { nameHe: 'asc' },
    }),
  ]);

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black text-stone-900">ניהול שירים</h1>
        <p className="mt-2 text-sm text-stone-600">
          הוספה, עריכה ומחיקה של שירי יציע, שירי שחקנים ושירי אליפות.
        </p>
      </header>
      <SongsAdminClient initialSongs={JSON.parse(JSON.stringify(songs))} players={players} />
    </div>
  );
}
