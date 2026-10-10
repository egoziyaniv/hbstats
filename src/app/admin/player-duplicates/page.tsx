import Link from 'next/link';
import { requireAdminUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import AdminPageHeader from '@/components/AdminPageHeader';
import { buildDuplicateCandidates, playerSourceIds } from '@/lib/player-duplicate-candidates';
import PlayerManualMergeDialog, { type MergeDialogPlayer } from '@/components/PlayerManualMergeDialog';
import PlayerFamilyLinkDialog, { type FamilyLinkPlayer } from '@/components/PlayerFamilyLinkDialog';
import { canRepairFamilyLink, canonicalFamilyId } from '@/lib/canonical-player-family';

export const dynamic = 'force-dynamic';
const labels: Record<string, string> = { API_FOOTBALL_ID: 'מזהה API-Football', SOFASCORE_ID: 'מזהה SofaScore', FLASHSCORE_ID: 'מזהה Flashscore', NAME: 'שם זהה או בסדר הפוך', FULL_NAME_AND_BIRTH_DATE: 'שם מלא ותאריך לידה', BIRTH_DATE: 'תאריך לידה' };

export default async function PlayerDuplicatesPage({ searchParams }: { searchParams: Promise<{ season?: string; q?: string }> }) {
  await requireAdminUser();
  const params = await searchParams;
  const seasons = await prisma.season.findMany({ select: { id: true, name: true }, orderBy: { year: 'desc' } });
  const season = seasons.find(s => s.id === params.season) || seasons[0];
  const players = season ? await prisma.player.findMany({ where: { team: { seasonId: season.id } }, select: {
    id: true, teamId: true, nameHe: true, nameEn: true, updatedAt: true, birthDate: true, position: true, nationalityEn: true, nationalityHe: true, photoUrl: true, firstNameEn: true, firstNameHe: true, lastNameEn: true, lastNameHe: true, apiFootballId: true, canonicalPlayerId: true, additionalInfo: true,
    team: { select: { nameHe: true, nameEn: true } }, _count: { select: { events: true, lineupEntries: true } },
  } }) : [];
  const byId = new Map(players.map(p => [p.id, p]));
  const candidates = buildDuplicateCandidates(players);
  const query = params.q?.trim().toLowerCase() || '';
  const rows = candidates.filter(c => !query || [byId.get(c.leftPlayerId), byId.get(c.rightPlayerId)].some(p => p && [p.nameHe, p.nameEn, p.team.nameHe, p.team.nameEn].join(' ').toLowerCase().includes(query)));
  const renderPlayer = (id: string) => {
    const p = byId.get(id)!;
    return <div className="space-y-1"><Link href={`/players/${p.id}`} className="font-bold text-red-800 hover:underline">{p.nameHe || p.nameEn}</Link><div className="text-xs text-stone-600">{p.nameEn} · {p.team.nameHe || p.team.nameEn}</div><div className="text-xs">לידה: {p.birthDate?.toISOString().slice(0, 10) || 'לא ידוע'} · {p._count.events} אירועים · {p._count.lineupEntries} רשומות הרכב</div><div className="text-xs text-stone-500" dir="ltr">{Object.entries(playerSourceIds(p)).filter(([, value]) => value).map(([key, value]) => `${labels[key]}: ${value}`).join(' · ') || 'ללא מזהה ספק'}</div><div className="text-xs text-stone-500">משפחה: <Link href={`/players/${p.canonicalPlayerId || p.id}`} className="underline">{p.canonicalPlayerId || p.id}</Link></div></div>;
  };
  const mergePlayer = (id: string): MergeDialogPlayer => {
    const player = byId.get(id)!;
    return {
      id: player.id, nameHe: player.nameHe, nameEn: player.nameEn, updatedAt: player.updatedAt.toISOString(), birthDate: player.birthDate?.toISOString().slice(0, 10) || null,
      position: player.position, nationalityEn: player.nationalityEn, nationalityHe: player.nationalityHe, photoUrl: player.photoUrl,
      firstNameEn: player.firstNameEn, firstNameHe: player.firstNameHe, lastNameEn: player.lastNameEn, lastNameHe: player.lastNameHe,
      events: player._count.events, lineups: player._count.lineupEntries,
    };
  };
  const linkPlayer = (id: string): FamilyLinkPlayer => {
    const player = byId.get(id)!;
    return { id: player.id, nameHe: player.nameHe, nameEn: player.nameEn, updatedAt: player.updatedAt.toISOString() };
  };
  const actionFor = (candidate: typeof candidates[number]) => {
    const left = byId.get(candidate.leftPlayerId)!;
    const right = byId.get(candidate.rightPlayerId)!;
    const leftRoot = byId.get(canonicalFamilyId(left)) || left;
    const rightRoot = byId.get(canonicalFamilyId(right)) || right;
    if (canRepairFamilyLink(left, rightRoot)) return <PlayerFamilyLinkDialog source={linkPlayer(left.id)} target={linkPlayer(rightRoot.id)} />;
    if (canRepairFamilyLink(right, leftRoot)) return <PlayerFamilyLinkDialog source={linkPlayer(right.id)} target={linkPlayer(leftRoot.id)} />;
    if (!left.canonicalPlayerId && !right.canonicalPlayerId && left.teamId === right.teamId) return <PlayerManualMergeDialog left={mergePlayer(left.id)} right={mergePlayer(right.id)} />;
    return <span className="text-xs text-stone-500">אין פעולה אוטומטית לזוג זה.</span>;
  };
  return <main className="min-h-screen bg-stone-50 px-4 py-5"><div className="mx-auto max-w-7xl">
    <AdminPageHeader eyebrow="כדורגל · איכות נתונים" title="מועמדים לכפילויות שחקנים" description="השוואת הרשומות השמורות בעונה הנבחרת לפי זהויות ספק, שמות ותאריכי לידה. רשומות מאותה משפחת שחקן אינן מוצגות ככפילות." />
    <form className="mb-4 flex flex-wrap items-end gap-3 rounded-2xl border bg-white p-4">
      <label className="grid gap-1 text-sm">עונה<select name="season" defaultValue={season?.id} className="rounded border p-2">{seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="grid gap-1 text-sm">שחקן או קבוצה<input name="q" defaultValue={params.q} className="rounded border p-2" /></label>
      <button className="rounded bg-stone-900 px-4 py-2 text-white">סינון</button>
      <Link href={`/admin/roster-integrity?season=${season?.id || ''}`} className="p-2 text-sm underline">חזרה לבקרת סגלים</Link>
    </form>
    <p className="mb-4 text-sm text-stone-600">נבדקו {players.length} רשומות; נמצאו {candidates.length} זוגות משפחות לבדיקה. מוצגים {rows.length}. התאמה חזקה אינה אישור למיזוג. לא בוצע מיזוג אוטומטי.</p>
    <p className="mb-4 text-xs text-stone-500">מזהי API-Football, SofaScore ו־Flashscore מוצגים כאשר הם שמורים ברשומה. הדוח אינו מבצע סריקה חדשה של אתרי המקור, והספירות הן לרשומת השחקן בעונה זו.</p>
    <div className="overflow-x-auto rounded-2xl border bg-white"><table className="min-w-full text-right text-sm"><thead className="bg-stone-100"><tr><th className="p-4">רשומה ראשונה</th><th className="p-4">רשומה שנייה</th><th className="p-4">ראיות לבדיקה</th><th className="p-4">פעולה</th></tr></thead><tbody>{rows.map(c => <tr key={`${c.leftFamilyId}:${c.rightFamilyId}`} className="border-t align-top"><td className="p-4">{renderPlayer(c.leftPlayerId)}</td><td className="p-4">{renderPlayer(c.rightPlayerId)}</td><td className="p-4"><strong>{c.confidence === 'VERIFIED' ? 'התאמה חזקה' : 'נדרשת בדיקה'}</strong><p>{c.reasons.map(r => labels[r]).join(' · ')}</p>{c.conflicts.length > 0 && <p className="mt-2 font-bold text-red-700">סתירה: {c.conflicts.map(r => labels[r]).join(' · ')}</p>}</td><td className="p-4">{actionFor(c)}</td></tr>)}</tbody></table>{!rows.length && <p className="p-6">לא נמצאו מועמדים בחתך שנבחר.</p>}</div>
  </div></main>;
}
