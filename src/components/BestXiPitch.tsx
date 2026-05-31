/**
 * BestXiPitch — football pitch with the season's top XI placed by position.
 *
 * Orientation: vertical, attacking upward. The defenders + goalkeeper sit at
 * the BOTTOM (their own goal), and the forwards push toward the TOP. Pitch
 * markings use SVG for crisp lines: top + bottom goal/penalty boxes, a
 * horizontal halfway line, and a center circle.
 */
import Link from 'next/link';
import type { BestXiPlayer } from '@/lib/player-ratings';

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
        {p.unifiedRating != null ? (
          <span className="absolute -bottom-1 -left-1 rounded-md bg-emerald-600 px-1.5 py-0.5 text-[10px] font-black text-white shadow">
            {p.unifiedRating}
          </span>
        ) : null}
      </div>
      <div className="rounded-md bg-black/60 px-1.5 py-0.5 text-center text-[11px] font-black leading-tight text-white max-w-[110px] truncate">
        {p.displayName}
      </div>
      <div className="text-[10px] font-bold text-white/80">{p.team}</div>
      {p.reason ? (
        <div className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-100 text-center max-w-[110px] leading-tight">
          {p.reason}
        </div>
      ) : null}
    </Link>
  );
}

function Row({ players }: { players: BestXiPlayer[] }) {
  if (players.length === 0) return <div className="h-20" />;
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
    <div className="relative overflow-hidden rounded-3xl shadow-2xl">
      {/* Stripes for visual depth */}
      <div className="absolute inset-0 bg-emerald-700">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div
            key={i}
            className={`absolute left-0 right-0 h-[12.5%] ${i % 2 === 0 ? 'bg-emerald-600/40' : ''}`}
            style={{ top: `${i * 12.5}%` }}
          />
        ))}
      </div>

      {/* Pitch markings as SVG so they scale cleanly */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 140"
        preserveAspectRatio="none"
      >
        {/* Outer boundary */}
        <rect x="2" y="2" width="96" height="136" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        {/* Halfway line (horizontal) */}
        <line x1="2" y1="70" x2="98" y2="70" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        {/* Center circle */}
        <circle cx="50" cy="70" r="9" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        <circle cx="50" cy="70" r="0.8" fill="rgba(255,255,255,0.45)" />
        {/* Top penalty area (opponent half) */}
        <rect x="22" y="2" width="56" height="14" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        <rect x="36" y="2" width="28" height="5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        <circle cx="50" cy="11" r="0.8" fill="rgba(255,255,255,0.45)" />
        {/* Bottom penalty area (our half — goalkeeper) */}
        <rect x="22" y="124" width="56" height="14" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        <rect x="36" y="133" width="28" height="5" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.4" />
        <circle cx="50" cy="129" r="0.8" fill="rgba(255,255,255,0.45)" />
      </svg>

      <div className="relative flex flex-col justify-between gap-4 px-4 py-8 text-white" style={{ minHeight: '600px' }}>
        <Row players={fwds} />
        <Row players={mids} />
        <Row players={defs} />
        <Row players={gks} />
      </div>
    </div>
  );
}
