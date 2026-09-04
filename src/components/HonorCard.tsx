import type { ClubHonorGroup } from '@shared/types/mobile-api';

// A trophy card for a single competition: big winners count + winning seasons,
// with a small runner-up subline.
export default function HonorCard({ honor }: { honor: ClubHonorGroup }) {
  const winCount = honor.winners.length;
  const runnerUpCount = honor.runnersUp.length;

  return (
    <div className="modern-card flex flex-col rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-stone-900">{honor.competitionHe}</h3>
          <p className="mt-1 text-sm text-stone-500">אליפויות</p>
        </div>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
            <path d="M18 2H6v2H2v3a5 5 0 0 0 4.9 5 5.001 5.001 0 0 0 4.1 3.9V19H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.1A5.001 5.001 0 0 0 17.1 12 5 5 0 0 0 22 7V4h-4V2Zm0 4h2v1a3 3 0 0 1-2 2.83V6ZM6 6v3.83A3 3 0 0 1 4 7V6h2Z" />
          </svg>
        </span>
      </div>

      <div className="mt-4 flex items-baseline gap-2">
        <span className="text-5xl font-black leading-none text-[var(--accent)]">{winCount}</span>
        <span className="text-sm font-semibold text-stone-400">
          {winCount === 1 ? 'תואר' : 'תארים'}
        </span>
      </div>

      {honor.winners.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {honor.winners.map((season) => (
            <span
              key={season}
              className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-500"
            >
              {season}
            </span>
          ))}
        </div>
      ) : null}

      {runnerUpCount > 0 ? (
        <p className="mt-auto pt-4 text-xs font-semibold text-stone-400">
          {runnerUpCount === 1 ? 'סגן אחד' : `${runnerUpCount} פעמים סגן אלופה`}
        </p>
      ) : null}
    </div>
  );
}
