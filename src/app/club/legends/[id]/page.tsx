import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getLegend } from '@/lib/club-hub';
import type { LegendDetail } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

const ROLE_HE: Record<LegendDetail['role'], string> = {
  PLAYER: 'שחקן',
  COACH: 'מאמן',
  LEGEND: 'אגדה',
};

function monogram(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('');
}

export default async function LegendPage({ params }: { params: { id: string } }) {
  const legend = await getLegend(params.id);
  if (!legend) notFound();

  const metaParts = [ROLE_HE[legend.role], legend.years].filter(Boolean) as string[];
  const summary = legend.playerSummary;

  return (
    <div dir="rtl" className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <div>
        <Link href="/club" className="text-sm font-semibold text-stone-500 hover:text-[var(--accent)]">
          → חזרה לעמוד הקבוצה
        </Link>
      </div>

      {/* Hero */}
      <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-center sm:text-right">
          <div className="shrink-0">
            {legend.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={legend.photoUrl}
                alt={legend.nameHe}
                className="h-32 w-32 rounded-2xl border border-stone-200 bg-white object-cover object-top shadow-sm"
              />
            ) : (
              <div className="flex h-32 w-32 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),#7f1d1d)] shadow-sm">
                <span className="text-4xl font-black text-white/90">{monogram(legend.nameHe)}</span>
              </div>
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-3xl font-black text-stone-900 sm:text-4xl">{legend.nameHe}</h1>
            {metaParts.length > 0 ? (
              <p className="mt-2 text-sm text-stone-500">{metaParts.join(' · ')}</p>
            ) : null}
            {legend.statLineHe ? (
              <span className="mt-4 inline-flex w-fit rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-bold text-[var(--accent)]">
                {legend.statLineHe}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Contribution & stats */}
      {summary ? (
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
            תרומה וסטטיסטיקה
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-5 text-center">
              <div className="text-3xl font-black text-stone-900">{summary.appearances}</div>
              <div className="mt-1 text-sm font-semibold text-stone-500">הופעות</div>
            </div>
            <div className="rounded-xl border border-stone-200/80 bg-stone-50 p-5 text-center">
              <div className="text-3xl font-black text-stone-900">{summary.goals}</div>
              <div className="mt-1 text-sm font-semibold text-stone-500">שערים</div>
            </div>
          </div>
          {legend.playerId ? (
            <Link
              href={`/players/${legend.playerId}`}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-white transition hover:opacity-90"
            >
              לדף השחקן המלא
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
            </Link>
          ) : null}
        </section>
      ) : legend.statLineHe ? (
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
            תרומה וסטטיסטיקה
          </h2>
          <p className="mt-4 text-lg font-bold text-stone-800">{legend.statLineHe}</p>
        </section>
      ) : null}

      {/* Blurb */}
      {legend.blurbHe ? (
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <p className="whitespace-pre-line leading-loose text-stone-700">{legend.blurbHe}</p>
        </section>
      ) : null}

      {/* Video */}
      {legend.videoEmbedUrl ? (
        <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
          <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">סרטון</h2>
          <div className="mt-5 relative aspect-video w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-100">
            <iframe
              src={legend.videoEmbedUrl}
              title="סרטון"
              className="absolute inset-0 h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      ) : null}
    </div>
  );
}
