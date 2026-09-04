import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import HonorsAdminClient from '@/components/admin/HonorsAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminHonorsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const honors = await prisma.clubHonor.findMany({
    orderBy: [{ year: 'desc' }, { displayOrder: 'asc' }],
  });

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black text-stone-900">ניהול הישגים</h1>
        <p className="mt-2 text-sm text-stone-600">
          הוספה, עריכה ומחיקה של תארים והישגי המועדון.
        </p>
      </header>
      <HonorsAdminClient initialHonors={JSON.parse(JSON.stringify(honors))} />
    </div>
  );
}
