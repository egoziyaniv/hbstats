/**
 * TeamOverviewPanel — narrative card on the team page combining the cached
 * Wikipedia summary (background, founding year, stadium) with an AI-generated
 * sentence about the current season's form.
 */

interface WikiInfo {
  title?: string;
  description?: string | null;
  summary?: string;
  thumbnail?: string | null;
  sourceUrl?: string;
  lang?: string;
  fetchedAt?: string;
}

interface AiSummary {
  text: string;
  generatedAt: string;
  locale?: string;
}

export function TeamOverviewPanel({
  wiki,
  ai,
  teamNameHe,
}: {
  wiki: WikiInfo | null;
  ai: AiSummary | null;
  teamNameHe: string;
}) {
  if (!wiki && !ai) return null;
  return (
    <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
      <div className="px-6 py-5">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">סקירה</h2>
          {wiki?.sourceUrl ? (
            <a href={wiki.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-stone-500 hover:text-stone-800">
              מקור: Wikipedia ›
            </a>
          ) : null}
        </header>

        {ai ? (
          <div className="mb-4 rounded-xl bg-stone-50 p-4">
            <p className="text-sm leading-relaxed text-stone-800">{ai.text}</p>
            <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
              ניתוח AI · עודכן {new Date(ai.generatedAt).toLocaleDateString('he-IL')}
            </p>
          </div>
        ) : null}

        {wiki?.summary ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {wiki.thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={wiki.thumbnail} alt={teamNameHe} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
            ) : null}
            <div className="flex-1">
              {wiki.description ? <p className="text-xs font-bold text-stone-500">{wiki.description}</p> : null}
              <p className="mt-1 text-sm leading-relaxed text-stone-700">{wiki.summary}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
