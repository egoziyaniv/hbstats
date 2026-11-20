'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GameLabel } from '@/lib/videos/service';

export interface VideoRow {
  id: string;
  videoId: string;
  title: string;
  channel: string | null;
  publishedAt: string | null;
  durationSec: number | null;
  kind: 'recap' | 'full';
  status: string;
  confidence: string;
  reason: string | null;
  game: GameLabel | null;
}

interface Resolved {
  video: { videoId: string; title: string; channel: string | null; publishedAt: string | null; durationSec: number | null };
  kind: 'recap' | 'full';
  confidence: string;
  why: string;
  candidates: Array<{ gameId: string; points: number; reasons: string[]; game: GameLabel | null }>;
}

const KIND_HE = { recap: 'תקציר', full: 'משחק מלא' } as const;
const STATUS_HE: Record<string, string> = { AUTO: 'שויך אוטומטית', APPROVED: 'אושר', PENDING: 'ממתין' };
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '');
const fmtLen = (s: number | null) => (s == null ? '' : s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);

function GameText({ g }: { g: GameLabel | null }) {
  if (!g) return <span className="text-stone-400">—</span>;
  return (
    <a href={`/games/${g.id}`} target="_blank" className="font-bold text-red-800 hover:underline">
      {fmtDate(g.date)} · {g.homeName} {g.score} {g.awayName}{g.competition ? ` · ${g.competition}` : ''}
    </a>
  );
}

function Thumb({ videoId }: { videoId: string }) {
  return (
    <a href={`https://www.youtube.com/watch?v=${videoId}`} target="_blank" className="block w-32 flex-none overflow-hidden rounded-lg bg-stone-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`} alt="" className="aspect-video w-full object-cover" loading="lazy" />
    </a>
  );
}

export default function VideosAdminClient({ pending, linked }: { pending: VideoRow[]; linked: VideoRow[] }) {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Resolved | null>(null);
  const [kind, setKind] = useState<'recap' | 'full'>('recap');
  const [manualGame, setManualGame] = useState('');
  const [done, setDone] = useState<string | null>(null);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'שגיאה');
    return json;
  }

  async function resolve(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setResolved(null); setDone(null);
    try {
      const r: Resolved = await post('/api/admin/videos/resolve', { url });
      setResolved(r); setKind(r.kind);
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  async function attach(gameId: string) {
    if (!resolved) return;
    setBusy(true); setError(null);
    try {
      const v = resolved.video;
      const r = await post('/api/admin/videos/attach', { videoId: v.videoId, gameId, kind, title: v.title, channel: v.channel, publishedAt: v.publishedAt, durationSec: v.durationSec });
      setDone(r.gameId); setResolved(null); setUrl(''); setManualGame('');
      router.refresh();
    } catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  async function decide(row: VideoRow, action: 'approve' | 'reject', k?: 'recap' | 'full') {
    setBusy(true);
    try { await post(`/api/admin/videos/${row.id}`, { action, kind: k }); router.refresh(); }
    catch (err) { setError((err as Error).message); }
    setBusy(false);
  }

  return (
    <div className="mt-6 space-y-8">
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-stone-900">הוספת סרטון לפי קישור</h2>
        <form onSubmit={resolve} className="mt-3 flex flex-wrap gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" dir="ltr"
            className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
          <button disabled={busy || !url.trim()} className="rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {busy ? 'בודק…' : 'מצא משחק'}
          </button>
        </form>
        {error ? <p className="mt-2 text-sm font-bold text-red-700">{error}</p> : null}
        {done ? <p className="mt-2 text-sm font-bold text-green-700">נוסף. <a className="underline" href={`/games/${done}`} target="_blank">לדף המשחק ←</a></p> : null}

        {resolved ? (
          <div className="mt-4 space-y-3">
            <div className="flex gap-3">
              <Thumb videoId={resolved.video.videoId} />
              <div className="min-w-0 text-sm">
                <div className="font-bold text-stone-900">{resolved.video.title}</div>
                <div className="text-stone-500">{resolved.video.channel} · {fmtDate(resolved.video.publishedAt)} · {fmtLen(resolved.video.durationSec)}</div>
                <div className="mt-1 flex gap-3">
                  {(['recap', 'full'] as const).map((k) => (
                    <label key={k} className="flex items-center gap-1">
                      <input type="radio" checked={kind === k} onChange={() => setKind(k)} /> {KIND_HE[k]}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            {resolved.candidates.length ? (
              <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                {resolved.candidates.map((c, i) => (
                  <li key={c.gameId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <GameText g={c.game} />
                      <div className="text-xs text-stone-500">{i === 0 && resolved.confidence !== 'none' ? 'ההתאמה הטובה ביותר · ' : ''}{c.reasons.join(' + ')}</div>
                    </div>
                    <button disabled={busy} onClick={() => attach(c.gameId)} className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                      שייך למשחק הזה
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-stone-600">לא נמצא משחק מתאים אוטומטית{resolved.why ? ` (${resolved.why})` : ''}.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <input value={manualGame} onChange={(e) => setManualGame(e.target.value)} placeholder="או הדבק קישור לדף המשחק באתר" dir="ltr"
                className="min-w-0 flex-1 rounded-lg border border-stone-300 px-3 py-2 text-sm" />
              <button disabled={busy || !manualGame.trim()} onClick={() => attach(manualGame.trim())} className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-bold disabled:opacity-50">
                שייך
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section>
        <h2 className="text-lg font-black text-stone-900">ממתינים לאישור ({pending.length})</h2>
        {pending.length ? <List rows={pending} busy={busy} onDecide={decide} pendingMode /> : <p className="mt-2 text-sm text-stone-500">אין סרטונים ממתינים.</p>}
      </section>

      <section>
        <h2 className="text-lg font-black text-stone-900">שויכו לאחרונה</h2>
        {linked.length ? <List rows={linked} busy={busy} onDecide={decide} /> : <p className="mt-2 text-sm text-stone-500">עוד לא שויכו סרטונים.</p>}
      </section>
    </div>
  );
}

function List({ rows, busy, onDecide, pendingMode = false }: {
  rows: VideoRow[]; busy: boolean; pendingMode?: boolean;
  onDecide: (row: VideoRow, action: 'approve' | 'reject', kind?: 'recap' | 'full') => void;
}) {
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-wrap gap-3 rounded-xl border border-stone-200 bg-white p-3 text-sm shadow-sm">
          <Thumb videoId={r.videoId} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-stone-900">{r.title}</div>
            <div className="text-xs text-stone-500">
              {r.channel} · {fmtDate(r.publishedAt)} · {fmtLen(r.durationSec)} · {KIND_HE[r.kind]}{pendingMode ? '' : ` · ${STATUS_HE[r.status] ?? r.status}`}
            </div>
            <div className="mt-1"><GameText g={r.game} /></div>
            {r.reason ? <div className="text-xs text-stone-500">{r.reason}</div> : null}
          </div>
          <div className="flex flex-none flex-col gap-1.5">
            {pendingMode ? (
              <>
                <button disabled={busy} onClick={() => onDecide(r, 'approve', 'recap')} className="rounded-lg bg-green-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">אשר כתקציר</button>
                <button disabled={busy} onClick={() => onDecide(r, 'approve', 'full')} className="rounded-lg bg-green-800 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">אשר כמשחק מלא</button>
              </>
            ) : null}
            <button disabled={busy} onClick={() => onDecide(r, 'reject')} className="rounded-lg border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700 disabled:opacity-50">
              {pendingMode ? 'דחה' : 'הסר מהמשחק'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
