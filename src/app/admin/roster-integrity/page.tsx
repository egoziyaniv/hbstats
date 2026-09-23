import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { formatRosterStatus, getRosterStatus } from '@/lib/roster-status';
import AdminPageHeader from '@/components/AdminPageHeader';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ season?: string; status?: string; q?: string }>;

export default async function AdminRosterIntegrityPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminUser();
  const params = await searchParams;
  const seasons = await prisma.season.findMany({ select: { id: true, name: true, year: true }, orderBy: { year: 'desc' } });
  const season = seasons.find((item) => item.id === params.season) ?? seasons[0] ?? null;
  const selectedStatus = params.status || 'all';
  const query = params.q?.trim() || '';
  const players = season ? await prisma.player.findMany({
    where: { team: { seasonId: season.id } },
    select: { id: true, nameHe: true, nameEn: true, additionalInfo: true, team: { select: { nameHe: true, nameEn: true } } },
    orderBy: [{ team: { nameHe: 'asc' } }, { nameHe: 'asc' }],
  }) : [];
  const rows = players.map((player) => ({ ...player, rosterStatus: getRosterStatus(player.additionalInfo) })).filter((player) => player.rosterStatus);
  const counts = { all: rows.length, DEPARTED: rows.filter((p) => p.rosterStatus?.kind === 'DEPARTED').length, SOLD: rows.filter((p) => p.rosterStatus?.kind === 'SOLD').length, LOAN: rows.filter((p) => p.rosterStatus?.kind === 'LOAN').length };
  const filtered = rows.filter((row) => (selectedStatus === 'all' || row.rosterStatus?.kind === selectedStatus) && (!query || [row.nameHe, row.nameEn, row.team.nameHe, row.team.nameEn, row.rosterStatus?.destinationNameHe].filter(Boolean).join(' ').includes(query)));
  const label = (kind: string) => ({ DEPARTED: 'עזבו', SOLD: 'נמכרו', LOAN: 'הושאלו' }[kind] || kind);

  return <main className="min-h-screen bg-[linear-gradient(180deg,#f8f3eb_0%,#efe4d0_100%)] px-4 py-5">
    <div className="mx-auto max-w-7xl">
      <AdminPageHeader eyebrow="כדורגל · איכות נתונים" title="בקרת סגלים והעברות" description="סטטוסים שנקלטו מהעברות בעלות התאמה מאומתת למזהה שחקן ולקבוצת המקור. כאן ניתן לעבור על השינויים לפני ובזמן ניהול הסגל." />
      <form className="mb-4 grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-[180px_1fr_auto]">
        <label className="grid gap-1 text-sm font-bold text-stone-700">עונה<select name="season" defaultValue={season?.id} className="rounded-xl border border-stone-300 px-3 py-2">{seasons.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="grid gap-1 text-sm font-bold text-stone-700">חיפוש שחקן, קבוצה או יעד<input name="q" defaultValue={query} className="rounded-xl border border-stone-300 px-3 py-2" placeholder="לדוגמה: באר שבע" /></label>
        <button className="self-end rounded-xl bg-stone-900 px-5 py-2 font-black text-white">סינון</button>
      </form>
      <section className="mb-4 grid gap-3 sm:grid-cols-4">{Object.entries(counts).map(([kind, count]) => <Link key={kind} href={`/admin/roster-integrity?season=${season?.id ?? ''}&status=${kind}${query ? `&q=${encodeURIComponent(query)}` : ''}`} className={`rounded-2xl border p-4 shadow-sm ${selectedStatus === kind ? 'border-red-500 bg-red-50' : 'border-stone-200 bg-white'}`}><strong className="block text-3xl font-black text-stone-900">{count}</strong><span className="text-sm font-bold text-stone-600">{kind === 'all' ? 'כל שינויי הסגל' : label(kind)}</span></Link>)}</section>
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"><div className="border-b border-stone-100 px-4 py-3"><h2 className="font-black text-stone-900">{filtered.length} רשומות לתצוגה</h2><p className="mt-1 text-xs text-stone-500">המקור נשמר ברשומת ההעברה; סטטוס מאומת מוצג בדף הקבוצה ובדף השחקן.</p></div>{filtered.length ? <div className="overflow-x-auto"><table className="min-w-full text-right text-sm"><thead className="bg-stone-50 text-xs text-stone-600"><tr><th className="px-4 py-3">שחקן</th><th className="px-4 py-3">קבוצת מקור</th><th className="px-4 py-3">סטטוס</th><th className="px-4 py-3">יעד</th><th className="px-4 py-3">תאריך</th></tr></thead><tbody className="divide-y divide-stone-100">{filtered.map((row) => <tr key={row.id}><td className="px-4 py-3 font-bold text-stone-900"><Link className="hover:text-red-700 hover:underline" href={`/players/${row.id}`}>{row.nameHe || row.nameEn}</Link></td><td className="px-4 py-3 text-stone-700">{row.team.nameHe || row.team.nameEn}</td><td className="px-4 py-3"><span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-black text-stone-700">{formatRosterStatus(row.rosterStatus)}</span></td><td className="px-4 py-3 text-stone-700">{row.rosterStatus?.destinationNameHe || '—'}</td><td className="px-4 py-3 text-stone-700" dir="ltr">{row.rosterStatus?.effectiveDate || '—'}</td></tr>)}</tbody></table></div> : <p className="p-6 text-sm text-stone-600">לא נמצאו רשומות מתאימות.</p>}</section>
    </div>
  </main>;
}
