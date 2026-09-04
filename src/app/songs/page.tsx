import Link from 'next/link';
import { SongType } from '@prisma/client';
import prisma from '@/lib/prisma';
import { SONG_TYPE_HE } from '@/lib/song-display';
import SongCard from '@/components/SongCard';

export const dynamic = 'force-dynamic';

const VALID_TYPES = Object.values(SongType) as SongType[];

export default async function SongsPage({
  searchParams,
}: {
  searchParams?: { type?: string };
}) {
  const rawType = searchParams?.type;
  const validType = rawType && VALID_TYPES.includes(rawType as SongType) ? (rawType as SongType) : null;

  const songs = await prisma.song.findMany({
    where: { isPublished: true, ...(validType ? { type: validType } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
  });

  const chips: Array<{ label: string; href: string; active: boolean }> = [
    { label: 'הכל', href: '/songs', active: !validType },
    ...VALID_TYPES.map((t) => ({
      label: SONG_TYPE_HE[t],
      href: `/songs?type=${t}`,
      active: validType === t,
    })),
  ];

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8">
      <header>
        <h1 className="text-3xl font-black text-stone-900">שירים ושירי יציע</h1>
        <p className="mt-2 text-sm text-stone-600">
          פזמוני היציע, שירי השחקנים ושירי האליפות שמלווים את הקבוצות לאורך העונות.
        </p>
      </header>

      <div className="mt-6 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <Link
            key={chip.href}
            href={chip.href}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              chip.active
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
            }`}
          >
            {chip.label}
          </Link>
        ))}
      </div>

      {songs.length > 0 ? (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {songs.map((song) => (
            <SongCard key={song.id} song={song} />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-stone-200/80 bg-white p-10 text-center text-stone-500 shadow-sm">
          עדיין אין שירים להצגה בקטגוריה הזו.
        </div>
      )}
    </div>
  );
}
