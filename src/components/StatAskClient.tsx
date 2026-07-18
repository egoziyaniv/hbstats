'use client';
import { useState } from 'react';
import { StatAnswerCard } from './StatAnswerCard';
import type { AnsweredCard } from '@/lib/stats-qa';

type Q = { id: string; scope: 'club' | 'league'; needsClub: boolean; needsRival: boolean; titleHe: string };
type Club = { clubKey: string; nameHe: string };

export function StatAskClient({ questions, clubs }: { questions: Q[]; clubs: Club[] }) {
  const [clubKey, setClubKey] = useState(clubs[0]?.clubKey ?? '');
  const [card, setCard] = useState<AnsweredCard | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(q: Q) {
    setLoading(true); setCard(null);
    const params = new URLSearchParams({ q: q.id });
    if (q.needsClub) params.set('club', clubKey);
    if (q.needsRival) { const rival = clubs.find((c) => c.clubKey !== clubKey); if (rival) params.set('rival', rival.clubKey); }
    const res = await fetch(`/api/history/ask?${params}`);
    const json = await res.json();
    setCard(json.card ?? null); setLoading(false);
  }

  const chip = (q: Q) => (
    <button key={q.id} onClick={() => ask(q)} className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 shadow-sm hover:border-red-300">{q.titleHe}</button>
  );

  return (
    <div dir="rtl" className="space-y-5">
      <div className="rounded-xl border border-dashed border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-400">שאל כל דבר על 26 שנות כדורגל… (בקרוב)</div>
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-black text-stone-900">על הקבוצה</h2>
          <select value={clubKey} onChange={(e) => setClubKey(e.target.value)} className="rounded-full border border-stone-200 bg-white px-3 py-1 text-sm font-bold text-red-800">
            {clubs.map((c) => <option key={c.clubKey} value={c.clubKey}>{c.nameHe}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap gap-2">{questions.filter((q) => q.scope === 'club').map(chip)}</div>
      </section>
      <section>
        <h2 className="mb-2 text-base font-black text-stone-900">בכל הליגה</h2>
        <div className="flex flex-wrap gap-2">{questions.filter((q) => q.scope === 'league').map(chip)}</div>
      </section>
      {loading && <div className="text-sm text-stone-400">טוען…</div>}
      {card && <StatAnswerCard card={card} />}
    </div>
  );
}
