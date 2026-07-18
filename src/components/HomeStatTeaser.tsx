import Link from 'next/link';
import { answerQuestion } from '@/lib/stats-qa';

// Server component: renders one preselected question card as a home teaser.
export async function HomeStatTeaser({ id = 'club_top_scorer', clubKey = 'api-563' }: { id?: string; clubKey?: string }) {
  const card = await answerQuestion(id, { clubKey });
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
