'use client';

/**
 * PlayerMatchStatsModal — clicking a player in the game-page lineup opens a
 * Flashscore-style popup with that player's detailed match stats (rating,
 * shots, passes, key passes, duels, dribbles, etc.) pulled from API-Football.
 */

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface PlayerMatchStats {
  apiFootballPlayerId: number;
  playerId: string | null;
  name: string | null;
  rating: number | null;
  minutes: number | null;
  position: string | null;
  captain: boolean;
  substitute: boolean;
  goals: number | null;
  assists: number | null;
  shots: { total: number | null; on: number | null };
  passes: { total: number | null; key: number | null; accuracy: number | null };
  tackles: { total: number | null; interceptions: number | null };
  duels: { total: number | null; won: number | null };
  dribbles: { attempts: number | null; success: number | null };
  fouls: { drawn: number | null; committed: number | null };
  cards: { yellow: number | null; red: number | null };
}

function ratingColor(rating: number | null): string {
  if (rating == null) return 'bg-stone-300';
  if (rating >= 8) return 'bg-emerald-600';
  if (rating >= 7) return 'bg-amber-500';
  if (rating >= 6) return 'bg-stone-500';
  return 'bg-red-500';
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-center justify-between border-b border-stone-100 py-2 text-sm">
      <span className="text-stone-600">{label}</span>
      <span className="font-bold text-stone-900">{value}</span>
    </div>
  );
}

function pctText(success: number | null, total: number | null) {
  if (success == null || total == null || total === 0) return null;
  return `${success}/${total} (${Math.round((success / total) * 100)}%)`;
}

export function PlayerMatchStatsModal({
  open,
  onClose,
  stats,
  playerLabel,
}: {
  open: boolean;
  onClose: () => void;
  stats: PlayerMatchStats | null;
  playerLabel?: string;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  // Render via portal so the modal escapes any ancestor with overflow-hidden,
  // transform, or filter — those would otherwise turn our `fixed` into a
  // relative-to-ancestor positioning context and let the lineup pitch show
  // through.
  return createPortal((
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4">
          <div>
            <h2 className="text-xl font-black text-stone-900">{stats?.name || playerLabel || 'שחקן'}</h2>
            {stats?.position ? (
              <p className="mt-0.5 text-xs font-semibold text-stone-500">
                {stats.position}
                {stats.captain ? ' · קפטן' : ''}
                {stats.substitute ? ' · החליף' : ''}
              </p>
            ) : null}
          </div>
          <button onClick={onClose} className="rounded-full px-2 py-1 text-2xl leading-none text-stone-400 hover:text-stone-900" aria-label="סגור">×</button>
        </header>

        {!stats ? (
          <div className="p-8 text-center text-sm text-stone-500">אין נתונים מפורטים זמינים לשחקן זה במשחק זה.</div>
        ) : (
          <>
            <div className="flex items-stretch border-b border-stone-200 bg-stone-50">
              <div className="flex-1 px-5 py-4 text-center">
                <div className="text-2xl font-black text-stone-900">{stats.minutes ?? '—'}{stats.minutes != null ? "'" : ''}</div>
                <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-stone-500">דקות</div>
              </div>
              {stats.rating != null ? (
                <div className="flex flex-1 items-center justify-center px-5 py-4">
                  <span className={`flex h-12 w-16 items-center justify-center rounded-lg text-xl font-black text-white shadow-sm ${ratingColor(stats.rating)}`}>
                    {stats.rating.toFixed(1)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="px-5 py-3">
              <h3 className="mb-1 text-xs font-black uppercase tracking-wider text-stone-500">תקיפה</h3>
              <Row label="שערים" value={stats.goals} />
              <Row label="בישולים" value={stats.assists} />
              <Row label="בעיטות" value={pctText(stats.shots.on, stats.shots.total)} />
              <Row label="דריבלים מוצלחים" value={pctText(stats.dribbles.success, stats.dribbles.attempts)} />
            </div>

            <div className="px-5 py-3 border-t border-stone-100">
              <h3 className="mb-1 text-xs font-black uppercase tracking-wider text-stone-500">משחק קישור</h3>
              <Row label="מסירות מפתח" value={stats.passes.key} />
              <Row label="סך מסירות" value={stats.passes.total} />
              <Row label="דיוק מסירות" value={stats.passes.accuracy != null ? `${stats.passes.accuracy}%` : null} />
            </div>

            <div className="px-5 py-3 border-t border-stone-100">
              <h3 className="mb-1 text-xs font-black uppercase tracking-wider text-stone-500">הגנה ועוצמה</h3>
              <Row label="חטיפות" value={stats.tackles.total} />
              <Row label="יירוטים" value={stats.tackles.interceptions} />
              <Row label="דו-קרבות" value={pctText(stats.duels.won, stats.duels.total)} />
              <Row label="עבירות" value={stats.fouls.committed != null && stats.fouls.drawn != null ? `${stats.fouls.committed} ביצע / ${stats.fouls.drawn} עליו` : null} />
            </div>

            {(stats.cards.yellow || stats.cards.red) ? (
              <div className="px-5 py-3 border-t border-stone-100">
                <h3 className="mb-1 text-xs font-black uppercase tracking-wider text-stone-500">כרטיסים</h3>
                <Row label="צהוב" value={stats.cards.yellow} />
                <Row label="אדום" value={stats.cards.red} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  ), document.body);
}

/**
 * GamePlayerStatsProvider — fetches all per-player stats for the game once
 * and exposes a button-trigger for each player by apiFootballId.
 */
export function GamePlayerStatsTrigger({ gameId, apiFootballPlayerId, children, playerLabel }: {
  gameId: string;
  apiFootballPlayerId: number | null;
  children: React.ReactNode;
  playerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<PlayerMatchStats | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function handleOpen() {
    setOpen(true);
    if (loaded || !apiFootballPlayerId) return;
    const res = await fetch(`/api/games/${gameId}/player-stats`).then((r) => r.json()).catch(() => null);
    const found = res?.players?.find((p: PlayerMatchStats) => p.apiFootballPlayerId === apiFootballPlayerId) ?? null;
    setStats(found);
    setLoaded(true);
  }

  return (
    <>
      <button type="button" onClick={handleOpen} className="block w-full cursor-pointer text-right">
        {children}
      </button>
      <PlayerMatchStatsModal open={open} onClose={() => setOpen(false)} stats={stats} playerLabel={playerLabel} />
    </>
  );
}
