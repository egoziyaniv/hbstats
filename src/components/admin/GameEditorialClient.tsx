'use client';

import { useState } from 'react';

type GalleryItem = {
  id: string;
  filePath: string;
  title: string | null;
};

type Editorial = {
  recapVideoUrl: string | null;
  fullMatchUrl: string | null;
  reportTitleHe: string | null;
  reportHe: string | null;
  matchFactHe: string | null;
  aiGenerated: boolean;
} | null;

export default function GameEditorialClient({
  gameId,
  homeName,
  awayName,
  initialEditorial,
  initialGallery,
}: {
  gameId: string;
  homeName: string;
  awayName: string;
  initialEditorial: Editorial;
  initialGallery: GalleryItem[];
}) {
  const [recapVideoUrl, setRecapVideoUrl] = useState(initialEditorial?.recapVideoUrl || '');
  const [fullMatchUrl, setFullMatchUrl] = useState(initialEditorial?.fullMatchUrl || '');
  const [reportTitleHe, setReportTitleHe] = useState(initialEditorial?.reportTitleHe || '');
  const [reportHe, setReportHe] = useState(initialEditorial?.reportHe || '');
  const [matchFactHe, setMatchFactHe] = useState(initialEditorial?.matchFactHe || '');
  const [aiGenerated, setAiGenerated] = useState(!!initialEditorial?.aiGenerated);

  const [gallery, setGallery] = useState<GalleryItem[]>(initialGallery);
  const [uploadTitle, setUploadTitle] = useState('');

  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');

  async function generateDraft() {
    setGenerating(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/games/${gameId}/editorial/generate`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.status === 502) {
        setMessage('לא ניתן להפיק טיוטה כרגע. אפשר למלא את התוכן ידנית ולשמור.');
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || 'שגיאה בהפקת הטיוטה');
        return;
      }
      const data = await res.json();
      const draft = data?.draft || {};
      if (draft.reportTitleHe) setReportTitleHe(draft.reportTitleHe);
      if (draft.reportHe) setReportHe(draft.reportHe);
      if (draft.matchFactHe) setMatchFactHe(draft.matchFactHe);
      setAiGenerated(true);
      setMessage('טיוטה נוצרה. אפשר לערוך ולשמור.');
    } catch {
      setMessage('שגיאת תקשורת');
    } finally {
      setGenerating(false);
    }
  }

  async function save() {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/games/${gameId}/editorial`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recapVideoUrl: recapVideoUrl.trim(),
          fullMatchUrl: fullMatchUrl.trim(),
          reportTitleHe: reportTitleHe.trim(),
          reportHe: reportHe.trim(),
          matchFactHe: matchFactHe.trim(),
          aiGenerated,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || 'שגיאה בשמירה');
        return;
      }
      setMessage('התוכן נשמר בהצלחה.');
    } catch {
      setMessage('שגיאת תקשורת');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.append('entityType', 'game');
      formData.append('entityId', gameId);
      formData.append('title', uploadTitle.trim());
      formData.append('file', file);
      const res = await fetch('/api/media', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setMessage(data?.error || 'שגיאה בהעלאת התמונה');
        return;
      }
      const data = await res.json();
      setGallery((current) => [
        ...current,
        { id: data.asset.id, filePath: data.filePath, title: data.asset.title ?? null },
      ]);
      setUploadTitle('');
      setMessage('התמונה הועלתה.');
    } catch {
      setMessage('שגיאת תקשורת');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function deletePhoto(id: string) {
    setMessage('');
    try {
      const res = await fetch(`/api/media?id=${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        setMessage('שגיאה במחיקת התמונה');
        return;
      }
      setGallery((current) => current.filter((photo) => photo.id !== id));
    } catch {
      setMessage('שגיאת תקשורת');
    }
  }

  const inputClass =
    'w-full rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm text-stone-800 focus:border-stone-400 focus:outline-none';
  const labelClass = 'text-sm font-black text-stone-900';

  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-stone-900">תוכן עריכה</h2>
            <p className="mt-1 text-sm text-stone-600">
              {homeName} נגד {awayName}
            </p>
          </div>
          <button
            type="button"
            onClick={generateDraft}
            disabled={generating}
            className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {generating ? (
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.3" strokeWidth="4" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="m12 3 1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4Z" />
                <path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8Z" />
              </svg>
            )}
            {generating ? 'מפיק טיוטה...' : 'הפק טיוטה עם AI'}
          </button>
        </div>

        <div className="mt-5 grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2">
              <span className={labelClass}>קישור לתקציר וידאו</span>
              <input
                type="url"
                dir="ltr"
                value={recapVideoUrl}
                onChange={(e) => setRecapVideoUrl(e.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                className={inputClass}
              />
            </label>
            <label className="grid gap-2">
              <span className={labelClass}>קישור למשחק המלא</span>
              <input
                type="url"
                dir="ltr"
                value={fullMatchUrl}
                onChange={(e) => setFullMatchUrl(e.target.value)}
                placeholder="https://..."
                className={inputClass}
              />
            </label>
          </div>

          <label className="grid gap-2">
            <span className={labelClass}>פקט מהמשחק</span>
            <input
              type="text"
              value={matchFactHe}
              onChange={(e) => setMatchFactHe(e.target.value)}
              placeholder="עובדה מעניינת אחת מהמשחק"
              className={inputClass}
            />
          </label>

          <label className="grid gap-2">
            <span className={labelClass}>כותרת הכתבה</span>
            <input
              type="text"
              value={reportTitleHe}
              onChange={(e) => setReportTitleHe(e.target.value)}
              placeholder="כותרת סיכום המשחק"
              className={inputClass}
            />
          </label>

          <label className="grid gap-2">
            <span className={labelClass}>גוף הכתבה</span>
            <textarea
              value={reportHe}
              onChange={(e) => setReportHe(e.target.value)}
              rows={10}
              placeholder="סיכום המשחק..."
              className={`${inputClass} leading-loose`}
            />
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-stone-600">
            <input
              type="checkbox"
              checked={aiGenerated}
              onChange={(e) => setAiGenerated(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300"
            />
            סומן כתוכן שנוצר בעזרת AI
          </label>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving ? 'שומר...' : 'שמור'}
          </button>
          {message ? <span className="text-sm font-semibold text-stone-600">{message}</span> : null}
        </div>
      </section>

      <section className="rounded-[28px] border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-xl font-black text-stone-900">גלריית תמונות</h2>
        <p className="mt-1 text-sm text-stone-600">העלה תמונות למשחק (עד 5MB, פורמט PNG / JPEG / WebP / GIF).</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            type="text"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
            placeholder="כותרת לתמונה (רשות)"
            className={inputClass}
          />
          <label
            className={`inline-flex cursor-pointer items-center justify-center rounded-full bg-stone-900 px-5 py-3 text-sm font-bold text-white ${
              uploading ? 'opacity-60' : ''
            }`}
          >
            {uploading ? 'מעלה...' : 'העלאת תמונה'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={handleUpload}
              disabled={uploading}
              className="hidden"
            />
          </label>
        </div>

        {gallery.length > 0 ? (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.filePath} alt={photo.title || 'תמונת משחק'} className="h-36 w-full object-cover" />
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="truncate text-xs font-semibold text-stone-500">{photo.title || 'ללא כותרת'}</span>
                  <button
                    type="button"
                    onClick={() => deletePhoto(photo.id)}
                    className="flex-none rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-bold text-red-700"
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-sm text-stone-500">
            עדיין אין תמונות למשחק הזה.
          </p>
        )}
      </section>
    </div>
  );
}
