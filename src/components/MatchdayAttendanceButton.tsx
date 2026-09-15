'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MatchdayAttendanceButton({ gameId, initialAttended, isLoggedIn }: {
  gameId: string;
  initialAttended: boolean;
  isLoggedIn: boolean;
}) {
  const router = useRouter();
  const [attended, setAttended] = useState(initialAttended);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    if (!isLoggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/games/${gameId}`)}`);
      return;
    }
    const next = !attended;
    setSaving(true);
    try {
      const response = await fetch(`/api/account/matchdays/${gameId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attended: next }),
      });
      if (!response.ok) throw new Error('Unable to save attendance');
      setAttended(next);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={saving} className={`rounded-full px-4 py-2 text-sm font-black transition disabled:opacity-60 ${attended ? 'bg-emerald-500 text-emerald-950' : 'border border-white/40 bg-white/10 text-white hover:bg-white/20'}`}>
      {saving ? 'שומר…' : attended ? 'הייתי במשחק ✓' : 'הייתי במשחק'}
    </button>
  );
}
