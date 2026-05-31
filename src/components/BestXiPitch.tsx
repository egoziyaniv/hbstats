/**
 * BestXiPitch — football pitch with the season's top XI placed by position.
 * Renders the goalkeeper at the bottom, defenders, midfielders, forwards
 * upwards toward goal, fanning each row horizontally based on count.
 *
 * If fewer than 11 players qualified, leaves empty slots gracefully.
 */
import Link from 'next/link';
import type { BestXiPlayer } from '@/lib/best-xi';

function PlayerCard({ p }: { p: BestXiPlayer }) {
  return (
    <Link href={`/players/${p.playerId}`} className="group flex flex-col items-center gap-1 transition hover:-translate-y-1">
      <div className="relative">
        {p.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photoUrl} alt={p.displayName} className="h-14 w-14 rounded-full border-2 border-white bg-stone-100 object-cover shadow-lg" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-stone-200 text-xs font-black text-stone-600 shadow-lg">
            {p.displayName.split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 2)}
          </div>
        )}
        <span className="absolute -bottom-1 -left-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow">
          {p.avgRating}
        </span>
      </div>
      <div className="rounded-md bg-black/60 px-1.5 py-0.5 text-center text-[11px] font-black leading-tight text-white max-w-[100px] truncate">
        {p.displayName}
      </div>
      <div className="text-[10px] font-bold text-white/80">{p.team} · {p.matches} מ&apos;</div>
    </Link>
  );
}

function Row({ players, label }: { players: BestXiPlayer[]; label: string }) {
  if (players.length === 0) {
    return (
      <div className="flex items-center justify-center gap-4 opacity-30">
        <span className="text-[10px] font-bold text-white">{label}: לא נמצאו מועמדים</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-around gap-3">
      {players.map((p) => <PlayerCard key={p.playerId} p={p} />)}
    </div>
  );
}

export function BestXiPitch({ players }: { players: BestXiPlayer[] }) {
  const gks = players.filter((p) => p.posCategory === 'GK');
  const defs = players.filter((p) => p.posCategory === 'DEF');
  const mids = players.filter((p) => p.posCategory === 'MID');
  const fwds = players.filter((p) => p.posCategory === 'FWD');

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-b from-emerald-700 via-emerald-600 to-emerald-700 p-6 shadow-2xl">
      {/* Pitch markings */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
        <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/20" />
        <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/20" />
        {/* Goal areas */}
        <div className="absolute left-1/2 top-0 h-12 w-40 -translate-x-1/2 border-2 border-t-0 border-white/20" />
        <div className="absolute left-1/2 bottom-0 h-12 w-40 -translate-x-1/2 border-2 border-b-0 border-white/20" />
      </div>

      <div className="relative flex flex-col gap-6 py-3 text-white">
        <Row players={fwds} label="חלוץ" />
        <Row players={mids} label="קישור" />
        <Row players={defs} label="הגנה" />
        <Row players={gks} label="שוער" />
      </div>
    </div>
  );
}
