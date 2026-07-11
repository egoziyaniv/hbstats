import Link from 'next/link';
import type { Metadata } from 'next';
import { getClubFamilies, type ClubFamily } from '@/lib/history/club-identity';
import { DERBY_PAIRS } from '@/lib/on-this-day';
import { TeamLogo } from '@/components/MediaImage';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'יריבויות — כל ההיסטוריה | StatsAI',
  description: 'ההיסטוריה המלאה בין קבוצות היריבות של ליגת העל הישראלית — נצחונות, שערים ומפגשים מכל הזמנים.',
};

// Curated index — no free-text club picker yet (kept simple per plan): the
// known derby pairs (from on-this-day.ts's DERBY_PAIRS) resolved to club
// families by name match, plus the top clubs by season count as a
// secondary "pick a club" list linking to the team page.

// Same normalization family club-identity uses for grouping — strip
// quotes/gershayim/dashes/dots, collapse spaces, lowercase. Matching is
// normalized-EXACT only: a substring fallback is dangerous here (e.g. a
// family named "ירושלים" is a substring of both Jerusalem derby names and
// could silently bind a derby card to the wrong club). A miss just drops
// the card.
function normalizeName(name: string): string {
  return (name || '')
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/['"״׳\-\.`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findFamily(families: ClubFamily[], name: string): ClubFamily | undefined {
  const key = normalizeName(name);
  return families.find((f) => normalizeName(f.nameHe) === key);
}

export default async function H2HIndexPage() {
  const families = await getClubFamilies();

  const derbies = DERBY_PAIRS.map(([a, b]) => {
    const famA = findFamily(families, a);
    const famB = findFamily(families, b);
    if (!famA || !famB || famA.clubKey === famB.clubKey) return null;
    return { famA, famB };
  }).filter((x): x is { famA: ClubFamily; famB: ClubFamily } => x !== null);

  // StatsAI is Hapoel Be'er Sheva-fans-first: HBS rivalries get their own
  // leading section; the classic derbies follow.
  const hbsKey = normalizeName('הפועל באר שבע');
  const isHbsPair = (d: { famA: ClubFamily; famB: ClubFamily }) =>
    normalizeName(d.famA.nameHe) === hbsKey || normalizeName(d.famB.nameHe) === hbsKey;
  const hbsDerbies = derbies.filter(isHbsPair);
  const otherDerbies = derbies.filter((d) => !isHbsPair(d));

  const topClubs = families.slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="border-r-[4px] border-[var(--accent)] pr-3 text-3xl font-black text-stone-900">יריבויות</h1>
      <p className="mt-2 text-sm text-stone-500">
        ההיסטוריה המלאה בין קבוצות היריבות ·{' '}
        <Link href="/history/all-time" className="font-bold text-[var(--accent)]">טבלת כל הזמנים ←</Link>
      </p>

      {hbsDerbies.length > 0 ? (
        <>
          <h2 className="mt-6 text-lg font-black text-stone-900">היריבויות של הפועל באר שבע</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {hbsDerbies.map((d) => (
              <DerbyCard key={`${d.famA.clubKey}__${d.famB.clubKey}`} famA={d.famA} famB={d.famB} />
            ))}
          </div>
        </>
      ) : null}

      {otherDerbies.length > 0 ? (
        <>
          <h2 className="mt-8 text-lg font-black text-stone-900">עוד יריבויות קלאסיות</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {otherDerbies.map((d) => (
              <DerbyCard key={`${d.famA.clubKey}__${d.famB.clubKey}`} famA={d.famA} famB={d.famB} />
            ))}
          </div>
        </>
      ) : null}

      {derbies.length === 0 ? (
        <p className="mt-6 text-sm text-stone-500">אין יריבויות מוגדרות.</p>
      ) : null}

      <h2 className="mt-10 text-lg font-black text-stone-900">בחרו מועדון</h2>
      <p className="mt-1 text-xs text-stone-500">קישור לדף הקבוצה — משם ניתן לצפות בהיסטוריה מול כל יריב</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {topClubs.map((f) => (
          <Link
            key={f.clubKey}
            href={`/teams/${f.latestTeamId}`}
            className="flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-bold text-stone-700 transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            <TeamLogo
              src={f.logoUrl}
              alt={f.nameHe}
              className="h-5 w-5 rounded-full object-contain"
              fallbackClassName="flex h-5 w-5 items-center justify-center rounded-full bg-violet-100 text-[8px] font-black text-violet-700"
            />
            {f.nameHe}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DerbyCard({ famA, famB }: { famA: ClubFamily; famB: ClubFamily }) {
  return (
    <Link
      href={`/history/h2h/${famA.clubKey}__${famB.clubKey}`}
      className="flex items-center justify-between gap-3 rounded-[20px] border border-stone-200 bg-white p-4 shadow-sm transition-colors hover:border-[var(--accent)]"
    >
      <span className="flex items-center gap-2 font-bold text-stone-900">
        <TeamLogo
          src={famA.logoUrl}
          alt={famA.nameHe}
          className="h-7 w-7 rounded-full object-contain"
          fallbackClassName="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700"
        />
        {famA.nameHe}
      </span>
      <span className="text-xs font-black text-stone-400">נגד</span>
      <span className="flex items-center gap-2 font-bold text-stone-900">
        {famB.nameHe}
        <TeamLogo
          src={famB.logoUrl}
          alt={famB.nameHe}
          className="h-7 w-7 rounded-full object-contain"
          fallbackClassName="flex h-7 w-7 items-center justify-center rounded-full bg-violet-100 text-[10px] font-black text-violet-700"
        />
      </span>
    </Link>
  );
}
