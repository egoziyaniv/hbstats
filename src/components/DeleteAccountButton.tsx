'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DeleteAccountButton() {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/account', { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || 'מחיקת החשבון נכשלה.');
        setBusy(false);
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('מחיקת החשבון נכשלה.');
      setBusy(false);
    }
  }

  return (
    <div className="mt-10 rounded-2xl border border-red-200 bg-red-50 p-5">
      <h2 className="text-lg font-black text-red-700">מחיקת חשבון</h2>
      <p className="mt-2 text-sm leading-6 text-red-700/80">
        מחיקת החשבון תסיר לצמיתות את המשתמש שלך ואת כל ההעדפות. הפעולה אינה הפיכה.
      </p>
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
        >
          מחיקת החשבון שלי
        </button>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? 'מוחק…' : 'אישור מחיקה סופית'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-bold text-stone-700"
          >
            ביטול
          </button>
        </div>
      )}
    </div>
  );
}
