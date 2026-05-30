/**
 * GoalTimingChart — back-to-back bar chart of goals scored (green, going up)
 * vs. conceded (red, going down) split into 15-minute buckets across the
 * season. Helps spot a team's strongest/weakest periods of play.
 */
import type { GoalTimingBucket } from '@/lib/goal-timing';

export function GoalTimingChart({ buckets }: { buckets: GoalTimingBucket[] }) {
  if (buckets.length === 0) return null;
  const maxValue = Math.max(1, ...buckets.flatMap((b) => [b.scored, b.conceded]));

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-center justify-between">
        <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-lg font-black text-stone-900">תזמון שערים</h2>
        <div className="flex items-center gap-3 text-xs font-semibold">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500" /> כבושים</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-500" /> ספוגים</span>
        </div>
      </header>

      <div className="flex items-end gap-2 sm:gap-3">
        {buckets.map((b) => {
          const scoredH = (b.scored / maxValue) * 100;
          const concededH = (b.conceded / maxValue) * 100;
          return (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-32 w-full flex-col items-stretch justify-end">
                <div
                  className="rounded-t bg-emerald-500"
                  style={{ height: `${scoredH}%`, minHeight: b.scored > 0 ? '4px' : 0 }}
                  title={`כבושים: ${b.scored}`}
                />
              </div>
              <div className="text-[11px] font-black text-stone-700">{b.scored}</div>
              <div className="h-px w-full bg-stone-300" />
              <div className="text-[11px] font-black text-stone-700">{b.conceded}</div>
              <div className="flex h-32 w-full flex-col items-stretch justify-start">
                <div
                  className="rounded-b bg-red-500"
                  style={{ height: `${concededH}%`, minHeight: b.conceded > 0 ? '4px' : 0 }}
                  title={`ספוגים: ${b.conceded}`}
                />
              </div>
              <div className="mt-1 text-[10px] font-bold text-stone-500" dir="ltr">{b.label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
