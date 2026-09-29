'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export type FamilyLinkPlayer = { id: string; nameHe: string; nameEn: string; updatedAt: string };

export default function PlayerFamilyLinkDialog({ source, target }: { source: FamilyLinkPlayer; target: FamilyLinkPlayer }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [linkId, setLinkId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const request = async (body: Record<string, unknown>) => {
    setSaving(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/player-duplicates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'שמירת הפעולה נכשלה');
      return result as { linkId?: string };
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'שמירת הפעולה נכשלה');
      return null;
    } finally { setSaving(false); }
  };
  const link = async () => {
    const result = await request({ action: 'link', sourceId: source.id, targetRootId: target.id, expectedSourceUpdatedAt: source.updatedAt, expectedTargetUpdatedAt: target.updatedAt });
    if (!result?.linkId) return;
    setLinkId(result.linkId);
    setMessage('הרשומה קושרה למשפחת השחקן. אפשר לבטל לפני רענון הדף.');
  };
  const undo = async () => {
    if (!linkId) return;
    const result = await request({ action: 'undo-link', linkId });
    if (!result) return;
    setLinkId(null);
    setMessage('הקישור בוטל.');
    startTransition(() => router.refresh());
  };
  return <details className="mt-3 min-w-[300px] rounded-xl border border-stone-200 bg-stone-50 p-3 text-right">
    <summary className="cursor-pointer font-black text-red-800">קישור למשפחה קיימת</summary>
    <div className="mt-3 space-y-3 text-xs text-stone-700">
      <p>הרשומה <strong>{source.nameHe || source.nameEn}</strong> תקושר לשחקן הקנוני <strong>{target.nameHe || target.nameEn}</strong>.</p>
      <p className="rounded bg-white p-2">לא יועתקו שדות, לא יועברו משחקים ולא יימחקו נתונים.</p>
      {!linkId && <button type="button" disabled={saving || refreshing} className="rounded bg-red-700 px-3 py-2 font-bold text-white disabled:opacity-60" onClick={link}>קישור לרשומת שחקן קיימת</button>}
      {linkId && <button type="button" disabled={saving || refreshing} className="rounded border border-stone-400 px-3 py-2 font-bold disabled:opacity-60" onClick={undo}>ביטול הקישור</button>}
    </div>
    <p role="status" className="mt-2 text-xs text-stone-600">{saving || refreshing ? 'שומר…' : message}</p>
  </details>;
}
