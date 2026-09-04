'use client';

import { useState } from 'react';
import type { SongType } from '@prisma/client';
import { SONG_TYPE_HE } from '@/lib/song-display';

type PlayerOption = { id: string; nameHe: string | null };

type SongRow = {
  id: string;
  slug: string;
  type: SongType;
  titleHe: string;
  lyricsHe: string | null;
  chordsHe: string | null;
  originalMelody: string | null;
  originalMelodyUrl: string | null;
  performerGroup: string | null;
  debutSeasonYear: number | null;
  videoUrls: string[];
  playerId: string | null;
  contentWarning: boolean;
  isPublished: boolean;
  displayOrder: number;
  player?: { id: string; nameHe: string | null } | null;
};

type FormState = {
  id: string | null;
  type: SongType;
  titleHe: string;
  lyricsHe: string;
  chordsHe: string;
  originalMelody: string;
  originalMelodyUrl: string;
  performerGroup: string;
  debutSeasonYear: string;
  videoUrls: string;
  playerId: string;
  contentWarning: boolean;
  isPublished: boolean;
  displayOrder: string;
};

const TYPE_ENTRIES = Object.entries(SONG_TYPE_HE) as Array<[SongType, string]>;

const EMPTY: FormState = {
  id: null,
  type: 'STAND' as SongType,
  titleHe: '',
  lyricsHe: '',
  chordsHe: '',
  originalMelody: '',
  originalMelodyUrl: '',
  performerGroup: '',
  debutSeasonYear: '',
  videoUrls: '',
  playerId: '',
  contentWarning: false,
  isPublished: true,
  displayOrder: '0',
};

const inputClass =
  'w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-900 focus:border-stone-400 focus:outline-none';
const labelClass = 'text-sm font-bold text-stone-700';

