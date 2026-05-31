/**
 * H2HPanel — head-to-head record between two teams. Shows aggregate W-D-L bar
 * across all-time meetings + a compact table of the last few games.
 */
import Link from 'next/link';
import type { H2HSummary } from '@/lib/h2h';

export function H2HPanel({ summary }: { summary: H2HSummary }) {
  if (summary.totalGames === 0) {
    return <p className="text-sm text-stone-500">אין פגישות קודמות בין הקבוצות.</p>;
  }
  const aPct = (summary.winsA / summary.totalGames) * 100;
  const dPct = (summary.draws / summary.totalGames) * 100;
  const bPct = (summary.winsB / summary.totalGames) * 100;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-stone-50 p-3">
        <div className="mb-2 flex items-center justify-between text-xs font-bold">
          <span className="text-emerald-700">{summary.teamAName}</span>
          <span className="text-stone-600">{summary.totalGames} פגישות</span>
          <span className="text-red-700">{summary.teamBName}</span>
        </div>
        <div className="flex h-2.5 overflow-hidden rounded-full">
          <div className="bg-emerald-500" style={{ width: `${aPct}%` }} />
          <div className="bg-stone-300" style={{ width: `${dPct}%` }} />
          <div className="bg-red-500" style={{ width: `${bPct}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-3 text-center text-xs font-bold">
          <span className="text-emerald-700">{summary.winsA} נצחונות</span>
          <span className="text-stone-600">{summary.draws} תיקו</span>
          <span className="text-red-700">{summary.winsB} נצחונות</span>
        </div>
        <p className="mt-2 text-center text-[11px] text-stone-500">סה&quot;כ שערים: {summary.teamAName} {summary.goalsA} — {summary.goalsB} {summary.teamBName}</p>
      </div>

      <div>
        <h4 className="mb-1 text-xs font-bold text-stone-600">פגישות אחרונות</h4>
        <div className="overflow-x-auto rounded-lg border border-stone-100">
          <table className="w-full text-right text-xs">
            <tbody>
              {summary.meetings.map((m) => (
                <tr key={m.gameId} className="border-t border-stone-100 hover:bg-stone-50">
                  <td className="px-2 py-1.5 text-stone-400" dir="ltr">{m.date}</td>
                  <td className="px-2 py-1.5">{m.homeTeamName}</td>
                  <td className="px-2 py-1.5 text-center font-black text-stone-900">{m.homeScore}-{m.awayScore}</td>
                  <td className="px-2 py-1.5">{m.awayTeamName}</td>
                  <td className="px-2 py-1.5 text-center">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${m.resultFromA === 'W' ? 'bg-emerald-100 text-emerald-700' : m.resultFromA === 'L' ? 'bg-red-100 text-red-700' : 'bg-stone-100 text-stone-700'}`}>
                      {m.resultFromA === 'W' ? 'נ' : m.resultFromA === 'L' ? 'ה' : 'ת'}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <Link href={`/games/${m.gameId}`} className="text-stone-400 hover:text-[var(--accent)]">›</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
