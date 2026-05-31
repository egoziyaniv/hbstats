'use client';

import { useCallback, useEffect, useState } from 'react';

interface PlayerSlim {
  playerId: string;
  displayName: string;
  photoUrl: string | null;
  jerseyNumber: number | null;
  position: string | null;
  side: 'home' | 'away';
}

interface Props {
  gameId: string;
  homeTeamName: string;
  awayTeamName: string;
  players: PlayerSlim[];
  isLoggedIn: boolean;
}

export default function GameRatingForm({ gameId, homeTeamName, awayTeamName, players, isLoggedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [ratings, setRatings] = useState<Record<string, number | null>>({});
  const [averages, setAverages] = useState<Record<string, { avg: number; count: number }>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }, []);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/games/${gameId}/rate`)
      .then((r) => r.json())
      .then((data) => {
        setRatings(data.ratings || {});
        setAverages(data.averages || {});
      })
      .catch(() => {});
  }, [open, gameId]);

  const save = async () => {
    if (!isLoggedIn) { showMessage('יש להתחבר כדי לנקד שחקנים', 'error'); return; }
    setSaving(true);
    try {
      const payload = Object.entries(ratings).map(([playerId, rating]) => ({ playerId, rating }));
      const res = await fetch(`/api/games/${gameId}/rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratings: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      showMessage(`נשמרו ${data.saved} ציונים`, 'success');
      // Refresh averages.
      const refreshed = await fetch(`/api/games/${gameId}/rate`).then((r) => r.json());
      setAverages(refreshed.averages || {});
    } catch (e: any) {
      showMessage(e.message || 'שגיאה', 'error');
    } finally {
      setSaving(false);
    }
  };

  const homePlayers = players.filter((p) => p.side === 'home');
  const awayPlayers = players.filter((p) => p.side === 'away');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white shadow-sm"
      >
        ⭐ נקד את המשחק
      </button>
    );
  }

  const renderTeam = (name: string, list: PlayerSlim[]) => (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-black text-stone-900">{name}</h3>
      <div className="space-y-1.5">
        {list.map((p) => {
          const value = ratings[p.playerId];
          const avg = averages[p.playerId];
          return (
            <div key={p.playerId} className="flex items-center gap-3 rounded-lg bg-stone-50 px-2 py-1.5">
              {p.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.photoUrl} alt={p.displayName} className="h-8 w-8 shrink-0 rounded-full border border-stone-200 object-cover" />
              ) : (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-black text-stone-500">
                  {p.displayName.split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 2)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-stone-900 truncate">
                  {p.jerseyNumber ? <span className="text-stone-400">{p.jerseyNumber}. </span> : null}
                  {p.displayName}
                </div>
                {p.position ? <div className="text-[10px] text-stone-500">{p.position}</div> : null}
              </div>
              {avg && avg.count > 0 ? (
                <div className="text-[10px] text-stone-500 text-center">
                  <div className="font-bold text-stone-700">{avg.avg.toFixed(1)}</div>
                  <div>{avg.count} מדרגים</div>
                </div>
              ) : null}
              <select
                value={value ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setRatings((prev) => ({ ...prev, [p.playerId]: v === '' ? null : Number(v) }));
                }}
                disabled={!isLoggedIn || saving}
                className="w-16 rounded border border-stone-300 px-1.5 py-1 text-sm font-bold disabled:opacity-50"
              >
                <option value="">—</option>
                {Array.from({ length: 19 }, (_, i) => 1 + i * 0.5).map((v) => (
                  <option key={v} value={v}>{v.toFixed(1)}</option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border-2 border-[var(--accent)] bg-white p-4 shadow-lg">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-black text-stone-900">⭐ ניקוד שחקנים</h2>
          <p className="text-xs text-stone-500">
            {isLoggedIn
              ? 'נקד 1-10 לכל שחקן (אופציונלי). הציון שלך יצורף לממוצע של כל המדרגים.'
              : 'התחבר כדי לנקד. ניתן לצפות בממוצע הציבורי.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700"
        >
          סגור
        </button>
      </header>

      {message ? (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm font-bold ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {renderTeam(homeTeamName, homePlayers)}
        {renderTeam(awayTeamName, awayPlayers)}
      </div>

      <div className="mt-3 flex justify-end gap-2">
        {isLoggedIn ? (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            {saving ? 'שומר…' : 'שמור ציונים'}
          </button>
        ) : (
          <a href="/login" className="rounded-full bg-stone-900 px-5 py-2 text-sm font-black text-white">
            התחבר
          </a>
        )}
      </div>
    </div>
  );
}
