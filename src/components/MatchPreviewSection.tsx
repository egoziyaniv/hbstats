import Link from 'next/link';
import type { MatchPreview, FormItem, SidelinedItem } from '@/lib/match-preview';

function FormDots({ items }: { items: FormItem[] }) {
  if (!items.length) return <span className="text-xs text-stone-400">אין נתונים</span>;
  const color = (r: FormItem['result']) =>
    r === 'W' ? 'bg-emerald-500' : r === 'D' ? 'bg-stone-400' : 'bg-red-500';
  const letter = (r: FormItem['result']) => (r === 'W' ? 'נ' : r === 'D' ? 'ת' : 'ה');
  // Oldest → newest reads right-to-left in RTL, so reverse to show newest first at the right.
  return (
    <div className="flex flex-row-reverse items-center gap-1">
      {items.map((f) => (
        <Link
          key={f.gameId}
          href={`/games/${f.gameId}`}
          title={`${f.opponentHe} ${f.scoreHe}`}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white ${color(f.result)}`}
        >
          {letter(f.result)}
        </Link>
      ))}
    </div>
  );
}

function SidelinedList({ items }: { items: SidelinedItem[] }) {
  if (!items.length) return <div className="text-xs text-stone-400">אין נפקדים ידועים</div>;
  return (
    <ul className="space-y-1">
      {items.map((s, i) => (
        <li key={i} className="flex items-center gap-2 text-sm">
          <span className="text-sm">{s.kind === 'suspension' ? '🟥' : '🩹'}</span>
          <span className="font-semibold text-stone-800">{s.nameHe}</span>
          <span className="text-[11px] text-stone-500">· {s.typeHe}</span>
        </li>
      ))}
    </ul>
  );
}

function TeamColumn({ name, form, out }: { name: string; form: FormItem[]; out: SidelinedItem[] }) {
  return (
    <div className="rounded-[20px] border border-stone-200 bg-stone-50/70 p-4">
      <div className="mb-3 text-center text-sm font-black text-stone-900">{name}</div>
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">כושר אחרון</div>
      <FormDots items={form} />
      <div className="mt-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">נפקדים</div>
      <SidelinedList items={out} />
    </div>
  );
}

export function MatchPreviewSection({
  preview,
  homeName,
  awayName,
}: {
  preview: MatchPreview;
  homeName: string;
  awayName: string;
}) {
  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm" dir="rtl">
      <div className="mb-4 flex items-center gap-2">
        <span className="h-5 w-1 rounded bg-[var(--accent,#dc2626)]" />
        <h2 className="text-lg font-black text-stone-900">לקראת המשחק</h2>
      </div>
      {preview.aiSummary ? (
        <p className="mb-5 rounded-[18px] bg-amber-50 px-4 py-3 text-sm leading-6 text-stone-700">
          {preview.aiSummary}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TeamColumn name={homeName} form={preview.form.home} out={preview.sidelined.home} />
        <TeamColumn name={awayName} form={preview.form.away} out={preview.sidelined.away} />
      </div>
    </section>
  );
}
