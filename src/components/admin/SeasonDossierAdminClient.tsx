'use client';

import React, { useMemo, useState } from 'react';
import type { SeasonDossierMoment, SeasonDossierPayload, SeasonDossierSource } from '@shared/types/mobile-api';

type Publication = { isPublished: boolean; publishedAt: string | null };
type MomentAdmin = { id: string; isPublished: boolean; gameId: string | null; mediaAssetId: string | null; imageUrl: string | null };
type ApiResult = { dossier: SeasonDossierPayload; publication: Publication; momentAdmin: Record<string, MomentAdmin> };

const inputClass = 'w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-red-700 focus:outline-none';
const buttonClass = 'rounded-full bg-stone-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-50';
const metricLabels = { matches: 'משחקים', wins: 'ניצחונות', goalsFor: 'שערים', leaguePosition: 'מיקום בליגה' } as const;

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'הפעולה נכשלה');
  return data;
}

function dateInput(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '';
}

function Count({ value, max }: { value: string; max: number }) {
  return <span className={value.length > max ? 'text-xs font-bold text-red-700' : 'text-xs text-stone-500'}>{value.length}/{max}</span>;
}

export default function SeasonDossierAdminClient({
  seasonId,
  initialDossier,
  initialPublication,
  initialMomentAdmin,
}: {
  seasonId: string;
  initialDossier: SeasonDossierPayload;
  initialPublication: Publication;
  initialMomentAdmin: Record<string, MomentAdmin>;
}) {
  const [dossier, setDossier] = useState(initialDossier);
  const [publication, setPublication] = useState(initialPublication);
  const [momentAdmin, setMomentAdmin] = useState(initialMomentAdmin);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const baseUrl = `/api/admin/club/seasons/${encodeURIComponent(seasonId)}`;

  async function reload() {
    const result = await requestJson(baseUrl) as ApiResult;
    setDossier(result.dossier);
    setPublication(result.publication);
    setMomentAdmin(result.momentAdmin);
  }

  async function mutate(url: string, method: string, body?: unknown) {
    setBusy(true);
    setMessage('');
    try {
      await requestJson(url, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      await reload();
      setMessage('נשמר בהצלחה');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'הפעולה נכשלה');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const gameOptions = useMemo(
    () => dossier.games.flatMap((group) => group.games).map((game) => ({
      id: game.id,
      label: `${new Date(game.dateTime).toLocaleDateString('he-IL')} · ${game.opponent.nameHe}`,
    })),
    [dossier.games],
  );
  const allSources = useMemo(
    () => [...dossier.sources, ...dossier.moments.flatMap((moment) => moment.sources)],
    [dossier],
  );

  return (
    <div className="space-y-6">
      {message && <div role="status" className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-bold text-stone-700">{message}</div>}

      <DossierForm dossier={dossier} publication={publication} busy={busy} onSave={(body) => mutate(baseUrl, 'PUT', body)} />

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">מדדים מחושבים</h2>
        <p className="mt-1 text-sm text-stone-500">הערכים נגזרים ממשחקים וטבלאות ואינם ניתנים לעריכה כאן.</p>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {dossier.metrics.map((metric) => (
            <div key={metric.key} className="rounded-2xl bg-stone-50 p-4">
              <div className="text-xs font-bold text-stone-500">{metricLabels[metric.key]}</div>
              <div className="mt-1 text-3xl font-black">{metric.value ?? 'לא ידוע'}</div>
              <div className="mt-1 text-xs text-stone-500">כיסוי: {metric.coverage}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">ציר הזמן</h2>
        <div className="mt-4 space-y-4">
          {dossier.moments.map((moment, index) => (
            <MomentForm
              key={moment.id}
              moment={moment}
              admin={momentAdmin[moment.id]}
              gameOptions={gameOptions}
              busy={busy}
              onSave={(body) => mutate(`${baseUrl}/moments/${encodeURIComponent(moment.id)}`, 'PUT', body)}
              onDelete={() => mutate(`${baseUrl}/moments/${encodeURIComponent(moment.id)}`, 'DELETE')}
              onMove={async (delta) => {
                const target = dossier.moments[index + delta];
                if (!target) return;
                const first = momentBody(moment, momentAdmin[moment.id], target.displayOrder);
                const second = momentBody(target, momentAdmin[target.id], moment.displayOrder);
                setBusy(true);
                setMessage('');
                try {
                  await requestJson(`${baseUrl}/moments/${encodeURIComponent(moment.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(first) });
                  await requestJson(`${baseUrl}/moments/${encodeURIComponent(target.id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(second) });
                  await reload();
                  setMessage('הסדר נשמר');
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : 'הפעולה נכשלה');
                } finally { setBusy(false); }
              }}
            />
          ))}
          <MomentForm
            gameOptions={gameOptions}
            busy={busy}
            onSave={(body) => mutate(`${baseUrl}/moments`, 'POST', body)}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-black">מקורות וכיסוי</h2>
        <p className="mt-1 text-sm text-stone-500">מקור שמסומן ככיסוי מלא חייב לכלול התחלה, סיום ומועד אימות.</p>
        <div className="mt-4 space-y-4">
          {allSources.map((source) => (
            <SourceForm
              key={source.id}
              source={source}
              moments={dossier.moments}
              competitions={dossier.competitions}
              busy={busy}
              onSave={(body) => mutate(`${baseUrl}/sources/${encodeURIComponent(source.id)}`, 'PUT', body)}
              onDelete={() => mutate(`${baseUrl}/sources/${encodeURIComponent(source.id)}`, 'DELETE')}
            />
          ))}
          <SourceForm
            moments={dossier.moments}
            competitions={dossier.competitions}
            busy={busy}
            onSave={(body) => mutate(`${baseUrl}/sources`, 'POST', body)}
          />
        </div>
      </section>
    </div>
  );
}

function DossierForm({ dossier, publication, busy, onSave }: {
  dossier: SeasonDossierPayload; publication: Publication; busy: boolean; onSave: (body: unknown) => Promise<boolean>;
}) {
  const [introHe, setIntroHe] = useState(dossier.editorial?.introHe ?? '');
  const [summaryHe, setSummaryHe] = useState(dossier.editorial?.summaryHe ?? '');
  const [heroImageUrl, setHeroImageUrl] = useState(dossier.editorial?.heroImageUrl ?? '');
  const [isPublished, setIsPublished] = useState(publication.isPublished);
  return (
    <form onSubmit={(event) => { event.preventDefault(); void onSave({ introHe, summaryHe, heroImageUrl, isPublished }); }} className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-black">סיפור העונה</h2><p className="text-sm text-stone-500">{isPublished ? 'מפורסם לציבור' : 'טיוטה'}</p></div>
        <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> פרסום התיק</label>
      </div>
      <label className="mt-4 grid gap-1"><span className="flex justify-between text-sm font-bold">פתיח <Count value={introHe} max={1000} /></span><textarea className={inputClass} rows={5} maxLength={1000} value={introHe} onChange={(e) => setIntroHe(e.target.value)} /></label>
      <label className="mt-4 grid gap-1"><span className="flex justify-between text-sm font-bold">סיכום <Count value={summaryHe} max={4000} /></span><textarea className={inputClass} rows={9} maxLength={4000} value={summaryHe} onChange={(e) => setSummaryHe(e.target.value)} /></label>
      <label className="mt-4 grid gap-1 text-sm font-bold">קישור לתמונת שער<input dir="ltr" type="url" className={inputClass} value={heroImageUrl} onChange={(e) => setHeroImageUrl(e.target.value)} /></label>
      <button disabled={busy} className={`${buttonClass} mt-4`} type="submit">שמירת סיפור העונה</button>
    </form>
  );
}

function momentBody(moment: SeasonDossierMoment, admin?: MomentAdmin, displayOrder = moment.displayOrder) {
  return { eventDate: moment.eventDate, titleHe: moment.titleHe, bodyHe: moment.bodyHe, imageUrl: admin?.imageUrl ?? null, mediaAssetId: admin?.mediaAssetId ?? null, gameId: admin?.gameId ?? moment.game?.id ?? null, displayOrder, isPublished: admin?.isPublished ?? true };
}

function MomentForm({ moment, admin, gameOptions, busy, onSave, onDelete, onMove }: {
  moment?: SeasonDossierMoment; admin?: MomentAdmin; gameOptions: { id: string; label: string }[]; busy: boolean;
  onSave: (body: unknown) => Promise<boolean>; onDelete?: () => Promise<boolean>; onMove?: (delta: number) => void;
}) {
  const [eventDate, setEventDate] = useState(dateInput(moment?.eventDate));
  const [titleHe, setTitleHe] = useState(moment?.titleHe ?? '');
  const [bodyHe, setBodyHe] = useState(moment?.bodyHe ?? '');
  const [imageUrl, setImageUrl] = useState(admin?.imageUrl ?? '');
  const [gameId, setGameId] = useState(admin?.gameId ?? moment?.game?.id ?? '');
  const [isPublished, setIsPublished] = useState(admin?.isPublished ?? true);
  return (
    <form onSubmit={async (event) => { event.preventDefault(); const ok = await onSave({ eventDate, titleHe, bodyHe, imageUrl, gameId, mediaAssetId: admin?.mediaAssetId ?? null, displayOrder: moment?.displayOrder ?? 0, isPublished }); if (ok && !moment) { setTitleHe(''); setBodyHe(''); setGameId(''); } }} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <h3 className="font-black">{moment ? 'עריכת רגע' : 'הוספת רגע'}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">תאריך<input type="date" required className={inputClass} value={eventDate} onChange={(e) => setEventDate(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-bold">משחק קשור<select className={inputClass} value={gameId} onChange={(e) => setGameId(e.target.value)}><option value="">ללא משחק</option>{gameOptions.map((game) => <option key={game.id} value={game.id}>{game.label}</option>)}</select></label>
      </div>
      <label className="mt-3 grid gap-1"><span className="flex justify-between text-sm font-bold">כותרת <Count value={titleHe} max={160} /></span><input required maxLength={160} className={inputClass} value={titleHe} onChange={(e) => setTitleHe(e.target.value)} /></label>
      <label className="mt-3 grid gap-1"><span className="flex justify-between text-sm font-bold">תיאור <Count value={bodyHe} max={2000} /></span><textarea required maxLength={2000} rows={4} className={inputClass} value={bodyHe} onChange={(e) => setBodyHe(e.target.value)} /></label>
      <label className="mt-3 grid gap-1 text-sm font-bold">תמונה<input dir="ltr" type="url" className={inputClass} value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} /></label>
      <div className="mt-3 flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> מפורסם</label><button disabled={busy} className={buttonClass}>שמירה</button>{onMove && <><button type="button" onClick={() => onMove(-1)} className="rounded-full border px-3 py-2 text-sm">למעלה</button><button type="button" onClick={() => onMove(1)} className="rounded-full border px-3 py-2 text-sm">למטה</button></>}{onDelete && <button type="button" onClick={() => void onDelete()} className="rounded-full border border-red-300 px-3 py-2 text-sm font-bold text-red-800">מחיקה</button>}</div>
    </form>
  );
}

function SourceForm({ source, moments, competitions, busy, onSave, onDelete }: {
  source?: SeasonDossierSource; moments: SeasonDossierMoment[]; competitions: SeasonDossierPayload['competitions']; busy: boolean;
  onSave: (body: unknown) => Promise<boolean>; onDelete?: () => Promise<boolean>;
}) {
  const [labelHe, setLabelHe] = useState(source?.labelHe ?? '');
  const [provider, setProvider] = useState(source?.provider ?? '');
  const [url, setUrl] = useState(source?.url ?? '');
  const [scope, setScope] = useState(source?.scope ?? 'EDITORIAL');
  const [competitionId, setCompetitionId] = useState(source?.competitionId ?? '');
  const [momentId, setMomentId] = useState(source?.momentId ?? '');
  const [coverageStatus, setCoverageStatus] = useState(source?.coverageStatus ?? 'UNKNOWN');
  const [coverageFrom, setCoverageFrom] = useState(dateInput(source?.coverageFrom));
  const [coverageTo, setCoverageTo] = useState(dateInput(source?.coverageTo));
  const [verifiedAt, setVerifiedAt] = useState(dateInput(source?.verifiedAt));
  const [noteHe, setNoteHe] = useState(source?.noteHe ?? '');
  return (
    <form onSubmit={async (event) => { event.preventDefault(); const ok = await onSave({ labelHe, provider, url, scope, competitionId, momentId, coverageStatus, coverageFrom, coverageTo, verifiedAt, noteHe }); if (ok && !source) { setLabelHe(''); setUrl(''); setNoteHe(''); } }} className="rounded-2xl border border-stone-200 bg-stone-50 p-4">
      <h3 className="font-black">{source ? 'עריכת מקור' : 'הוספת מקור'}</h3>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1 text-sm font-bold">תווית <Count value={labelHe} max={160} /><input required maxLength={160} className={inputClass} value={labelHe} onChange={(e) => setLabelHe(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-bold">ספק <Count value={provider} max={160} /><input required maxLength={160} className={inputClass} value={provider} onChange={(e) => setProvider(e.target.value)} /></label>
      </div>
      <label className="mt-3 grid gap-1 text-sm font-bold">קישור<input required dir="ltr" type="url" className={inputClass} value={url} onChange={(e) => setUrl(e.target.value)} /></label>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-sm font-bold">שימוש<select className={inputClass} value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}><option value="EDITORIAL">עריכה</option><option value="METRICS">מדדים</option><option value="BOTH">שניהם</option></select></label>
        <label className="grid gap-1 text-sm font-bold">מסגרת<select className={inputClass} value={competitionId} onChange={(e) => setCompetitionId(e.target.value)}><option value="">כל המסגרות</option>{competitions.map((competition) => <option key={competition.id} value={competition.id}>{competition.nameHe}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold">רגע<select className={inputClass} value={momentId} onChange={(e) => setMomentId(e.target.value)}><option value="">כללי</option>{moments.map((moment) => <option key={moment.id} value={moment.id}>{moment.titleHe}</option>)}</select></label>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-4">
        <label className="grid gap-1 text-sm font-bold">כיסוי<select className={inputClass} value={coverageStatus} onChange={(e) => setCoverageStatus(e.target.value as typeof coverageStatus)}><option value="UNKNOWN">לא ידוע</option><option value="PARTIAL">חלקי</option><option value="COMPLETE">מלא</option></select></label>
        <label className="grid gap-1 text-sm font-bold">מתאריך<input type="date" className={inputClass} value={coverageFrom} onChange={(e) => setCoverageFrom(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-bold">עד תאריך<input type="date" className={inputClass} value={coverageTo} onChange={(e) => setCoverageTo(e.target.value)} /></label>
        <label className="grid gap-1 text-sm font-bold">אומת בתאריך<input type="date" className={inputClass} value={verifiedAt} onChange={(e) => setVerifiedAt(e.target.value)} /></label>
      </div>
      <label className="mt-3 grid gap-1"><span className="flex justify-between text-sm font-bold">הערה <Count value={noteHe} max={1000} /></span><textarea maxLength={1000} rows={3} className={inputClass} value={noteHe} onChange={(e) => setNoteHe(e.target.value)} /></label>
      <div className="mt-3 flex gap-2"><button disabled={busy} className={buttonClass}>שמירה</button>{onDelete && <button type="button" onClick={() => void onDelete()} className="rounded-full border border-red-300 px-3 py-2 text-sm font-bold text-red-800">מחיקה</button>}</div>
    </form>
  );
}
