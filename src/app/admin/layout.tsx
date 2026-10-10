import AdminShell from '@/components/AdminShell';
import { getCurrentUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'ADMIN') return children;

  const seasons = await prisma.season.findMany({
    select: { id: true, name: true },
    orderBy: { year: 'desc' },
  });

  return (
    <div dir="rtl" className="bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)]">
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <AdminShell seasons={seasons} selectedSeasonId={seasons[0]?.id ?? null} />
      </div>
      {children}
    </div>
  );
}
