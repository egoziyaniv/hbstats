/**
 * PlayerTrophyCabinet — visual card per (league, country) showing every win
 * and runner-up the player collected, with team affiliation per season. The
 * championship-trophy icon for Israeli leagues uses 🥇 ("plate") instead of
 * 🏆 so it reads more like the actual Ligat HaAl winners' plate.
 */
import type { TrophyGroup } from '@/lib/player-trophies';

function pickWinIcon(leagueHe: string, countryEn: string | null): string {
  // Israeli Ligat HaAl champions get the gold-medal/plate icon. Otherwise 🏆.
  if (countryEn === 'Israel' && leagueHe === 'ליגת העל') return '🥇';
  return '🏆';
}

export function PlayerTrophyCabinet({ trophies }: { trophies: TrophyGroup[] }) {
  if (trophies.length === 0) {
    return <p className="text-sm text-stone-500">אין הישגים רשומים.</p>;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {trophies.map((t) => {
        const winIcon = pickWinIcon(t.leagueNameHe, t.countryEn);
        return (
          <div key={`${t.leagueNameHe}|${t.countryEn || ''}`} className="rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <h4 className="text-sm font-black text-stone-900">{t.leagueNameHe}</h4>
                {t.countryHe ? (
                  <p className="text-[11px] font-semibold text-stone-500">{t.countryHe}</p>
                ) : null}
                <div className="mt-1 flex items-center gap-3 text-xs font-bold">
                  {t.wins > 0 ? <span className="text-amber-700">{winIcon} {t.wins}</span> : null}
                  {t.runnerUps > 0 ? <span className="text-stone-500">🥈 {t.runnerUps}</span> : null}
                </div>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              {t.details.slice(0, 12).map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2 py-1 text-[11px]">
                  <span className="font-semibold text-stone-700" dir="ltr">{d.seasonLabel}</span>
                  <span className="flex-1 text-stone-600 text-right">{d.teamName || ''}</span>
                  <span className={d.kind === 'win' ? 'text-amber-700' : 'text-stone-400'}>
                    {d.kind === 'win' ? winIcon : '🥈'}
                  </span>
                </div>
              ))}
              {t.details.length > 12 ? (
                <p className="text-[10px] text-stone-400">+{t.details.length - 12} עוד</p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
