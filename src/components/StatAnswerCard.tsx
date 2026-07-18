import Link from 'next/link';
import type { AnsweredCard } from '@/lib/stats-qa';

export function StatAnswerCard({ card }: { card: AnsweredCard }) {
  if (!card.headline) {
    return <div className="rounded-xl border border-stone-200 bg-white p-4 text-center text-sm text-stone-400">אין מספיק נתונים לשאלה זו</div>;
  }
  const max = Math.max(1, ...(card.series ?? []).map((s) => s.value));
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm" dir="rtl">
      <div className="text-xs text-stone-400">{card.titleHe}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-lg font-black text-stone-900">{card.headline.label}</span>
        <span className="text-2xl font-black text-red-800">{card.headline.value}</span>
        {card.headline.unit && <span className="text-xs text-stone-500">{card.headline.unit}</span>}
      </div>
      {card.secondary && <div className="mt-1 text-xs text-stone-600">{card.secondary}</div>}
      {card.cardType === 'bar' && card.series && (
        <div className="mt-2 flex h-10 items-end gap-1">
          {card.series.map((s, i) => <div key={i} title={`${s.label}: ${s.value}`} className="flex-1 rounded-t bg-red-700" style={{ height: `${Math.round((s.value / max) * 100)}%` }} />)}
        </div>
      )}
      {card.cardType === 'leaderboard' && card.top && (
        <ol className="mt-2 space-y-1 text-sm">
          {card.top.map((t, i) => (
            <li key={i} className="flex justify-between">
              <span className="text-stone-700">{i + 1}. {t.href ? <Link href={t.href} className="hover:text-red-800">{t.name}</Link> : t.name}</span>
              <span className="font-bold text-stone-900">{t.value}</span>
            </li>
          ))}
        </ol>
      )}
      {card.narrative && <div className="mt-2 text-[11.5px] italic text-stone-600">&quot;{card.narrative}&quot;</div>}
      {card.coverageNote && <div className="mt-1 text-[10px] text-stone-400">{card.coverageNote}</div>}
      {card.href && <Link href={card.href} className="mt-2 inline-block text-xs font-bold text-red-800">לפרטים ←</Link>}
    </div>
  );
}
