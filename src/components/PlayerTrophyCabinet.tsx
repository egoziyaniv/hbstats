/**
 * PlayerTrophyCabinet — visual grid of trophies a player has won (or finished
 * runner-up), grouped by league. Renders golden cups for wins and silver
 * outlines for runner-ups. Empty when the player has no PlayerTrophy rows.
 */
import type { TrophyGroup } from '@/lib/player-trophies';

export function PlayerTrophyCabinet({ trophies }: { trophies: TrophyGroup[] }) {
  if (trophies.length === 0) {
    return <p className="text-sm text-stone-500">אין הישגים רשומים.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {trophies.map((t) => (
        <div key={t.leagueNameHe} className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h4 className="text-sm font-black text-stone-900">{t.leagueNameHe}</h4>
              {t.countryHe || t.countryEn ? (
                <p className="text-[11px] font-semibold text-stone-500">{t.countryHe || t.countryEn}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-2xl">
              {Array.from({ length: Math.min(t.wins, 6) }).map((_, i) => (
                <span key={i} title="זכייה">🏆</span>
              ))}
              {Array.from({ length: Math.min(t.runnerUps, 4) }).map((_, i) => (
                <span key={`r-${i}`} title="סגן" className="opacity-50">🥈</span>
              ))}
            </div>
          </div>
          {t.seasonsWon.length > 0 ? (
            <p className="mt-2 text-[11px] font-semibold text-amber-700">
              עונות: {t.seasonsWon.slice(0, 8).join(' · ')}
              {t.seasonsWon.length > 8 ? ` +${t.seasonsWon.length - 8}` : ''}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}
