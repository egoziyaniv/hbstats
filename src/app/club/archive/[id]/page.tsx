import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { ARCHIVE_TYPES } from '@/lib/fan-archive';
export const dynamic = 'force-dynamic';
export default async function FanArchiveDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const item = await prisma.fanArchiveItem.findFirst({ where: { id, status: 'PUBLISHED', permissionGranted: true }, include: { season: { select: { name: true } }, player: { select: { nameHe: true, nameEn: true } }, venue: { select: { nameHe: true, nameEn: true } } } });
  if (!item) notFound();
  return <main dir="rtl" className="mx-auto max-w-3xl space-y-5 px-4 py-8"><Link href="/club/archive" className="font-bold text-red-800">חזרה לארכיון האוהדים</Link><article className="space-y-5 rounded-3xl border bg-white p-6"><p className="text-sm text-red-800">{ARCHIVE_TYPES[item.type]}{item.eventDate ? ` · ${item.eventDate.toLocaleDateString('he-IL', { timeZone: 'UTC' })}` : ''}</p><h1 className="text-3xl font-black">{item.titleHe}</h1><p className="text-sm text-stone-500">באדיבות {item.creditHe}</p>
    {item.imageUrl && <a href={item.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-block font-bold text-red-800 underline">פתיחת התמונה במקור החיצוני</a>}
    <p className="whitespace-pre-wrap break-words leading-8">{item.bodyHe}</p>
    {item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-red-800 underline">מקור הפריט</a>}
    <div className="flex flex-wrap gap-3 text-sm font-bold text-red-800">{item.gameId && <Link href={`/games/${item.gameId}`}>למשחק המקושר</Link>}{item.seasonId && <Link href={`/games?season=${item.seasonId}`}>משחקי עונת {item.season?.name}</Link>}{item.playerId && <Link href={`/players/${item.playerId}`}>{item.player?.nameHe || item.player?.nameEn}</Link>}{item.venueId && <Link href={`/venues/${item.venueId}`}>{item.venue?.nameHe || item.venue?.nameEn}</Link>}</div>
    <p className="border-t pt-4 text-xs text-stone-500">פריט מארכיון אוהדים, פורסם באישור. עדות אישית אינה נתון סטטיסטי רשמי.</p>
  </article></main>;
}
