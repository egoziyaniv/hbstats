/**
 * LiveMomentumBar — visual momentum indicator computed from event density
 * in the last 15 minutes. Events score: GOAL=10, SHOT=2, DANGEROUS_ATTACK=1,
 * CORNER=1. The bar shows which side has more "pressure" recently.
 */
import type { ReactNode } from 'react';

interface MomentumEvent {
  minute: number;
  type: string;
  team: 'home' | 'away';
}

function eventWeight(type: string): number {
  if (type === 'GOAL' || type === 'PENALTY_GOAL') return 10;
  if (type === 'YELLOW_CARD' || type === 'RED_CARD') return 1;
  if (type === 'CORNER' || type === 'SHOT' || type === 'DANGEROUS_ATTACK') return 2;
  return 1;
}

export function LiveMomentumBar({ currentMinute, events, homeTeamName, awayTeamName }: {
  currentMinute: number;
  events: MomentumEvent[];
  homeTeamName: string;
  awayTeamName: string;
}): ReactNode {
  const cutoff = Math.max(0, currentMinute - 15);
  const recent = events.filter((e) => e.minute >= cutoff && e.minute <= currentMinute);
  let homeScore = 0;
  let awayScore = 0;
  for (const e of recent) {
    const w = eventWeight(e.type);
    if (e.team === 'home') homeScore += w;
    else awayScore += w;
  }
  const total = homeScore + awayScore;
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center text-sm text-stone-500">
        אין מומנטום נצבר ב-15 דקות האחרונות.
      </div>
    );
  }
  const homePct = (homeScore / total) * 100;
  const awayPct = (awayScore / total) * 100;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between text-xs font-bold">
        <span className="text-emerald-700">{homeTeamName}</span>
        <span className="text-stone-400">מומנטום (15 דק' אחרונות)</span>
        <span className="text-red-700">{awayTeamName}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${homePct}%` }} />
        <div className="bg-red-500" style={{ width: `${awayPct}%` }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[11px] font-bold">
        <span className="text-emerald-700">{Math.round(homePct)}%</span>
        <span className="text-red-700">{Math.round(awayPct)}%</span>
      </div>
    </div>
  );
}
