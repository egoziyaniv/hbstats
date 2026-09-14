'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { PlayerPhoto, TeamLogo } from '@/components/MediaImage';
import type { SeasonDossierMetric, SeasonDossierMetricKey, SeasonDossierPayload } from '@shared/types/mobile-api';

const metricLabels: Record<SeasonDossierMetricKey, string> = {
  matches: 'משחקים', wins: 'ניצחונות', goalsFor: 'שערים', leaguePosition: 'מיקום בליגה',
};
const coverageLabels = { COMPLETE: 'כיסוי מלא', PARTIAL: 'כיסוי חלקי', UNKNOWN: 'כיסוי לא ידוע' } as const;

export function SeasonDossierEvidence({ metric, dossier, onClose }: {
  metric: SeasonDossierMetric; dossier: SeasonDossierPayload; onClose?: () => void;
}) {
  const evidenceIds = new Set(metric.evidenceGameIds);
  const games = dossier.games.flatMap((group) => group.games).filter((game) => evidenceIds.has(game.id));
  const competitionIds = new Set(metric.competitionBreakdown.map((row) => row.competitionId));
  if (metric.key === 'leaguePosition' && dossier.standing) competitionIds.add(dossier.standing.competitionId);
  const sources = dossier.sources.filter((source) =>
    (source.scope === 'METRICS' || source.scope === 'BOTH') &&
    (source.competitionId === null || competitionIds.has(source.competitionId)),
  );
  return (
    <section id={`metric-evidence-${metric.key}`} aria-labelledby={`metric-title-${metric.key}`} className="col-span-2 rounded-3xl border border-red-200 bg-red-50/60 p-5 lg:col-span-4">
      <div className="flex items-start justify-between gap-4">
        <div><div className="text-xs font-black text-red-800">מאיפה המספר?</div><h3 id={`metric-title-${metric.key}`} className="mt-1 text-xl font-black">{metricLabels[metric.key]}</h3></div>
        {onClose && <button type="button" onClick={onClose} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm font-bold">סגירה</button>}
      </div>
      <p className="mt-4 leading-7 text-stone-700">{metric.definitionHe}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold"><span className="rounded-full bg-white px-3 py-1.5">{coverageLabels[metric.coverage]}</span><span className="text-stone-500">חושב: {new Date(metric.computedAt).toLocaleString('he-IL')}</span></div>
      {metric.competitionBreakdown.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-3">{metric.competitionBreakdown.map((row) => <div key={row.competitionId} className="rounded-xl bg-white p-3 text-sm"><div className="font-bold">{row.competitionNameHe}</div><div className="mt-1 text-lg font-black">{row.value ?? 'לא ידוע'}</div><div className="text-xs text-stone-500">{coverageLabels[row.coverage]}</div></div>)}</div>}
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div><h4 className="font-black">מקורות</h4>{sources.length ? <ul className="mt-2 space-y-2">{sources.map((source) => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer" className="font-bold text-red-800 underline">{source.labelHe}</a><span className="mr-2 text-xs text-stone-500">{source.provider}</span>{source.noteHe && <p className="text-xs text-stone-600">{source.noteHe}</p>}</li>)}</ul> : <p className="mt-2 text-sm text-stone-500">לא צורף מקור חיצוני.</p>}</div>
        <div><h4 className="font-black">המשחקים שמרכיבים את הנתון</h4>{games.length ? <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto">{games.map((game) => <li key={game.id}><Link href={`/games/${game.id}`} className="text-sm font-bold text-stone-800 hover:text-red-800">{new Date(game.dateTime).toLocaleDateString('he-IL')} · {game.opponent.nameHe} · {game.goalsFor}:{game.goalsAgainst}</Link></li>)}</ul> : <p className="mt-2 text-sm text-stone-500">אין משחקי ראיה זמינים למדד הזה.</p>}</div>
      </div>
    </section>
  );
}

export default function SeasonDossierClient({ dossier }: { dossier: SeasonDossierPayload }) {
  const [openMetric, setOpenMetric] = useState<SeasonDossierMetricKey | null>(null);
  const openerRefs = useRef<Partial<Record<SeasonDossierMetricKey, HTMLButtonElement | null>>>({});
  const selectedMetric = dossier.metrics.find((metric) => metric.key === openMetric) ?? null;
  function closeEvidence() {
    const key = openMetric;
    setOpenMetric(null);
    if (key) requestAnimationFrame(() => openerRefs.current[key]?.focus());
  }
  return (
    <main dir="rtl" className="min-h-screen overflow-x-hidden bg-[#f5f0e8] text-stone-900">
      <section className="relative isolate overflow-hidden bg-stone-950 text-white">
        {dossier.editorial?.heroImageUrl && <img src={dossier.editorial.heroImageUrl} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-45" />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-stone-950 via-stone-950/70 to-red-950/30" />
        <div className="mx-auto flex min-h-[440px] max-w-6xl flex-col justify-end px-4 py-12 sm:px-6">
          <div className="flex items-center gap-3"><TeamLogo src={dossier.team.logoUrl} alt={dossier.team.nameHe} className="h-14 w-14 object-contain" fallbackClassName="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-sm font-black" /><span className="rounded-full border border-white/30 bg-black/20 px-3 py-1 text-xs font-black">{dossier.status === 'CURRENT' ? 'עונה נוכחית' : 'עונה שהסתיימה'}</span></div>
          <h1 className="mt-5 text-5xl font-black tracking-tight sm:text-7xl">{dossier.season.name}</h1>
          <p className="mt-4 max-w-3xl text-lg font-semibold leading-8 text-stone-100 sm:text-xl">{dossier.editorial?.introHe || 'הסיפור, המספרים והמשחקים של הפועל באר שבע בעונה הזו.'}</p>
          <div className="mt-6 flex flex-wrap gap-3"><a href="#story" className="rounded-full bg-red-700 px-5 py-2.5 text-sm font-black">לסיפור העונה</a><Link href={`/games?season=${dossier.season.id}&teamId=${dossier.team.id}`} className="rounded-full border border-white/40 px-5 py-2.5 text-sm font-black">לכל המשחקים</Link></div>
        </div>
      </section>

      <nav aria-label="חלקי תיק העונה" className="sticky top-0 z-20 overflow-hidden border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap justify-center gap-2 px-4 py-3 text-sm font-bold">{[['story','הסיפור'],['moments','רגעים'],['squad','סגל'],['standing','טבלה'],['matches','משחקים']].map(([id,label]) => <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full bg-stone-100 px-4 py-2 hover:bg-red-100">{label}</a>)}</div>
      </nav>

      <div className="mx-auto max-w-6xl space-y-12 px-4 py-10 sm:px-6">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="מדדי העונה">
          {dossier.metrics.map((metric) => <button key={metric.key} ref={(node) => { openerRefs.current[metric.key] = node; }} type="button" id={`metric-button-${metric.key}`} aria-expanded={openMetric === metric.key} aria-controls={`metric-evidence-${metric.key}`} onClick={() => setOpenMetric(openMetric === metric.key ? null : metric.key)} className="rounded-3xl border border-stone-200 bg-white p-5 text-right shadow-sm transition hover:-translate-y-0.5 hover:border-red-300"><span className="text-sm font-bold text-stone-500">{metricLabels[metric.key]}</span><strong className="mt-2 block text-4xl font-black">{metric.value ?? 'לא ידוע'}</strong><span className="mt-3 block text-xs font-black text-red-800">מאיפה המספר?</span></button>)}
          {selectedMetric && <SeasonDossierEvidence metric={selectedMetric} dossier={dossier} onClose={closeEvidence} />}
        </section>

        <section id="story" className="scroll-mt-24 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <article className="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm"><h2 className="border-r-4 border-red-800 pr-3 text-2xl font-black">הסיפור של העונה</h2><p className="mt-5 whitespace-pre-line text-base leading-8 text-stone-700">{dossier.editorial?.summaryHe || 'הסיפור המלא של העונה יתווסף בהמשך.'}</p></article>
          <aside className="rounded-3xl bg-red-950 p-6 text-white"><h2 className="text-xl font-black">תמונת מצב</h2>{dossier.coach && <p className="mt-4 text-sm">מאמן: <strong>{dossier.coach.nameHe}</strong></p>}{dossier.honors.length > 0 && <div className="mt-5 flex flex-wrap gap-2">{dossier.honors.map((honor, index) => <span key={`${honor.competitionHe}-${index}`} className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-stone-950">{honor.competitionHe}</span>)}</div>}</aside>
        </section>

        <section id="moments" className="scroll-mt-24"><h2 className="text-2xl font-black">הרגעים שעיצבו את העונה</h2>{dossier.moments.length ? <div className="mt-5 border-r-2 border-red-200 pr-5">{dossier.moments.map((moment) => <article key={moment.id} className="relative mb-6 rounded-3xl border border-stone-200 bg-white p-5 shadow-sm before:absolute before:-right-[29px] before:top-7 before:h-3 before:w-3 before:rounded-full before:bg-red-700"><time className="text-xs font-black text-red-800">{new Date(moment.eventDate).toLocaleDateString('he-IL')}</time><h3 className="mt-2 text-xl font-black">{moment.titleHe}</h3><p className="mt-2 whitespace-pre-line leading-7 text-stone-600">{moment.bodyHe}</p>{moment.game && <Link href={`/games/${moment.game.id}`} className="mt-3 inline-block text-sm font-black text-red-800">למשחק המקושר ←</Link>}{moment.sources.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{moment.sources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline">{source.labelHe}</a>)}</div>}</article>)}</div> : <p className="mt-3 text-stone-500">רגעי העונה יתווספו בהמשך.</p>}</section>

        <section id="squad" className="scroll-mt-24"><h2 className="text-2xl font-black">הסגל</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{dossier.squad.map((player) => <Link href={`/players/${player.playerId}`} key={player.playerId} className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><PlayerPhoto src={player.photoUrl} alt={player.nameHe} className="h-12 w-12 rounded-full object-cover" /><div className="min-w-0 flex-1"><div className="truncate font-black">{player.nameHe}</div><div className="text-xs text-stone-500">{player.position || 'ללא עמדה'} · {player.appearances ?? '—'} הופעות · {player.goals ?? '—'} שערים</div></div>{player.jerseyNumber !== null && <span className="text-xl font-black text-red-800">{player.jerseyNumber}</span>}</Link>)}</div></section>

        <section id="standing" className="scroll-mt-24"><h2 className="text-2xl font-black">הקשר ליגתי</h2>{dossier.standing ? <div className="mt-5 grid gap-3 rounded-3xl bg-stone-950 p-6 text-white sm:grid-cols-4"><div><span className="text-xs text-stone-400">מיקום</span><strong className="block text-4xl">{dossier.standing.position ?? 'לא ידוע'}</strong></div><div><span className="text-xs text-stone-400">נקודות</span><strong className="block text-3xl">{dossier.standing.points}</strong></div><div><span className="text-xs text-stone-400">מאזן</span><strong className="block text-xl">{dossier.standing.wins}-{dossier.standing.draws}-{dossier.standing.losses}</strong></div><div><span className="text-xs text-stone-400">שערים</span><strong className="block text-xl">{dossier.standing.goalsFor}:{dossier.standing.goalsAgainst}</strong></div></div> : <p className="mt-3 text-stone-500">אין טבלת ליגה זמינה.</p>}</section>

        <section id="matches" className="scroll-mt-24"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-black">משחקי העונה</h2><Link href={`/games?season=${dossier.season.id}&teamId=${dossier.team.id}`} className="text-sm font-black text-red-800 underline">לכל המשחקים</Link></div><div className="mt-5 space-y-5">{dossier.games.map((group) => <article key={`${group.competitionId}-${group.labelHe}`} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm"><h3 className="font-black">{group.labelHe}</h3><div className="mt-3 divide-y divide-stone-100">{group.games.map((game) => <Link key={game.id} href={`/games/${game.id}`} className="grid grid-cols-[6rem_1fr_auto] items-center gap-3 py-3 text-sm hover:text-red-800"><time className="text-xs text-stone-500">{new Date(game.dateTime).toLocaleDateString('he-IL')}</time><span className="font-bold">{game.isHome ? 'בית' : 'חוץ'} · {game.opponent.nameHe}</span><strong>{game.goalsFor === null ? 'טרם שוחק' : `${game.goalsFor}:${game.goalsAgainst}`}</strong></Link>)}</div></article>)}</div></section>
      </div>
    </main>
  );
}
