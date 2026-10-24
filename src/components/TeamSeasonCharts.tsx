'use client';

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const SCORED = '#c8102e';
const CONCEDED = '#64748b';

/** Goals scored vs conceded per quarter-hour — where a team wins and loses its games. */
export function GoalTimingChart({ buckets, scored, conceded }: { buckets: readonly string[]; scored: number[]; conceded: number[] }) {
  const data = buckets.map((b, i) => ({ דקות: b, זכות: scored[i], חובה: conceded[i] }));
  return (
    <div className="h-[260px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="דקות" tick={{ fontSize: 12, fill: '#57534e' }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#78716c' }} />
          <Tooltip cursor={{ fill: '#f5f5f4' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="זכות" fill={SCORED} radius={[6, 6, 0, 0]} />
          <Bar dataKey="חובה" fill={CONCEDED} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** League points after each game, against the pace of winning every game. */
export function PointsProgressionChart({ points }: { points: Array<{ n: number; label: string; opponent: string; points: number }> }) {
  const data = points.map((p) => ({ ...p, 'מקסימום אפשרי': p.n * 3 }));
  return (
    <div className="h-[260px] w-full" dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e7e5e4" />
          <XAxis dataKey="n" tick={{ fontSize: 12, fill: '#57534e' }} tickFormatter={(n) => `${n}`} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#78716c' }} />
          <Tooltip
            labelFormatter={(n) => {
              const p = points.find((x) => x.n === n);
              return p ? `${p.label} · מול ${p.opponent}` : String(n);
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line type="monotone" dataKey="מקסימום אפשרי" stroke="#d6d3d1" strokeDasharray="5 5" dot={false} />
          <Line type="monotone" dataKey="points" name="נקודות" stroke={SCORED} strokeWidth={3} dot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
