import Link from 'next/link';
import { buildClubHubPayload } from '@/lib/club-hub';
import type { ClubPageSummary } from '@shared/types/mobile-api';
import HonorCard from '@/components/HonorCard';
import LegendCard from '@/components/LegendCard';

export const dynamic = 'force-dynamic';

const CATEGORY_HE: Record<ClubPageSummary['category'], string> = {
  HISTORY: 'היסטוריה',
  STADIUM: 'אצטדיון',
  IDENTITY: 'זהות',
  CULTURE: 'תרבות',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-2xl font-black text-stone-900">
      {children}
    </h2>
  );
}

function honorCount(honors: Awaited<ReturnType<typeof buildClubHubPayload>>['honors'], comp: string): number {
  return honors.find((h) => h.competitionHe === comp)?.winners.length ?? 0;
}

export default async function ClubPage() {
  const { honors, totalTitles, hallOfFame, pages } = await buildClubHubPayload();

  const leagueTitles = honorCount(honors, 'ליגת העל');
  const cupTitles = honorCount(honors, 'גביע המדינה');

  const stats: Array<{ value: number; label: string }> = [
    { value: totalTitles, label: 'תארים בסך הכול' },
    { value: leagueTitles, label: 'אליפויות ליגת העל' },
    { value: cupTitles, label: 'גביעי המדינה' },
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8 space-y-8">
      {/* Club hero */}
      <section className="modern-card overflow-hidden rounded-3xl border border-stone-200/80 bg-[linear-gradient(135deg,var(--accent),#7f1d1d)] p-8 text-white shadow-sm">
        <div className="flex flex-col items-center gap-5 text-center sm:flex-row sm:items-center sm:text-right">
          <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-white/15 ring-4 ring-white/20">
            <svg viewBox="0 0 24 24" className="h-14 w-14 text-white" fill="currentColor" aria-hidden="true">
              <path d="M12 2 4 5v6c0 5 3.4 8.5 8 11 4.6-2.5 8-6 8-11V5l-8-3Zm0 2.15 6 2.25V11c0 3.9-2.5 6.8-6 8.85C8.5 17.8 6 14.9 6 11V6.4l6-2.25Z" />
            </svg>
          </span>
          <div>
            <h1 className="text-3xl font-black sm:text-4xl">הפועל באר שבע</h1>
            <p className="mt-2 text-sm font-semibold text-white/80">הגמלים · האדומים מהדרום</p>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-white/10 px-3 py-4 text-center backdrop-blur">
              <div className="text-3xl font-black leading-none sm:text-4xl">{s.value}</div>
              <div className="mt-1.5 text-xs font-semibold text-white/75">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Honors board */}
      {honors.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading>לוח התארים</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {honors.map((honor) => (
              <HonorCard key={honor.competitionHe} honor={honor} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Hall of fame */}
      {hallOfFame.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading>היכל התהילה</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hallOfFame.map((item) => (
              <LegendCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      ) : null}

      {/* Club pages */}
      {pages.length > 0 ? (
        <section className="space-y-4">
          <SectionHeading>הכר את המועדון</SectionHeading>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((page) => (
              <Link
                key={page.slug}
                href={`/club/${page.slug}`}
                className="group modern-card block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow-md"
              >
                {page.heroImageUrl ? (
                  <div className="relative aspect-[16/9] w-full overflow-hidden bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={page.heroImageUrl}
                      alt={page.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                    />
                  </div>
                ) : null}
                <div className="p-5">
                  <span className="inline-block rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-500">
                    {CATEGORY_HE[page.category]}
                  </span>
                  <h3 className="mt-3 text-lg font-black text-stone-900 transition group-hover:text-[var(--accent)]">
                    {page.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
