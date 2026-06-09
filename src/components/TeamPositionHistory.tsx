'use client';

import { useState } from 'react';

export type PositionRow = {
  label: string; // e.g. "25/26"
  position: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  isCurrent: boolean;
};

/**
 * Historical league table positions — a line of numbered position-dots across
 * seasons. The current season is highlighted red; hovering any season shows its
 * W/D/L/PTS in the floating pill (defaults to the current season).
 */
export default function TeamPositionHistory({ rows }: { rows: PositionRow[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (!rows || rows.length < 2) return null;

  const W = 1040;
  const H = 380;
  const padX = 46;
  const padTop = 72;
  const padBottom = 80;
  const maxPos = Math.max(5, ...rows.map((r) => r.position));
  const n = rows.length;
  const x = (i: number) => padX + (i * (W - 2 * padX)) / (n - 1);
  const y = (pos: number) => padTop + ((pos - 1) / Math.max(1, maxPos - 1)) * (H - padTop - padBottom);

  const currentIdx = rows.findIndex((r) => r.isCurrent);
  const selIdx = hover ?? (currentIdx >= 0 ? currentIdx : n - 1);
  const sel = rows[selIdx];

  const boxW = 300;
  const boxH = 46;
  const boxCx = Math.min(W - padX - boxW / 2, Math.max(padX + boxW / 2, x(selIdx)));
  const boxY = H - padBottom - boxH - 8;

  return (
    <div className="overflow-hidden rounded-2xl bg-[#171717] p-4 shadow-sm md:p-5">
      <h3 className="mb-1 text-center text-base font-black text-white">מיקומים היסטוריים בטבלה</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        <polyline
          points={rows.map((r, i) => `${x(i)},${y(r.position)}`).join(' ')}
          fill="none"
          stroke="#6b7280"
          strokeWidth={2.5}
        />
        <line
          x1={x(selIdx)}
          x2={x(selIdx)}
          y1={padTop - 20}
          y2={H - padBottom + 6}
          stroke="#3f3f46"
          strokeWidth={1.5}
        />
        {rows.map((r, i) => (
          <g
            key={`dot-${i}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={x(i)}
              cy={y(r.position)}
              r={17}
              fill={r.isCurrent ? '#dc2626' : '#171717'}
              stroke={r.isCurrent ? '#dc2626' : '#9ca3af'}
              strokeWidth={2.5}
            />
            <text x={x(i)} y={y(r.position)} dy="0.35em" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800">
              {r.position}
            </text>
          </g>
        ))}
        {rows.map((r, i) => (
          <text
            key={`lbl-${i}`}
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
            <text x={boxCx} y={boxY + boxH / 2} dy="0.35em" textAnchor="middle" fontSize="16" fontWeight="700" fill="#fff">
              <tspan fill="#9ca3af">W </tspan>
              <tspan>{sel.wins}</tspan>
              <tspan fill="#9ca3af">{'   '}D </tspan>
              <tspan>{sel.draws}</tspan>
              <tspan fill="#9ca3af">{'   '}L </tspan>
              <tspan>{sel.losses}</tspan>
              <tspan fill="#9ca3af">{'   '}PTS </tspan>
              <tspan>{sel.points}</tspan>
            </text>
          </g>
        ) : null}
      </svg>
    </div>
  );
}
