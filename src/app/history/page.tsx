import Link from 'next/link';
import type { Metadata } from 'next';
import prisma from '@/lib/prisma';
import { getSeasonsSpine } from '@/lib/history/seasons-spine';
import { buildAllTimeTable } from '@/lib/history/all-time-table';
import { getCupFinals } from '@/lib/history/club-honors';
import { getClubFamilies } from '@/lib/history/club-identity';
import { buildFullH2H } from '@/lib/h2h';
import { DERBY_PAIRS } from '@/lib/on-this-day';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'היסטוריה — כל ההיסטוריה של הכדורגל הישראלי | StatsAI',
  description: 'כל העונות, טבלת כל הזמנים, יריבויות, ספר השיאים וזוכי הגביעים — 26 שנות כדורגל ישראלי במקום אחד.',
};

// Same normalization club-identity/H2H index pages use — normalized-EXACT
// only (a substring fallback risks binding to the wrong club family).
function normalizeName(name: string): string {
  return (name || '')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/['"״׳\-\.`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Cheap one-pair teaser for the "יריבויות" card: resolve the top curated
// derby pair to club families and read its cached (1h) H2H meeting count —
// no full rivalry list computation.
async function getDerbyTeaser(): Promise<string | null> {
  const pair = DERBY_PAIRS[0];
  if (!pair) return null;
  const [nameA, nameB] = pair;
  const families = await getClubFamilies();
  const findFamily = (name: string) => families.find((f) => normalizeName(f.nameHe) === normalizeName(name));
  const famA = findFamily(nameA);
  const famB = findFamily(nameB);
  if (!famA || !famB || famA.clubKey === famB.clubKey) return null;
  const h2h = await buildFullH2H(famA.latestTeamId, famB.latestTeamId);
  if (!h2h || h2h.totals.games === 0) return null;
  return `${famA.nameHe} נגד ${famB.nameHe} · ${h2h.totals.games} מפגשים`;
}

export default async function HistoryHubPage() {
  const [spine, allTimeRows, finals, derbyTeaser, recordsCount] = await Promise.all([
    getSeasonsSpine(),
    buildAllTimeTable({ scope: 'all' }),
    getCupFinals(),
    getDerbyTeaser(),
    prisma.recordEntry.count({ where: { scope: 'league' } }),
  ]);

  const latestChampion = spine[0]?.champion?.nameHe ?? null;
  const allTimeLeader = allTimeRows[0] ?? null;

  const cards: Array<{ href: string; icon: string; title: string; description: string; teaser: string | null }> = [
    {
      href: '/history/seasons',
      icon: '📅',
      title: 'כל העונות',
      description: 'אלופות, מלכי שערים ויורדות בכל עונה',
      teaser: latestChampion ? `אלופה אחרונה: ${latestChampion}` : null,
    },
    {
      href: '/history/all-time',
      icon: '📊',
      title: 'טבלת כל הזמנים',
      description: 'נקודות, ניצחונות והפרש שערים מצטברים מאז 1949',
      teaser: allTimeLeader ? `מובילה: ${allTimeLeader.nameHe} · ${allTimeLeader.points} נק׳` : null,
    },
    {
      href: '/history/h2h',
      icon: '⚔️',
      title: 'יריבויות',
      description: 'העימותים הגדולים בין קבוצות היריבות',
      teaser: derbyTeaser,
    },
    {
      href: '/history/records',
      icon: '📖',
      title: 'ספר השיאים',
      description: 'הניצחונות הגדולים, השערים המהירים והרצפים הארוכים בהיסטוריה',
      teaser: recordsCount > 0 ? `${recordsCount} שיאים מתועדים` : null,
    },
    {
      href: '/history/cups',
      icon: '🏆',
      title: 'זוכי הגביעים',
      description: 'גביע המדינה, גביע הטוטו וגביע העל מאז 1945',
      teaser: finals.length > 0 ? `${finals.length} גמרים מתועדים` : null,
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">היסטוריה</h1>
      <p className="mt-2 text-sm text-stone-500">26 שנות כדורגל ישראלי — עונות, שיאים, יריבויות וגביעים במקום אחד</p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="flex flex-col gap-2 rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm transition-colors hover:border-[var(--accent)]"
          >
            <span className="flex items-center gap-2 text-lg font-black text-stone-900">
              <span aria-hidden>{card.icon}</span>
              {card.title}
            </span>
            <span className="text-sm text-stone-500">{card.description}</span>
            {card.teaser ? (
              <span className="mt-1 inline-block w-fit rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-600">
                {card.teaser}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      <Link
        href="/statistics/all-time"
        className="mt-4 flex items-center justify-between gap-3 rounded-[20px] border border-stone-200 bg-stone-50 p-4 text-sm shadow-sm transition-colors hover:border-[var(--accent)]"
      >
        <span className="font-bold text-stone-700">⚽ מלכי השערים לדורותיהם — טבלאות שחקנים לכל הזמנים</span>
        <span className="text-xs font-black text-[var(--accent)]">←</span>
      </Link>
    </div>
  );
}
