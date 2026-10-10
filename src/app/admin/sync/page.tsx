import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const fetchLabels: Record<string, string> = { PENDING: 'ממתין', RUNNING: 'רץ', COMPLETED: 'הושלם', FAILED: 'נכשל' };
const mergeLabels: Record<string, string> = { preview: 'תצוגה מקדימה', approved: 'מאושר', executed: 'בוצע', rolled_back: 'בוטל', failed: 'נכשל' };

export default async function AdminSyncPage() {
  await requireAdminUser();
  const [fetchJobs, scrapeJobs, mergeOps] = await Promise.all([
    prisma.fetchJob.findMany({ include: { initiatedBy: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.scrapeJob.findMany({ orderBy: { createdAt: 'desc' }, take: 12 }),
    prisma.mergeOperation.findMany({ include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const failed = fetchJobs.filter((job) => job.status === 'FAILED').length + scrapeJobs.filter((job) => job.status === 'failed').length + mergeOps.filter((job) => job.status === 'failed').length;
  const active = fetchJobs.filter((job) => job.status === 'RUNNING' || job.status === 'PENDING').length + scrapeJobs.filter((job) => ['pending', 'running'].includes(job.status)).length;
  const format = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

  return <main className="mx-auto max-w-7xl space-y-4 px-4 py-5">
    <header className="rounded-2xl bg-[linear-gradient(135deg,#0f172a,#1e3a5f)] px-5 py-4 text-white shadow-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-xs font-bold text-sky-200">מקורות וסנכרון</p><h1 className="mt-1 text-2xl font-black">מרכז תפעול נתונים</h1></div><p className="max-w-2xl text-sm text-slate-200">סטטוס משיכות, סריקות ומיזוגים; פעולות הרצה נשארות במסכים הייעודיים.</p></div></header>
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><strong className="block text-3xl font-black text-amber-950">{active}</strong><span className="text-sm font-bold text-amber-800">תהליכים ממתינים או רצים</span></div><div className="rounded-2xl border border-rose-200 bg-rose-50 p-4"><strong className="block text-3xl font-black text-rose-950">{failed}</strong><span className="text-sm font-bold text-rose-800">תהליכים שנכשלו ברשימה</span></div><div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"><strong className="block text-3xl font-black text-emerald-950">{fetchJobs.filter((job) => job.status === 'COMPLETED').length}</strong><span className="text-sm font-bold text-emerald-800">משיכות שהושלמו לאחרונה</span></div></section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[{ href: '/admin/matchday', label: 'עדכון יום משחקים', note: 'נתונים חיים למשחק ספציפי' }, { href: '/admin/setup', label: 'ייבוא מלא', note: 'סריקה ומיזוג היסטוריים' }, { href: '/admin/scrape', label: 'סריקות חיצוניות', note: 'IFA, Walla, Sport5 ו-RSSSF' }, { href: '/admin/merge', label: 'מיזוג נתונים', note: 'Preview, אישור ו-rollback' }, { href: '/admin/flashscore', label: 'Flashscore', note: 'משחקים, אירועים ו-xG' }, { href: '/admin/sofascore', label: 'Sofascore', note: 'ציונים וסטטיסטיקות' }].map((action) => <Link key={action.href} href={action.href} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-sky-400 hover:shadow-md"><strong className="block text-stone-900">{action.label}</strong><span className="mt-1 block text-sm text-stone-500">{action.note}</span></Link>)}</section>
    <section className="grid gap-3 xl:grid-cols-3">
      <SyncList title="משיכות API אחרונות" rows={fetchJobs.map((job) => ({ id: job.id, title: job.labelHe, status: fetchLabels[job.status] || job.status, failed: job.status === 'FAILED', detail: `${job.progressPercent}% · ${job.initiatedBy?.name || 'מערכת'}`, time: format.format(job.updatedAt) }))} />
      <SyncList title="סריקות אחרונות" rows={scrapeJobs.map((job) => ({ id: job.id, title: `${job.source} · ${job.targetType}`, status: job.status, failed: job.status === 'failed', detail: `${job.matchesScraped} משחקים · ${job.errorsCount} שגיאות`, time: format.format(job.createdAt) }))} />
      <SyncList title="מיזוגים אחרונים" rows={mergeOps.map((job) => ({ id: job.id, title: `${job.source} · ${job.mergeType}`, status: mergeLabels[job.status] || job.status, failed: job.status === 'failed', detail: `${job.recordsCreated} נוצרו · ${job.recordsUpdated} עודכנו`, time: format.format(job.createdAt) }))} />
    </section>
  </main>;
}

function SyncList({ title, rows }: { title: string; rows: Array<{ id: string; title: string; status: string; failed: boolean; detail: string; time: string }> }) {
  return <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"><h2 className="text-base font-black text-stone-900">{title}</h2>{rows.length ? <ol className="mt-2 divide-y divide-stone-100">{rows.map((row) => <li key={row.id} className="py-2"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-stone-800">{row.title}</strong><span className={`rounded-full px-2 py-1 text-xs font-bold ${row.failed ? 'bg-rose-100 text-rose-800' : 'bg-stone-100 text-stone-700'}`}>{row.status}</span></div><p className="mt-1 text-xs text-stone-500">{row.detail} · {row.time}</p></li>)}</ol> : <p className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-600">אין פעילות אחרונה.</p>}</section>;
}
