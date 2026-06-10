'use client';

import { useMemo, useState } from 'react';

export type PositionRow = {
  year: number; // season start year, e.g. 2025 for "25/26"
  label: string; // e.g. "25/26"
  position: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  tier: 'haal' | 'leumit'; // top tier vs second tier
  isCurrent: boolean;
};

const WINDOW = 15; // max seasons shown at once

const COLORS = {
  haal: { fill: '#dc2626', stroke: '#dc2626' }, // ליגת העל (top tier)
  leumit: { fill: '#f59e0b', stroke: '#f59e0b' }, // ליגה לאומית (second tier)
};

/**
 * Historical league table positions — a line of numbered position-dots across
 * seasons (top tier in red, second tier in amber). The current season's dot is
 * filled; hovering any season shows its W/D/L/PTS + tier in the floating pill.
 *
 * The x-axis is laid out by actual season year, so any season with no league
 * standing at all (neither tier) shows as a real gap rather than collapsing.
 * When a club has more than WINDOW seasons, only the most recent WINDOW are
 * shown; back/forward controls pan through the rest of the timeline.
 */
export default function TeamPositionHistory({ rows }: { rows: PositionRow[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // start index of the visible window into `rows` (sorted oldest → newest).
  // Default: most recent WINDOW seasons.
  const [start, setStart] = useState(() => Math.max(0, (rows?.length ?? 0) - WINDOW));

  const total = rows?.length ?? 0;
  const clampedStart = Math.min(start, Math.max(0, total - WINDOW));
  const view = useMemo(
    () => rows.slice(clampedStart, clampedStart + WINDOW),
    [rows, clampedStart],
  );

  if (!rows || rows.length < 2) return null;

  const canOlder = clampedStart > 0;
  const canNewer = clampedStart + WINDOW < total;

  const W = 1040;
  const H = 380;
  const padX = 46;
  const padTop = 72;
  const padBottom = 80;
  const maxPos = Math.max(5, ...view.map((r) => r.position));
  const n = view.length;

  // Continuous year axis: position each dot by its actual year so missing
  // seasons leave a visible gap. Falls back to index spacing for a single dot.
  const minYear = view[0].year;
  const maxYear = view[n - 1].year;
  const yearSpan = Math.max(1, maxYear - minYear);
  const x = (i: number) =>
    n === 1 ? W / 2 : padX + ((view[i].year - minYear) / yearSpan) * (W - 2 * padX);
  const y = (pos: number) => padTop + ((pos - 1) / Math.max(1, maxPos - 1)) * (H - padTop - padBottom);

  // Break the connecting line wherever consecutive dots skip a year, so a gap
  // reads as a gap rather than a straight line bridging missing seasons.
  const segments: string[][] = [];
  view.forEach((r, i) => {
    const pt = `${x(i)},${y(r.position)}`;
    if (i > 0 && r.year - view[i - 1].year > 1) segments.push([pt]);
    else if (i === 0) segments.push([pt]);
    else segments[segments.length - 1].push(pt);
  });

  const currentIdx = view.findIndex((r) => r.isCurrent);
  const selIdx = hover ?? (currentIdx >= 0 ? currentIdx : n - 1);
  const sel = view[selIdx];

  const boxW = 360;
  const boxH = 46;
  const boxCx = Math.min(W - padX - boxW / 2, Math.max(padX + boxW / 2, x(selIdx)));
  const boxY = H - padBottom - boxH - 8;

  return (
    <div className="overflow-hidden rounded-2xl bg-[#171717] p-4 shadow-sm md:p-5">
      <div className="mb-1 flex items-center justify-center gap-3">
        {/* In RTL: older years are to the right, so the "older" arrow points right (▶). */}
        <button
          type="button"
          onClick={() => setStart(Math.max(0, clampedStart - WINDOW))}
          disabled={!canOlder}
          aria-label="שנים מוקדמות יותר"
          className="rounded-full px-2 py-0.5 text-lg leading-none text-white transition enabled:hover:bg-white/10 disabled:opacity-25"
        >
          ▶
        </button>
        <h3 className="text-center text-base font-black text-white">מיקומים היסטוריים בטבלה</h3>
        <button
          type="button"
          onClick={() => setStart(Math.min(Math.max(0, total - WINDOW), clampedStart + WINDOW))}
          disabled={!canNewer}
          aria-label="שנים מאוחרות יותר"
          className="rounded-full px-2 py-0.5 text-lg leading-none text-white transition enabled:hover:bg-white/10 disabled:opacity-25"
        >
          ◀
        </button>
      </div>
      <div className="mb-2 flex items-center justify-center gap-4 text-[11px] font-semibold text-stone-500">
        <span>{view[0]?.label}–{view[n - 1]?.label} · {total} עונות סה״כ</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.haal.fill }} /> ליגת העל</span>
        <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS.leumit.fill }} /> לאומית</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {segments.map((pts, si) => (
          <polyline key={`seg-${si}`} points={pts.join(' ')} fill="none" stroke="#6b7280" strokeWidth={2.5} />
        ))}
        <line
          x1={x(selIdx)}
          x2={x(selIdx)}
          y1={padTop - 20}
          y2={H - padBottom + 6}
          stroke="#3f3f46"
          strokeWidth={1.5}
        />
        {view.map((r, i) => {
          const c = COLORS[r.tier];
          return (
            <g
              key={`dot-${r.year}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: 'pointer' }}
            >
              <circle
                cx={x(i)}
                cy={y(r.position)}
                r={17}
                fill={r.isCurrent ? c.fill : '#171717'}
                stroke={c.stroke}
                strokeWidth={2.5}
              />
              <text x={x(i)} y={y(r.position)} dy="0.35em" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">
                {r.position}
              </text>
            </g>
          );
        })}
        {view.map((r, i) => (
          <text
            key={`lbl-${r.year}`}
            x={x(i)}
            y={H - padBottom + 36}
            textAnchor="middle"
            fill={i === selIdx ? '#f87171' : '#9ca3af'}
            fontSize="13"
            fontWeight={i === selIdx ? 800 : 500}
          >
            {r.label}
          </text>
        ))}
        {sel ? (
          <g>
            <rect
              x={boxCx - boxW / 2}
              y={boxY}
              width={boxW}
              height={boxH}
              rx={boxH / 2}
              fill="#171717"
              stroke="#52525b"
              strokeWidth={1.5}
            />
            <text x={boxCx} y={boxY + boxH / 2} dy="0.35em" textAnchor="middle" fontSize="15" fontWeight="700" fill="#fff">
              <tspan fill={COLORS[sel.tier].fill}>{sel.tier === 'leumit' ? 'לאומית ' : 'על '}</tspan>
              <tspan fill="#9ca3af">W </tspan>
              <tspan>{sel.wins}</tspan>
              <tspan fill="#9ca3af">{'  '}D </tspan>
              <tspan>{sel.draws}</tspan>
              <tspan fill="#9ca3af">{'  '}L </tspan>
              <tspan>{sel.losses}</tspan>
              <tspan fill="#9ca3af">{'  '}PTS </tspan>
              <tspan>{sel.points}</tspan>
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
