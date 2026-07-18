import { listQuestions } from '@/lib/stats-qa';
import { getCurrentLeagueClubFamilies } from '@/lib/history/club-identity';
import { StatAskClient } from '@/components/StatAskClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'שיאים ותשובות | StatsAI' };

export default async function AskPage() {
  const families = await getCurrentLeagueClubFamilies();
  const hbsFirst = [...families].sort((a, b) => (a.clubKey === 'api-563' ? -1 : b.clubKey === 'api-563' ? 1 : 0));
  const clubs = hbsFirst.map((f) => ({ clubKey: f.clubKey, nameHe: f.nameHe }));
  return (
    <main className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-2xl font-black text-stone-900" dir="rtl">שיאים ותשובות</h1>
      <StatAskClient questions={listQuestions()} clubs={clubs} />
    </main>
  );
}
