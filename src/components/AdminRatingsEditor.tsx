'use client';

import { useCallback, useMemo, useState } from 'react';

interface PlayerRow {
  playerId: string;
  jerseyNumber: number | null;
  role: string;
  teamId: string;
  teamSide: 'home' | 'away';
  displayName: string;
  position: string | null;
  photoUrl: string | null;
  ratings: Record<string, { id: string; rating: number; notes: string | null }>;
}

interface GameInfo {
  id: string;
  dateTime: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: { id: string; nameHe: string; nameEn: string; logoUrl: string | null };
  awayTeam: { id: string; nameHe: string; nameEn: string; logoUrl: string | null };
}

interface Payload {
  game: GameInfo;
  sources: readonly string[];
  players: PlayerRow[];
}

const SOURCE_LABEL: Record<string, string> = {
  'api-football': 'API-Football',
  'sofascore': 'Sofascore',
  'fotmob': 'FotMob',
  'admin': 'אדמין',
};

function averageRating(ratings: PlayerRow['ratings']): number | null {
  const values = Object.values(ratings).map((r) => r.rating).filter((v) => Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export default function AdminRatingsEditor({ initial }: { initial: Payload }) {
  const [players, setPlayers] = useState<PlayerRow[]>(initial.players);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showMessage = useCallback((text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 2500);
  }, []);

  const saveRating = async (playerId: string, source: string, rating: string) => {
    const key = `${playerId}|${source}`;
    setSavingKey(key);
    try {
      const body = rating.trim() === '' ? { playerId, source, rating: null } : { playerId, source, rating: Number(rating) };
      const res = await fetch(`/api/admin/ratings/${initial.game.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');

      setPlayers((prev) => prev.map((p) => {
        if (p.playerId !== playerId) return p;
        const newRatings = { ...p.ratings };
        if (body.rating === null) {
          delete newRatings[source];
        } else {
          newRatings[source] = { id: data.id, rating: data.rating, notes: data.notes };
        }
        return { ...p, ratings: newRatings };
      }));
      showMessage('נשמר', 'success');
    } catch (e: any) {
      showMessage(e.message || 'שגיאה', 'error');
    } finally {
      setSavingKey(null);
    }
  };

  const sidesHomeAway = useMemo(() => ({
    home: players.filter((p) => p.teamSide === 'home'),
    away: players.filter((p) => p.teamSide === 'away'),
  }), [players]);

  const renderTeamTable = (side: 'home' | 'away', sidePlayers: PlayerRow[]) => {
    const team = side === 'home' ? initial.game.homeTeam : initial.game.awayTeam;
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <header className="mb-3 flex items-center gap-2">
          {team.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={team.logoUrl} alt={team.nameHe} className="h-8 w-8 object-contain" />
          ) : null}
          <h3 className="text-base font-black text-stone-900">{team.nameHe || team.nameEn}</h3>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-stone-100 text-xs font-bold text-stone-500">
                <th className="px-2 py-1">שחקן</th>
                <th className="px-2 py-1 text-center">תפקיד</th>
                {initial.sources.map((s) => (
                  <th key={s} className="px-2 py-1 text-center">{SOURCE_LABEL[s] || s}</th>
                ))}
                <th className="px-2 py-1 text-center font-black text-stone-700">ממוצע</th>
              </tr>
            </thead>
            <tbody>
              {sidePlayers.map((p) => {
                const avg = averageRating(p.ratings);
                return (
                  <tr key={p.playerId} className="border-b border-stone-50 hover:bg-stone-50/60">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        {p.photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photoUrl} alt={p.displayName} className="h-7 w-7 rounded-full border border-stone-200 object-cover" />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-100 text-[10px] font-black text-stone-500">
                            {p.displayName.split(/\s+/).map((x) => x[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-bold text-stone-900">
                            {p.jerseyNumber ? <span className="text-stone-400">{p.jerseyNumber}. </span> : null}
                            {p.displayName}
                          </div>
                          <div className="text-[10px] text-stone-400">{p.position || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${p.role === 'STARTER' ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-stone-600'}`}>
                        {p.role === 'STARTER' ? 'פותח' : 'מחליף'}
                      </span>
                    </td>
                    {initial.sources.map((s) => {
                      const value = p.ratings[s]?.rating;
                      const isEditable = s === 'admin';
                      if (!isEditable) {
                        return (
                          <td key={s} className="px-2 py-1.5 text-center text-sm font-bold text-stone-700">
                            {value != null ? value.toFixed(1) : <span className="text-stone-300">—</span>}
                          </td>
                        );
                      }
                      return (
                        <td key={s} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.1}
                            defaultValue={value != null ? value.toFixed(1) : ''}
                            onBlur={(e) => {
                              const v = e.target.value;
                              if (v === '' && value == null) return;
                              if (v !== '' && Number(v) === value) return;
                              saveRating(p.playerId, s, v);
                            }}
                            disabled={savingKey === `${p.playerId}|${s}`}
                            className="w-14 rounded border border-stone-300 px-1.5 py-1 text-center text-sm disabled:opacity-60"
                            placeholder="—"
                          />
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center">
                      <span className="rounded-md bg-stone-900 px-2 py-0.5 text-xs font-black text-white">
                        {avg != null ? avg.toFixed(1) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {message ? (
        <div className={`fixed top-4 left-1/2 z-50 -translate-x-1/2 rounded-lg px-4 py-2 text-sm font-bold shadow-lg ${message.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {message.text}
        </div>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-2">
        {renderTeamTable('home', sidesHomeAway.home)}
        {renderTeamTable('away', sidesHomeAway.away)}
      </div>
    </div>
  );
}
