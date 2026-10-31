import Link from 'next/link';
import prisma from '@/lib/prisma';
export const dynamic = 'force-dynamic';
export default async function ClubPhotosPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const requested = Number(params.page || 1);
  const page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;
  const where = { id: { startsWith: 'drive-photo-' } };
  const total = await prisma.mediaAsset.count({ where });
  const current = Math.min(page, Math.max(1, Math.ceil(total / 48)));
  const photos = await prisma.mediaAsset.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: (current - 1) * 48, take: 48,
    select: { id: true, filePath: true, title: true, gameId: true, season: { select: { id: true, name: true } } } });
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-8" dir="rtl">
    <header><Link href="/club" className="text-red-800">המועדון</Link><h1 className="mt-3 text-3xl font-black">הפועל באר שבע — תמונות מהיציע ומהמגרש</h1><p className="mt-3">צילום: יניב · {total.toLocaleString('he-IL')} תמונות</p><p className="mt-2 text-sm text-stone-600">תמונות עם זיהוי ודאי מקושרות למשחק. יתר התמונות מוצגות בכלליות, ולפי עונה כאשר זוהתה.</p></header>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{photos.map(photo => <figure key={photo.id} className="overflow-hidden rounded-2xl border bg-white">
      <a href={photo.filePath} target="_blank" rel="noreferrer"><img src={photo.filePath} alt={photo.title || 'הפועל באר שבע'} loading="lazy" className="aspect-[4/3] w-full object-contain bg-stone-100" /></a>
      <figcaption className="space-y-2 p-3 text-sm"><p>{photo.title}</p>{photo.gameId ? <Link className="text-red-800 underline" href={`/games/${photo.gameId}`}>למשחק</Link> : photo.season ? <Link className="text-red-800 underline" href={`/club/seasons/${photo.season.id}`}>עונת {photo.season.name}</Link> : <span>תמונות כלליות</span>}</figcaption>
    </figure>)}</div>
    <nav className="flex items-center justify-between" aria-label="עמודי תמונות">{current > 1 ? <Link href={`?page=${current - 1}`}>הקודם</Link> : <span />}<span>עמוד {current} מתוך {Math.max(1, Math.ceil(total / 48))}</span>{current * 48 < total ? <Link href={`?page=${current + 1}`}>הבא</Link> : <span />}</nav>
  </main>;
}
