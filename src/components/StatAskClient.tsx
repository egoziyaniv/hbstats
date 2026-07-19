'use client';
import { useState } from 'react';
import { StatAnswerCard } from './StatAnswerCard';
import type { AnsweredCard } from '@/lib/stats-qa';

type Q = { id: string; scope: 'club' | 'league'; needsClub: boolean; needsRival: boolean; titleHe: string };
type Club = { clubKey: string; nameHe: string };

export function StatAskClient({ questions, clubs }: { questions: Q[]; clubs: Club[] }) {
  const firstKey = clubs[0]?.clubKey ?? '';
  const [clubKey, setClubKey] = useState(firstKey);
  const [rivalKey, setRivalKey] = useState(clubs.find((c) => c.clubKey !== firstKey)?.clubKey ?? '');
  const [card, setCard] = useState<AnsweredCard | null>(null);
  const [loading, setLoading] = useState(false);

  // Keep the rival distinct from the selected club when the club changes.
  function selectClub(v: string) {
    setClubKey(v);
    if (rivalKey === v) setRivalKey(clubs.find((c) => c.clubKey !== v)?.clubKey ?? '');
  }

  async function ask(q: Q) {
    setLoading(true); setCard(null);
    const params = new URLSearchParams({ q: q.id });
    if (q.needsClub) params.set('club', clubKey);
    if (q.needsRival) params.set('rival', rivalKey || clubs.find((c) => c.clubKey !== clubKey)?.clubKey || '');
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
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black text-stone-900">על הקבוצה</h2>
          <div className="flex items-center gap-1.5 text-sm">
            <select value={clubKey} onChange={(e) => selectClub(e.target.value)} className="rounded-full border border-stone-200 bg-white px-3 py-1 font-bold text-red-800">
              {clubs.map((c) => <option key={c.clubKey} value={c.clubKey}>{c.nameHe}</option>)}
            </select>
            <span className="text-stone-400">מול</span>
            <select value={rivalKey} onChange={(e) => setRivalKey(e.target.value)} className="rounded-full border border-stone-200 bg-white px-3 py-1 font-bold text-stone-700" title="יריבה עבור 'מאזן מול יריבה'">
              {clubs.filter((c) => c.clubKey !== clubKey).map((c) => <option key={c.clubKey} value={c.clubKey}>{c.nameHe}</option>)}
            </select>
          </div>
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
