import Link from 'next/link';
import { getOnThisDay } from '@/lib/on-this-day';

export default async function OnThisDayCard({ favoriteTeamApiIds = [] }: { favoriteTeamApiIds?: number[] }) {
  const data = await getOnThisDay(new Date(), favoriteTeamApiIds).catch((e) => { console.error('[on-this-day]', e); return null; });
  if (!data || (!data.match && data.birthdays.length === 0)) return null;
  return (
    <>
      {data.match ? (
        <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">📅 היום בהיסטוריה</p>
          <Link href={`/games/${data.match.gameId}`} className="mt-2 block rounded-xl bg-stone-50 p-3 transition hover:bg-stone-100">
            <p className="text-base font-black text-stone-900">
              {data.match.homeName} {data.match.homeScore}–{data.match.awayScore} {data.match.awayName}
            </p>
            <p className="mt-1 text-xs text-stone-500">
              לפני {data.match.yearsAgo} שנים
              {data.match.competitionName ? ` · ${data.match.competitionName}` : ''}
              {' · '}
              {new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(new Date(data.match.dateISO))}
            </p>
          </Link>
        </section>
      ) : null}
      {data.birthdays.length ? (
        <section className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-700">🎂 ימי הולדת היום</p>
          <ul className="mt-2 space-y-1.5">
            {data.birthdays.map((b) => (
              <li key={b.playerId} className="flex items-center gap-2 text-sm">
                <Link href={`/players/${b.playerId}`} className="font-bold text-stone-900 hover:text-red-800">{b.nameHe}</Link>
                <span className="text-stone-500">בן {b.age}</span>
                {b.currentTeam ? <span className="text-xs text-stone-400">· {b.currentTeam.nameHe}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
