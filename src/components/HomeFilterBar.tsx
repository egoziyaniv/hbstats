'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

type Team = { id: string; nameHe: string | null; nameEn: string };

export default function HomeFilterBar({
  teams,
  selectedTeamId,
}: {
  teams: Team[];
  selectedTeamId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(selectedTeamId);

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('team');
    if (selected) params.set('team', selected);
    router.push(`/?${params.toString()}`);
    setOpen(false);
  }

  function clear() {
    setSelected(null);
    router.push('/');
    setOpen(false);
  }

  const selectedTeam = teams.find((team) => team.id === selected) || null;

  return (
    <div className="mx-auto max-w-7xl px-4 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setOpen(!open)}
          className="rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-bold text-stone-700 transition hover:border-stone-400"
        >
          {selectedTeam ? selectedTeam.nameHe || selectedTeam.nameEn : 'הפועל באר שבע כברירת מחדל'} {open ? '▲' : '▼'}
        </button>

        {selectedTeam && !open && (
          <button onClick={clear} className="text-xs font-bold text-stone-400 hover:text-red-700">
            חזור לברירת המחדל
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex flex-wrap gap-1.5 max-h-[180px] overflow-y-auto">
            {teams.map((team) => {
              const isSelected = selected === team.id;
              return (
                <button
                  key={team.id}
                  onClick={() => setSelected(team.id)}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    isSelected
                      ? 'bg-red-800 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {team.nameHe || team.nameEn}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-3 border-t border-stone-100 pt-2">
            <button onClick={apply} className="rounded-lg bg-stone-900 px-4 py-1.5 text-xs font-bold text-white">
              החלף קבוצה
            </button>
            <button onClick={clear} className="text-xs font-bold text-stone-400 hover:text-red-700">
              נקה הכל
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
