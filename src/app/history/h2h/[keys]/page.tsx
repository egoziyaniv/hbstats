import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getClubFamily } from '@/lib/history/club-identity';
import { buildFullH2H } from '@/lib/h2h';

export const dynamic = 'force-dynamic';

function parseKeys(raw: string): [string, string] | null {
  const parts = decodeURIComponent(raw).split('__');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

export async function generateMetadata({ params }: { params: { keys: string } }): Promise<Metadata> {
  const parsed = parseKeys(params.keys);
  if (!parsed) return {};
  const [famA, famB] = await Promise.all([getClubFamily(parsed[0]), getClubFamily(parsed[1])]);
  if (!famA || !famB) return {};
  return {
    title: `${famA.nameHe} נגד ${famB.nameHe} — כל המפגשים | StatsAI`,
    description: `כל המפגשים ההיסטוריים בין ${famA.nameHe} ל${famB.nameHe} — תוצאות, שערים ועימותים לפי תחרות ומגרש.`,
  };
}

export default async function H2HPairPage({ params }: { params: { keys: string } }) {
  const parsed = parseKeys(params.keys);
  if (!parsed) notFound();
  const [keyA, keyB] = parsed;

  const [famA, famB] = await Promise.all([getClubFamily(keyA), getClubFamily(keyB)]);
  if (!famA || !famB) notFound();

  const h2h = await buildFullH2H(famA.latestTeamId, famB.latestTeamId);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <p className="text-xs font-bold text-stone-400">
        <Link href="/history/h2h" className="hover:text-[var(--accent)]">← יריבויות</Link>
      </p>
      <h1 className="mt-2 border-r-[4px] border-[var(--accent)] pr-3 text-2xl font-black text-stone-900 sm:text-3xl">
        {famA.nameHe} <span className="text-stone-400">נגד</span> {famB.nameHe}
      </h1>
      <p className="mt-2 text-sm text-stone-500">כל המפגשים ההיסטוריים בין שתי הקבוצות</p>

      {!h2h || h2h.totals.games === 0 ? (
        <p className="mt-6 text-sm text-stone-500">שתי הקבוצות טרם נפגשו.</p>
      ) : (
        <>
          {/* totals strip */}
          <div className="mt-6 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between text-sm font-bold">
              <span className="text-emerald-700">{h2h.teamAName}</span>
              <span className="text-stone-500">{h2h.totals.games} מפגשים</span>
              <span className="text-red-700">{h2h.teamBName}</span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-3xl font-black text-emerald-700">{h2h.totals.winsA}</p>
                <p className="text-xs text-stone-500">נצחונות</p>
              </div>
              <div>
                <p className="text-3xl font-black text-stone-500">{h2h.totals.draws}</p>
                <p className="text-xs text-stone-500">תיקו</p>
              </div>
              <div>
                <p className="text-3xl font-black text-red-700">{h2h.totals.winsB}</p>
                <p className="text-xs text-stone-500">נצחונות</p>
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-stone-500">
              סה&quot;כ שערים: {h2h.teamAName} {h2h.totals.goalsA} — {h2h.totals.goalsB} {h2h.teamBName}
            </p>
          </div>

          {/* per-competition split */}
          {h2h.byCompetition.length > 0 ? (
            <div className="mt-6">
              <h2 className="text-sm font-bold text-stone-600">לפי תחרות</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {h2h.byCompetition.map((c) => (
                  <div key={c.competitionNameHe} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs">
                    <span className="font-bold text-stone-800">{c.competitionNameHe}</span>
                    <span className="text-stone-400"> · {c.games} מש&#39; · </span>
                    <span className="text-emerald-700">{c.winsA}</span>
                    <span className="text-stone-400">-</span>
                    <span className="text-stone-500">{c.draws}</span>
                    <span className="text-stone-400">-</span>
                    <span className="text-red-700">{c.winsB}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* venue split */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold text-stone-500">{famA.nameHe} כמארחת</p>
              <p className="mt-1 text-sm">
                <span className="font-black text-stone-900">{h2h.atAHome.games}</span> מפגשים ·{' '}
                <span className="text-emerald-700">{h2h.atAHome.winsA} נ&#39;</span> ·{' '}
                <span className="text-stone-500">{h2h.atAHome.draws} ת&#39;</span> ·{' '}
                <span className="text-red-700">{h2h.atAHome.winsB} ה&#39;</span>
              </p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="text-xs font-bold text-stone-500">{famB.nameHe} כמארחת</p>
              <p className="mt-1 text-sm">
                <span className="font-black text-stone-900">{h2h.atBHome.games}</span> מפגשים ·{' '}
                <span className="text-emerald-700">{h2h.atBHome.winsA} נ&#39;</span> ·{' '}
                <span className="text-stone-500">{h2h.atBHome.draws} ת&#39;</span> ·{' '}
                <span className="text-red-700">{h2h.atBHome.winsB} ה&#39;</span>
              </p>
            </div>
          </div>

          {/* biggest wins */}
          {h2h.biggestAWin || h2h.biggestBWin ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {h2h.biggestAWin ? (
                <Link
                  href={`/games/${h2h.biggestAWin.gameId}`}
                  className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 transition-colors hover:border-emerald-400"
                >
                  <p className="text-xs font-bold text-emerald-700">הניצחון הגדול ביותר של {famA.nameHe}</p>
                  <p className="mt-1 text-xl font-black text-stone-900">{h2h.biggestAWin.label}</p>
                </Link>
              ) : null}
              {h2h.biggestBWin ? (
                <Link
                  href={`/games/${h2h.biggestBWin.gameId}`}
                  className="rounded-2xl border border-red-200 bg-red-50 p-4 transition-colors hover:border-red-400"
                >
                  <p className="text-xs font-bold text-red-700">הניצחון הגדול ביותר של {famB.nameHe}</p>
                  <p className="mt-1 text-xl font-black text-stone-900">{h2h.biggestBWin.label}</p>
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* full meetings table */}
          <div className="mt-8">
            <h2 className="text-sm font-bold text-stone-600">כל המפגשים ({h2h.meetings.length})</h2>
            <div className="mt-2 overflow-x-auto rounded-[24px] border border-stone-200 bg-white shadow-sm">
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-500">
                    <th className="px-4 py-3">תאריך</th>
                    <th className="px-4 py-3">מארחת</th>
                    <th className="px-4 py-3">תוצאה</th>
                    <th className="px-4 py-3">אורחת</th>
                    <th className="px-4 py-3">תחרות</th>
                  </tr>
                </thead>
                <tbody>
                  {h2h.meetings.map((m) => (
                    <tr key={m.gameId} className="border-b border-stone-100 last:border-0 hover:bg-stone-50">
                      <td className="p-0">
                        <Link href={`/games/${m.gameId}`} className="block px-4 py-3 text-stone-400" dir="ltr">
                          {new Date(m.date).toLocaleDateString('he-IL')}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/games/${m.gameId}`} className="block px-4 py-3 text-stone-700">{m.homeTeamName}</Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/games/${m.gameId}`} className="block px-4 py-3 text-center font-black text-stone-900">
                          {m.homeScore}:{m.awayScore}
                        </Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/games/${m.gameId}`} className="block px-4 py-3 text-stone-700">{m.awayTeamName}</Link>
                      </td>
                      <td className="p-0">
                        <Link href={`/games/${m.gameId}`} className="block px-4 py-3 text-stone-500">{m.competitionNameHe || '—'}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
