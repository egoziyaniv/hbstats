/**
 * PredictedLineupPanel — side-by-side predicted XI for both teams on a
 * scheduled (not-yet-played) game. The user can switch between formations
 * (4-4-2 / 4-3-3 / 5-3-2) via a URL-based toggle.
 */
import Link from 'next/link';
import type { PredictedPlayer, FormationId } from '@/lib/predicted-lineup';

const FORMATIONS: FormationId[] = ['4-4-2', '4-3-3', '5-3-2'];

function PlayerCard({ p }: { p: PredictedPlayer }) {
  const confidence = p.totalGamesConsidered > 0 ? Math.round((p.startsInLast5 / p.totalGamesConsidered) * 100) : 0;
  return (
    <Link href={`/players/${p.playerId}`} className="flex items-center gap-2 rounded-lg bg-stone-50 px-2 py-1.5 hover:bg-stone-100">
      {p.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.photoUrl} alt={p.displayName} className="h-8 w-8 shrink-0 rounded-full border border-stone-200 object-cover" />
      ) : (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-black text-stone-500">
          {p.displayName.split(/\s+/).map((s) => s[0]).join('').toUpperCase().slice(0, 2)}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-stone-900 truncate">
          {p.jerseyNumber ? <span className="text-stone-400">{p.jerseyNumber}. </span> : null}
          {p.displayName}
        </div>
        <div className="text-[10px] text-stone-500">{p.position || '—'} · {p.startsInLast5}/{p.totalGamesConsidered} פתח</div>
      </div>
      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-black ${confidence >= 80 ? 'bg-emerald-100 text-emerald-700' : confidence >= 50 ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-600'}`}>
        {confidence}%
      </span>
    </Link>
  );
}

export function PredictedLineupPanel({
  homeTeamName,
  awayTeamName,
  homeLineup,
  awayLineup,
  formation,
  gameId,
}: {
  homeTeamName: string;
  awayTeamName: string;
  homeLineup: PredictedPlayer[];
  awayLineup: PredictedPlayer[];
  formation: FormationId;
  gameId: string;
}) {
  if (homeLineup.length === 0 && awayLineup.length === 0) {
    return <p className="text-sm text-stone-500">אין מספיק היסטוריית הרכבים לתחזית.</p>;
  }
  const sections: Array<{ label: string; cat: 'FWD' | 'MID' | 'DEF' | 'GK' }> = [
    { label: 'התקפה', cat: 'FWD' },
    { label: 'קישור', cat: 'MID' },
    { label: 'הגנה', cat: 'DEF' },
    { label: 'שוער', cat: 'GK' },
  ];

  const renderTeam = (name: string, list: PredictedPlayer[]) => (
    <div className="rounded-2xl border border-stone-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-black text-stone-900">{name}</h3>
      {sections.map(({ label, cat }) => {
        const players = list.filter((p) => p.posCategory === cat);
        if (players.length === 0) return null;
        return (
          <div key={cat} className="mb-2 last:mb-0">
            <div className="mb-1 text-[10px] font-bold text-stone-500">{label}</div>
            <div className="space-y-1">
              {players.map((p) => <PlayerCard key={p.playerId} p={p} />)}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          תחזית מבוססת על שכיחות הרכב פותח ב-5 המשחקים האחרונים.
        </p>
        <div className="flex gap-1.5">
          {FORMATIONS.map((f) => (
            <Link
              key={f}
              href={`/games/${gameId}?tab=lineups&formation=${f}`}
              scroll={false}
              className={`rounded-full px-3 py-1 text-xs font-bold ${f === formation ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
            >
              {f}
            </Link>
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {renderTeam(homeTeamName, homeLineup)}
        {renderTeam(awayTeamName, awayLineup)}
      </div>
    </div>
  );
}
