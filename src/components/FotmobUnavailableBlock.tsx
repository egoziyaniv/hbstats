/**
 * FotmobUnavailableBlock — injured / suspended players for both teams ahead of
 * a game. Each player shows a Hebrew name, a type badge (פציעה / הרחקה) and an
 * optional "expected return" subline. Renders nothing when there is no data.
 * Server component.
 */
import type { FotmobUnavailablePlayer } from '@shared/types/mobile-api';
import { unavailabilityTypeHe, formatReturnHe } from '@shared/fotmob-player-stats';

function TypeBadge({ type }: { type: 'injury' | 'suspension' }) {
  const isSuspension = type === 'suspension';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-xs font-black ${
        isSuspension ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-700'
      }`}
    >
      <span aria-hidden="true">{isSuspension ? '🟥' : '🩹'}</span>
      {unavailabilityTypeHe(type)}
    </span>
  );
}

function TeamColumn({ title, players }: { title: string; players: FotmobUnavailablePlayer[] }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-black text-stone-800">{title}</h3>
      {players.length === 0 ? (
        <p className="text-sm text-stone-400">אין נעדרים ידועים.</p>
      ) : (
        <ul className="space-y-2.5">
          {players.map((p, i) => {
            const ret = formatReturnHe(p.expectedReturnDate, p.expectedReturn);
            return (
              <li
                key={i}
                className="flex items-start justify-between gap-3 rounded-xl border border-stone-200/80 bg-stone-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-stone-800">{p.name}</div>
                  {ret ? <div className="mt-0.5 text-xs text-stone-500">{ret}</div> : null}
                </div>
                <TypeBadge type={p.type} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function FotmobUnavailableBlock({
  unavailable,
  homeTeamName,
  awayTeamName,
}: {
  unavailable: { home: FotmobUnavailablePlayer[]; away: FotmobUnavailablePlayer[] } | null;
  homeTeamName: string;
  awayTeamName: string;
}) {
  const home = unavailable?.home ?? [];
  const away = unavailable?.away ?? [];
  if (home.length === 0 && away.length === 0) return null;

  return (
    <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
      <h2 className="mb-4 border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">
        פציעות והרחקות
      </h2>
      <div className="grid gap-6 xl:grid-cols-2">
        <TeamColumn title={homeTeamName} players={home} />
        <TeamColumn title={awayTeamName} players={away} />
      </div>
    </section>
  );
}
