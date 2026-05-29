/**
 * PlayerOverviewPanel — AI-generated narrative + optional Wikipedia summary
 * for a player. Reads from Player.additionalInfo.aiSummary written by
 * scripts/fetch-player-overviews.js.
 */

interface AiSummary {
  text: string;
  generatedAt: string;
  wiki?: {
    title?: string;
    summary?: string;
    thumbnail?: string | null;
    sourceUrl?: string;
  } | null;
}

export function PlayerOverviewPanel({ ai, playerName }: { ai: AiSummary | null; playerName: string }) {
  if (!ai?.text) return null;
  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">סקירה</h2>
        {ai.wiki?.sourceUrl ? (
          <a href={ai.wiki.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-stone-500 hover:text-stone-800">
            מקור: Wikipedia ›
          </a>
        ) : null}
      </header>

      <div className="rounded-xl bg-stone-50 p-4">
        <p className="text-sm leading-relaxed text-stone-800">{ai.text}</p>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          ניתוח AI · עודכן {new Date(ai.generatedAt).toLocaleDateString('he-IL')}
        </p>
      </div>

      {ai.wiki?.summary ? (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
          {ai.wiki.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ai.wiki.thumbnail} alt={playerName} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
          ) : null}
          <p className="flex-1 text-sm leading-relaxed text-stone-700">{ai.wiki.summary}</p>
        </div>
      ) : null}
    </section>
  );
}
