import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getClubPage } from '@/lib/club-hub';
import type { ClubPageDetail } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

const CATEGORY_HE: Record<ClubPageDetail['category'], string> = {
  HISTORY: 'היסטוריה',
  STADIUM: 'אצטדיון',
  IDENTITY: 'זהות',
  CULTURE: 'תרבות',
};

export default async function ClubDetailPage({ params }: { params: { slug: string } }) {
  const page = await getClubPage(params.slug);
  if (!page) notFound();

  return (
    <div dir="rtl" className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <Link href="/club" className="text-sm font-semibold text-stone-500 hover:text-[var(--accent)]">
            → חזרה לעמוד הקבוצה
          </Link>
        </div>

        <header className="space-y-3">
          <span className="inline-block rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
            {CATEGORY_HE[page.category]}
          </span>
          <h1 className="text-3xl font-black leading-tight text-stone-900 sm:text-4xl">{page.title}</h1>
        </header>

        {page.heroImageUrl ? (
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-100 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={page.heroImageUrl} alt={page.title} className="h-full w-full object-cover" />
          </div>
        ) : null}

        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <div className="whitespace-pre-line leading-loose text-stone-800">{page.bodyHe}</div>
        </section>
      </div>
    </div>
  );
}
