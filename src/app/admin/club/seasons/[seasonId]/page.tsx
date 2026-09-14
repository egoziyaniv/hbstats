import Link from 'next/link';
import { notFound } from 'next/navigation';
import SeasonDossierAdminClient from '@/components/admin/SeasonDossierAdminClient';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { buildSeasonDossier } from '@/lib/season-dossier';

export const dynamic = 'force-dynamic';

export default async function AdminSeasonDossierPage({ params }: { params: Promise<{ seasonId: string }> }) {
  await requireAdminUser();
  const { seasonId } = await params;
  const dossier = await buildSeasonDossier(seasonId, { includeDrafts: true });
  if (!dossier) notFound();
  const publication = await prisma.clubSeasonDossier.findUnique({
    where: { seasonId_teamId: { seasonId, teamId: dossier.team.id } },
    select: {
      isPublished: true,
      publishedAt: true,
      moments: { select: { id: true, isPublished: true, gameId: true, mediaAssetId: true, imageUrl: true } },
    },
  });

  return (
    <main dir="rtl" className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/admin" className="text-sm font-bold text-red-800">חזרה לאדמין</Link>
            <h1 className="mt-2 text-3xl font-black text-stone-900">תיק עונה — {dossier.season.name}</h1>
            <p className="mt-1 text-sm text-stone-600">עריכת הסיפור, ציר הזמן והמקורות. המדדים מחושבים מנתוני המשחקים.</p>
          </div>
          <Link href={`/club/seasons/${seasonId}`} className="rounded-full border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700">תצוגה ציבורית</Link>
        </header>
        <SeasonDossierAdminClient
          seasonId={seasonId}
          initialDossier={JSON.parse(JSON.stringify(dossier))}
          initialPublication={{
            isPublished: publication?.isPublished ?? false,
            publishedAt: publication?.publishedAt?.toISOString() ?? null,
          }}
          initialMomentAdmin={Object.fromEntries((publication?.moments ?? []).map((moment) => [moment.id, moment]))}
        />
      </div>
    </main>
  );
}
