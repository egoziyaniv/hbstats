import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllHonors, getCupFinals } from '@/lib/history/club-honors';
import { TeamLogo } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'זוכי הגביעים — כל ההיסטוריה | StatsAI',
  description: 'טבלת זוכי גביע המדינה, גביע הטוטו וגביע העל של הכדורגל הישראלי, וכל הגמרים מאז 1945.',
};

export default async function CupHonorsPage() {
  const [honors, finals] = await Promise.all([getAllHonors(), getCupFinals()]);

  // Honor roll: only clubs with at least one State Cup win, ranked by that count.
  const stateCupHonors = honors
    .filter((h) => h.stateCup.count > 0)
    .sort((a, b) => b.stateCup.count - a.stateCup.count);

  const skippedDraws = finals.filter((f) => !f.winner).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">זוכי הגביעים</h1>
      <p className="mt-2 text-sm text-stone-500">
        גביע המדינה · גביע הטוטו · גביע העל · מאז 1945 ·{' '}
        <Link href="/history/all-time" className="font-bold text-[var(--accent)]">טבלת כל הזמנים ←</Link>
        {' · '}
        <Link href="/history/seasons" className="font-bold text-[var(--accent)]">כל העונות ←</Link>
      </p>

      <h2 className="mt-8 text-lg font-black text-stone-900">טבלת זוכים — גביע המדינה</h2>
      {stateCupHonors.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">אין נתונים להצגה.</p>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {stateCupHonors.map((h) => (
            <Link
              key={h.clubKey}
              href={`/teams/${h.latestTeamId}`}
              title={h.stateCup.years.join(', ')}
              className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold text-stone-700 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <TeamLogo
                src={h.logoUrl}
                alt={h.nameHe}
                className="h-5 w-5 rounded-full object-contain"
                fallbackClassName="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[8px] font-black text-violet-700"
              />
              {h.nameHe}
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">{h.stateCup.count}×</span>
            </Link>
          ))}
        </div>
      )}

      <h2 className="mt-10 text-lg font-black text-stone-900">כל הגמרים</h2>
      {finals.length === 0 ? (
        <p className="mt-3 text-sm text-stone-500">אין נתונים להצגה.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-[24px] border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
                <th className="px-4 py-3">עונה</th>
                <th className="px-4 py-3">גביע</th>
                <th className="px-4 py-3">זוכה</th>
                <th className="px-4 py-3">תוצאה</th>
                <th className="px-4 py-3">מפסידה</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {finals.map((f) => (
                <tr key={f.gameId} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                  <td className="px-4 py-3 text-stone-700">{f.seasonYear}</td>
                  <td className="px-4 py-3 text-stone-500">{f.competitionNameHe}</td>
                  <td className="px-4 py-3 font-black text-stone-900">
                    {f.winner ? `🏆 ${f.winner.nameHe}` : <span className="text-stone-400">לא נקבע</span>}
                  </td>
                  <td className="px-4 py-3 text-stone-700">{f.scoreLabel}</td>
                  <td className="px-4 py-3 text-stone-500">{f.loser?.nameHe ?? '—'}</td>
                  <td className="px-4 py-3">
                    <Link href={`/games/${f.gameId}`} className="text-xs font-bold text-[var(--accent)]">
                      ← למשחק
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {skippedDraws > 0 ? (
        <p className="mt-3 text-xs text-stone-400">
          {skippedDraws} גמר{skippedDraws > 1 ? 'ים' : ''} הסתיימ{skippedDraws > 1 ? 'ו' : ''} בתיקו ללא נתוני פנדלים זמינים — הזוכה אינו ידוע.
        </p>
      ) : null}
    </div>
  );
}