export default function SongsAdminClient({
  initialSongs,
  players,
}: {
  initialSongs: SongRow[];
  players: PlayerOption[];
}) {
  const [songs, setSongs] = useState<SongRow[]>(initialSongs);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function refetch() {
    const res = await fetch('/api/admin/songs', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setSongs(data.songs || []);
    }
  }

  function startNew() {
    setForm(EMPTY);
    setMessage('');
  }

  function edit(song: SongRow) {
    setForm({
      id: song.id,
      type: song.type,
      titleHe: song.titleHe,
      lyricsHe: song.lyricsHe || '',
      chordsHe: song.chordsHe || '',
      originalMelody: song.originalMelody || '',
      originalMelodyUrl: song.originalMelodyUrl || '',
      performerGroup: song.performerGroup || '',
      debutSeasonYear: song.debutSeasonYear != null ? String(song.debutSeasonYear) : '',
      videoUrls: (song.videoUrls || []).join('\n'),
      playerId: song.playerId || '',
      contentWarning: song.contentWarning,
      isPublished: song.isPublished,
      displayOrder: String(song.displayOrder ?? 0),
    });
    setMessage('');
  }

  async function save() {
    if (!form.titleHe.trim()) {
      setMessage('יש להזין כותרת לשיר');
      return;
    }
    setSaving(true);
    setMessage('');

    const payload = {
      type: form.type,
      titleHe: form.titleHe.trim(),
      lyricsHe: form.lyricsHe,
      chordsHe: form.chordsHe,
      originalMelody: form.originalMelody,
      originalMelodyUrl: form.originalMelodyUrl,
      performerGroup: form.performerGroup,
      debutSeasonYear: form.debutSeasonYear.trim() ? Number(form.debutSeasonYear) : null,
      videoUrls: form.videoUrls
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      playerId: form.playerId || null,
      contentWarning: form.contentWarning,
      isPublished: form.isPublished,
      displayOrder: form.displayOrder.trim() ? Number(form.displayOrder) : 0,
    };

    const url = form.id ? `/api/admin/songs/${form.id}` : '/api/admin/songs';
    const method = form.id ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || 'שגיאה בשמירה');
        setSaving(false);
        return;
      }
      await refetch();
      setForm(EMPTY);
      setMessage('נשמר בהצלחה');
    } catch {
      setMessage('שגיאת תקשורת');
    }
    setSaving(false);
  }

  async function remove(song: SongRow) {
    if (!window.confirm(`למחוק את "${song.titleHe}"?`)) return;
    setMessage('');
    try {
      const res = await fetch(`/api/admin/songs/${song.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setMessage('שגיאה במחיקה');
        return;
      }
      if (form.id === song.id) setForm(EMPTY);
      await refetch();
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  return (
    <div dir="rtl" className="grid gap-6 lg:grid-cols-[0.9fr_1.3fr]">
      {/* Songs list */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">שירים ({songs.length})</h2>
          <button
            type="button"
            onClick={startNew}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
          >
            חדש
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {songs.length === 0 ? (
            <p className="text-sm text-stone-500">עדיין אין שירים. הוסף שיר חדש מהטופס.</p>
          ) : (
            songs.map((song) => (
              <div
                key={song.id}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                  form.id === song.id ? 'border-[var(--accent)]/50 bg-red-50/40' : 'border-stone-200 bg-stone-50'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${song.isPublished ? 'bg-green-500' : 'bg-stone-300'}`}
                      title={song.isPublished ? 'מפורסם' : 'טיוטה'}
                    />
                    <span className="truncate text-sm font-bold text-stone-900">{song.titleHe}</span>
                  </div>
                  <span className="mt-1 inline-block rounded-full bg-stone-200 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                    {SONG_TYPE_HE[song.type]}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => edit(song)}
                    className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700"
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(song)}
                    className="rounded-full border border-red-300 bg-white px-3 py-1.5 text-xs font-bold text-red-700"
                  >
                    מחיקה
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Editor form */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-black text-stone-900">{form.id ? 'עריכת שיר' : 'שיר חדש'}</h2>
          {message ? <span className="text-sm font-semibold text-stone-600">{message}</span> : null}
        </div>

        <div className="mt-4 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>סוג</label>
              <select
                value={form.type}
                onChange={(e) => update('type', e.target.value as SongType)}
                className={`mt-1 ${inputClass}`}
              >
                {TYPE_ENTRIES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>כותרת</label>
              <input
                type="text"
                value={form.titleHe}
                onChange={(e) => update('titleHe', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="שם השיר"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>מילים</label>
            <textarea
              value={form.lyricsHe}
              onChange={(e) => update('lyricsHe', e.target.value)}
              rows={6}
              className={`mt-1 ${inputClass}`}
              placeholder="מילות השיר (שורה לכל שורה)"
            />
          </div>

          <div>
            <label className={labelClass}>אקורדים</label>
            <textarea
              value={form.chordsHe}
              onChange={(e) => update('chordsHe', e.target.value)}
              rows={4}
              className={`mt-1 ${inputClass} font-mono`}
              placeholder="אקורדים (אופציונלי)"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>שיר מקור</label>
              <input
                type="text"
                value={form.originalMelody}
                onChange={(e) => update('originalMelody', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="שם שיר המקור"
              />
            </div>
            <div>
              <label className={labelClass}>קישור לשיר מקור</label>
              <input
                type="text"
                value={form.originalMelodyUrl}
                onChange={(e) => update('originalMelodyUrl', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>ארגון / מבצע</label>
              <input
                type="text"
                value={form.performerGroup}
                onChange={(e) => update('performerGroup', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="שם הארגון"
              />
            </div>
            <div>
              <label className={labelClass}>שנת בכורה</label>
              <input
                type="number"
                value={form.debutSeasonYear}
                onChange={(e) => update('debutSeasonYear', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="2020"
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>קישורי וידאו (URL לכל שורה)</label>
            <textarea
              value={form.videoUrls}
              onChange={(e) => update('videoUrls', e.target.value)}
              rows={3}
              className={`mt-1 ${inputClass}`}
              placeholder={'https://youtu.be/...\nhttps://youtube.com/watch?v=...'}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>שחקן משויך</label>
              <select
                value={form.playerId}
                onChange={(e) => update('playerId', e.target.value)}
                className={`mt-1 ${inputClass}`}
              >
                <option value="">— ללא —</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nameHe || p.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>סדר תצוגה</label>
              <input
                type="number"
                value={form.displayOrder}
                onChange={(e) => update('displayOrder', e.target.value)}
                className={`mt-1 ${inputClass}`}
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={form.contentWarning}
                onChange={(e) => update('contentWarning', e.target.checked)}
                className="h-4 w-4"
              />
              אזהרת תוכן
            </label>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={form.isPublished}
                onChange={(e) => update('isPublished', e.target.checked)}
                className="h-4 w-4"
              />
              מפורסם
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {saving ? 'שומר...' : 'שמור'}
            </button>
            <button
              type="button"
              onClick={startNew}
              className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-bold text-stone-700"
            >
              חדש
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
