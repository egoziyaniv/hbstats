'use client';

import React, { useRef, useState } from 'react';

export default function CalendarSubscription({ url }: { url: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage('הקישור הועתק');
    } catch {
      input.current?.focus();
      input.current?.select();
      setMessage('העתקה אוטומטית אינה זמינה. הקישור סומן להעתקה ידנית.');
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <a className="rounded-xl bg-[var(--accent)] px-5 py-3 font-bold text-white" href={url.replace(/^https:/, 'webcal:')}>הוספה ליומן Apple</a>
        <a className="rounded-xl border border-stone-300 bg-white px-5 py-3 font-bold text-stone-900" href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">הוספה ל־Google Calendar</a>
      </div>
      <div className="space-y-2">
        <label htmlFor="calendar-subscription-url" className="block font-semibold">קישור למינוי ביומן</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input ref={input} id="calendar-subscription-url" value={url} readOnly dir="ltr" className="min-w-0 flex-1 rounded-xl border border-stone-300 bg-white p-3 text-left text-sm text-stone-900" onFocus={(event) => event.currentTarget.select()} />
          <button type="button" onClick={copyUrl} className="rounded-xl border border-stone-300 px-5 py-3 font-semibold">העתקת הקישור</button>
        </div>
        <p role="status" aria-live="polite" className="min-h-6 text-sm text-stone-600">{message}</p>
      </div>
    </div>
  );
}
