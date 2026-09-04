import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import ClubPagesAdminClient from '@/components/admin/ClubPagesAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminClubPagesPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') redirect('/login');

  const pages = await prisma.clubPage.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
  });

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-3xl font-black text-stone-900">ניהול עמודי מועדון</h1>
        <p className="mt-2 text-sm text-stone-600">
          הוספה, עריכה ומחיקה של עמודי תוכן — היסטוריה, אצטדיון, זהות ותרבות.
        </p>
      </header>
      <ClubPagesAdminClient initialPages={JSON.parse(JSON.stringify(pages))} />
    </div>
  );
}
