'use client';
import { useState } from 'react';
import type { MatchFact } from '@/lib/fan-discovery';
import MatchFactShare from '@/components/MatchFactShare';
type Question = { id: string; opponent: string; homeTeam: string; awayTeam: string; competition: string; round: string | null; season: string; date: string; home: boolean };
export default function QuizQuestion({ question }: { question: Question }) {
  const [answer, setAnswer] = useState<{ correct: boolean; fact: MatchFact } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(choice: string) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/club/quiz/answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: question.id, choice }) });
      if (!response.ok) throw new Error(response.status === 409 ? 'השאלה התחלפה. רעננו את העמוד.' : 'לא ניתן לבדוק כרגע. נסו שוב.');
      setAnswer(await response.json());
    } catch (e) { setError(e instanceof Error ? e.message : 'לא ניתן לבדוק כרגע.'); }
    finally { setBusy(false); }
  }
  return <section className="space-y-5 rounded-2xl border bg-white p-6"><div><p className="text-sm font-bold text-stone-600">{question.competition}{question.round ? ` · ${question.round}` : ''}</p><h2 className="mt-1 text-xl font-bold">איך הסתיים המשחק: {question.homeTeam} מול {question.awayTeam}?</h2></div><p className="text-sm text-stone-600">לפי התוצאה השמורה, ללא הכרעת בעיטות פנדלים.</p><p>עונת {question.season} · {question.home ? 'בבית' : 'בחוץ'} · {new Date(question.date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}</p><div className="flex flex-wrap gap-3">{['ניצחון', 'תיקו', 'הפסד'].map(choice => <button key={choice} disabled={busy || !!answer} onClick={() => submit(choice)} className="rounded-xl border border-stone-300 px-5 py-3 font-bold disabled:opacity-50">{choice}</button>)}</div><p role="status">{error || (busy ? 'בודקים…' : '')}</p>{answer && <div className="space-y-4" aria-live="polite"><p className="text-xl font-bold">{answer.correct ? 'נכון!' : 'הפעם לא.'} {answer.fact.result} — {answer.fact.goalsFor} שערי זכות, {answer.fact.goalsAgainst} שערי חובה.</p><a href={answer.fact.source} className="underline">לפתיחת דף המשחק המלא</a><MatchFactShare fact={answer.fact} /></div>}</section>;
}
