'use client';
import { useState } from 'react';
import { factSvg, type MatchFact } from '@/lib/fan-discovery';
export default function MatchFactShare({ fact }: { fact: MatchFact }) {
  const [message, setMessage] = useState('');
  function download() {
    const url = URL.createObjectURL(new Blob([factSvg(fact)], { type: 'image/svg+xml;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `statsai-${fact.id}.svg`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function share() {
    try {
      if (!navigator.share) { download(); return; }
      await navigator.share({ title: 'StatsAI — עובדה מהארכיון', text: `${fact.result} מול ${fact.opponent} · ${fact.goalsFor} שערי זכות, ${fact.goalsAgainst} שערי חובה · ${fact.season} · ${new Date(fact.date).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`, url: fact.source });
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setMessage('השיתוף לא הושלם. אפשר להוריד את הכרטיס.'); }
  }
  return <div className="space-y-2"><div className="flex flex-wrap gap-3"><button onClick={share} className="rounded-xl bg-red-800 px-4 py-2 font-bold text-white">שיתוף העובדה</button><button onClick={download} className="rounded-xl border border-stone-300 px-4 py-2">הורדת כרטיס SVG</button></div><p role="status" className="text-sm">{message}</p></div>;
}
