'use client';

/**
 * FotmobPlayerStatsTable — per-player match stats, grouped into category tabs
 * (מדדים מובילים / התקפה / מסירות / הגנה / דו-קרבים / שוערים). For the selected
 * category it renders two side-by-side tables (home + away), each sorted by
 * rating. Only columns that actually have data for the shown players appear, and
 * the top-rated player's rating cell is highlighted. Client component.
 */
import { useState } from 'react';
import type { FotmobPlayerRating } from '@shared/types/mobile-api';
import { PLAYER_STAT_CATEGORIES, labelHe, formatStatValue } from '@shared/fotmob-player-stats';

const RATING_LABEL = 'FotMob rating';

function ratingClass(r: number) {
  if (r >= 8) return 'bg-blue-600 text-white';
  if (r >= 7) return 'bg-emerald-500 text-white';
  if (r >= 6) return 'bg-amber-400 text-stone-900';
  return 'bg-orange-500 text-white';
}

function ratingOf(p: FotmobPlayerRating): number | null {
  const v = p.stats?.[RATING_LABEL];
  return typeof v === 'number' ? v : p.rating;
}

function StatsTeamTable({
  title,
  players,
  labels,
}: {
  title: string;
  players: FotmobPlayerRating[];
  labels: string[];
}) {
  if (players.length === 0) return null;
  const topRating = players.reduce<number | null>((max, p) => {
    const r = ratingOf(p);
    if (r == null) return max;
    return max == null || r > max ? r : max;
  }, null);

  return (
    <div>
      <h3 className="mb-2 text-sm font-black text-stone-800">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-right text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs text-stone-500">
              <th className="px-2 py-2.5 text-right font-bold">שחקן</th>
              {labels.map((label) => (
                <th key={label} className="whitespace-nowrap px-2 py-2.5 font-bold">
                  {labelHe(label)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={i} className="border-b border-stone-100 last:border-0">
                <td className="whitespace-nowrap px-2 py-2.5">
                  <span className="font-semibold text-stone-800">
                    {p.name}
                    {p.isGK ? ' (ש)' : ''}
                  </span>
                </td>
                {labels.map((label) => {
                  if (label === RATING_LABEL) {
                    const r = ratingOf(p);
                    return (
                      <td key={label} className="px-2 py-2.5">
                        {r != null ? (
                          <span
                            className={`inline-flex items-center gap-0.5 rounded-md px-2 py-0.5 text-xs font-black ${ratingClass(r)}`}
                          >
                            {r.toFixed(1)}
                            {topRating != null && r === topRating && topRating >= 7 ? ' ★' : ''}
                          </span>
                        ) : (
                          '–'
                        )}
                      </td>
                    );
                  }
                  return (
                    <td key={label} className="whitespace-nowrap px-2 py-2.5 text-stone-600">
                      {formatStatValue(label, p.stats?.[label])}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FotmobPlayerStatsTable({
  players,
  homeTeamName,
  awayTeamName,
}: {
  players: FotmobPlayerRating[];
  homeTeamName: string;
  awayTeamName: string;
}) {
  const hasGK = (players ?? []).some((p) => p.isGK);
  const categories = PLAYER_STAT_CATEGORIES.filter((c) => !c.gkOnly || hasGK);
  const [activeId, setActiveId] = useState(categories[0]?.id ?? '');

  if (!players || players.length === 0) return null;

  const active = categories.find((c) => c.id === activeId) ?? categories[0];
  if (!active) return null;

  // Only keep labels that at least one shown player actually has a value for.
  const labels = active.labels.filter((label) =>
    players.some((p) => {
      const v = p.stats?.[label];
      return v != null && v !== '';
    }),
  );

  const byRatingDesc = (a: FotmobPlayerRating, b: FotmobPlayerRating) =>
    (b.rating ?? -Infinity) - (a.rating ?? -Infinity);
  const homePlayers = players.filter((p) => p.isHome).sort(byRatingDesc);
  const awayPlayers = players.filter((p) => !p.isHome).sort(byRatingDesc);

  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <h2 className="mb-4 border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
        סטטיסטיקת שחקנים
      </h2>
      <div className="mb-5 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveId(c.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${
              c.id === active.id
                ? 'bg-stone-900 text-white shadow-sm'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {c.titleHe}
          </button>
        ))}
      </div>
      {labels.length === 0 ? (
        <p className="text-sm text-stone-500">אין נתונים זמינים לקטגוריה זו.</p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <StatsTeamTable title={homeTeamName} players={homePlayers} labels={labels} />
          <StatsTeamTable title={awayTeamName} players={awayPlayers} labels={labels} />
        </div>
      )}
    </section>
  );
}
