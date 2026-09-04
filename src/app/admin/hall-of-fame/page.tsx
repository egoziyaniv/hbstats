import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import HallOfFameAdminClient from '@/components/admin/HallOfFameAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminHallOfFamePage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const [entries, players] = await Promise.all([
    prisma.hallOfFameEntry.findMany({
      orderBy: [{ rank: 'asc' }, { createdAt: 'desc' }],
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
        <h1 className="text-3xl font-black text-stone-900">ניהול היכל התהילה</h1>
        <p className="mt-2 text-sm text-stone-600">
          הוספה, עריכה ומחיקה של דמויות מופת — שחקנים, מאמנים ואגדות.
        </p>
      </header>
      <HallOfFameAdminClient initialEntries={JSON.parse(JSON.stringify(entries))} players={players} />
    </div>
  );
}
