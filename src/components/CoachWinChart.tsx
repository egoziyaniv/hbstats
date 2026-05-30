/**
 * CoachWinChart — horizontal bar chart of coach tenures (FotMob style).
 *
 * Each column is one (coach, season) tenure showing win-% on top + points/game
 * underneath, with the coach's avatar and season label below. Bars share a
 * common baseline so the user can scan strong vs. weak years quickly.
 */

import type { CoachChartEntry } from '@/lib/coach-timeline';

const MAX_PPG = 3; // theoretical ceiling for normalisation

function Avatar({ entry }: { entry: CoachChartEntry }) {
  const initials = entry.displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
  if (entry.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={entry.photoUrl}
        alt={entry.displayName}
        className="h-12 w-12 rounded-full border border-stone-200 bg-stone-100 object-cover"
      />
    );
  }
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-xs font-black text-stone-600">
      {initials || '?'}
    </div>
  );
}

function shortLastName(displayName: string): string {
  const parts = displayName.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || displayName;
}

export function CoachWinChart({ entries }: { entries: CoachChartEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-stone-500">אין נתוני מאמנים זמינים.</p>;
  }

  return (
    <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-stone-900 p-5 text-white shadow-sm">
      <header className="mb-4">
        <h2 className="text-lg font-black">היסטוריית מאמנים — אחוז ניצחונות</h2>
        <p className="text-xs text-stone-400">ממוצע נקודות למשחק</p>
      </header>

      <div className="relative">
        <div className="h-48 rounded-xl border border-stone-700/60 bg-stone-800/40 p-4">
          <div className="flex h-full items-end gap-3 overflow-x-auto pb-1">
            {entries.map((e, i) => {
              const heightPct = Math.max(8, Math.min(100, (e.pointsPerGame / MAX_PPG) * 100));
              return (
                <div key={`${e.coachKey}-${e.seasonName}-${i}`} className="flex h-full min-w-[64px] flex-col items-center justify-end">
                  <div className="mb-1 rounded-md bg-red-600 px-2 py-0.5 text-xs font-bold">
                    {e.winPct}%
                  </div>
                  <div
                    className="w-full rounded-md bg-gradient-to-t from-red-700 to-red-500"
                    style={{ height: `${heightPct}%` }}
                    title={`${e.matches} משחקים · נ' ${e.wins} ת' ${e.draws} ה' ${e.losses}`}
                  />
                  <div className="mt-1 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-bold text-white">
                    {e.pointsPerGame.toFixed(1)} Pts
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex gap-3 overflow-x-auto">
          {entries.map((e, i) => (
            <div key={`label-${e.coachKey}-${e.seasonName}-${i}`} className="flex min-w-[64px] flex-col items-center text-center">
              <Avatar entry={e} />
              <p className="mt-1 text-[12px] font-bold leading-tight">{shortLastName(e.displayName)}</p>
              <p className="text-[10px] text-stone-400" dir="ltr">{e.seasonName}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
