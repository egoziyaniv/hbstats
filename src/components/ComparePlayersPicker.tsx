'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

interface Season { id: string; name: string; year: number }
interface Team { id: string; nameHe: string; nameEn: string; logoUrl: string | null }
interface Player {
  id: string;
  canonicalId: string;
  displayName: string;
  photoUrl: string | null;
  jerseyNumber: number | null;
  position: string | null;
}

interface Slot {
  seasonId: string;
  teamId: string;
  playerId: string;
}

const SLOT_KEYS: Array<keyof Pick<URLSearchParams, never> | string> = ['a', 'b', 'c'];

function emptySlot(): Slot { return { seasonId: '', teamId: '', playerId: '' }; }

export default function ComparePlayersPicker({
  seasons,
  initialSlots,
  initialTeamsBySeason,
}: {
  seasons: Season[];
  initialSlots: Slot[];
  initialTeamsBySeason: Record<string, Team[]>;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [slots, setSlots] = useState<Slot[]>(() => {
    const s = [...initialSlots];
    while (s.length < 3) s.push(emptySlot());
    return s.slice(0, 3);
  });
  const [teamsBySeason, setTeamsBySeason] = useState<Record<string, Team[]>>(initialTeamsBySeason || {});
  const [playersByKey, setPlayersByKey] = useState<Record<string, Player[]>>({});

  // Lazily fetch teams for a season we haven't loaded yet.
  useEffect(() => {
    for (const slot of slots) {
      if (slot.seasonId && !teamsBySeason[slot.seasonId]) {
        fetch(`/api/seasons/${slot.seasonId}/teams`)
          .then((r) => r.json())
          .then((data) => {
            setTeamsBySeason((prev) => ({ ...prev, [slot.seasonId]: data.teams || [] }));
          })
          .catch(() => {});
      }
    }
  }, [slots, teamsBySeason]);

  // Lazily fetch players for a (season, team) we haven't loaded.
  useEffect(() => {
    for (const slot of slots) {
      if (!slot.seasonId || !slot.teamId) continue;
      const key = `${slot.seasonId}|${slot.teamId}`;
      if (playersByKey[key]) continue;
      fetch(`/api/compare/players/search?seasonId=${slot.seasonId}&teamId=${slot.teamId}`)
        .then((r) => r.json())
        .then((data) => setPlayersByKey((prev) => ({ ...prev, [key]: data.players || [] })))
        .catch(() => {});
    }
  }, [slots, playersByKey]);

  const setSlot = (i: number, patch: Partial<Slot>) => {
    setSlots((prev) => prev.map((s, idx) => {
      if (idx !== i) return s;
      const next = { ...s, ...patch };
      // Reset downstream selections when an upstream field changes.
      if ('seasonId' in patch) { next.teamId = ''; next.playerId = ''; }
      if ('teamId' in patch) { next.playerId = ''; }
      return next;
    }));
  };

  const submit = () => {
    const next = new URLSearchParams(params.toString());
    SLOT_KEYS.forEach((k, i) => {
      const slot = slots[i];
      if (slot && slot.playerId) next.set(k as string, slot.playerId);
      else next.delete(k as string);
    });
    startTransition(() => router.push(`?${next.toString()}`));
  };

  const labels = ['שחקן 1', 'שחקן 2', 'שחקן 3'];

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-black text-stone-700">בחירת שחקנים להשוואה</h2>
      <div className="grid gap-3 md:grid-cols-3">
        {slots.map((slot, i) => {
          const teams = slot.seasonId ? (teamsBySeason[slot.seasonId] || []) : [];
          const players = (slot.seasonId && slot.teamId) ? (playersByKey[`${slot.seasonId}|${slot.teamId}`] || []) : [];
          return (
            <div key={i} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="mb-2 text-xs font-black text-stone-500">{labels[i]}{i === 0 ? '' : ' (אופציונלי)'}</div>
              <div className="space-y-2">
                <select
                  value={slot.seasonId}
                  onChange={(e) => setSlot(i, { seasonId: e.target.value })}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm"
                >
                  <option value="">— בחר עונה —</option>
                  {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select
                  value={slot.teamId}
                  onChange={(e) => setSlot(i, { teamId: e.target.value })}
                  disabled={!slot.seasonId}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">— בחר קבוצה —</option>
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.nameHe || t.nameEn}</option>)}
                </select>
                <select
                  value={slot.playerId}
                  onChange={(e) => setSlot(i, { playerId: e.target.value })}
                  disabled={!slot.teamId}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm disabled:opacity-50"
                >
                  <option value="">— בחר שחקן —</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}{p.position ? ` (${p.position})` : ''}{p.jerseyNumber ? ` · #${p.jerseyNumber}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!slots[0].playerId}
          className="rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-black text-white shadow disabled:opacity-50"
        >
          השווה
        </button>
      </div>
    </section>
  );
}
