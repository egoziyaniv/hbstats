import Link from 'next/link';
import { answerQuestion } from '@/lib/stats-qa';

// Rotates daily across a mix of club + league questions so the home teaser isn't
// always the same stat. Each entry must resolve to a headline on its own.
const ROTATION: { id: string; clubKey?: string }[] = [
  { id: 'club_top_scorer', clubKey: 'api-563' },
  { id: 'league_most_titles' },
  { id: 'league_all_time_leader' },
  { id: 'league_top_scorer' },
  { id: 'league_biggest_rivalries' },
];

// Server component: renders one question card as a home teaser. With no explicit
// id it rotates daily; falls back to the club top-scorer if the day's pick is empty.
export async function HomeStatTeaser({ id, clubKey }: { id?: string; clubKey?: string } = {}) {
  const pick = id ? { id, clubKey } : ROTATION[Math.floor(Date.now() / 86_400_000) % ROTATION.length];
  let card = await answerQuestion(pick.id, { clubKey: pick.clubKey });
  if (!card?.headline && !id) card = await answerQuestion('club_top_scorer', { clubKey: 'api-563' });
  if (!card?.headline) return null;
  return (
    <Link href="/history/ask" className="block rounded-xl border border-stone-200 bg-white p-4 shadow-sm hover:bg-stone-50" dir="rtl">
      <div className="text-xs text-stone-400">שיאים ותשובות · {card.titleHe}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="font-black text-stone-900">{card.headline.label}</span>
        <span className="text-xl font-black text-red-800">{card.headline.value}</span>
      </div>
      <div className="mt-1 text-xs font-bold text-red-800">שאל עוד ←</div>
    </Link>
  );
}
