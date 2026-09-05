import prisma from '@/lib/prisma';
import { youtubeThumb } from '@/lib/youtube';
import SongsBrowser, { type BrowserSong } from '@/components/SongsBrowser';

export const dynamic = 'force-dynamic';

/** First non-empty line of the lyrics — the teaser shown on a card. */
function firstLine(lyrics: string | null): string | null {
  if (!lyrics) return null;
  const line = lyrics
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0);
  return line || null;
}

export default async function SongsPage() {
  const songs = await prisma.song.findMany({
    where: { isPublished: true },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    include: { player: { select: { id: true, nameHe: true, photoUrl: true } } },
  });

  const items: BrowserSong[] = songs.map((song) => ({
    id: song.id,
    slug: song.slug,
    type: song.type,
    titleHe: song.titleHe,
    lyricsSnippet: firstLine(song.lyricsHe),
    hasLyrics: Boolean(song.lyricsHe),
    originalMelody: song.originalMelody,
    performerGroup: song.performerGroup,
    thumbUrl: youtubeThumb(song.videoUrls?.[0]),
    contentWarning: song.contentWarning,
    player: song.player
      ? { id: song.player.id, nameHe: song.player.nameHe, photoUrl: song.player.photoUrl }
      : null,
  }));

  return (
    <div dir="rtl" className="mx-auto max-w-6xl px-4 py-8">
      <header>
        <h1 className="text-3xl font-black text-stone-900">שירי היציע</h1>
        <p className="mt-2 text-sm text-stone-600">
          {items.length === 0
            ? 'הארכיון בהקמה — בקרוב כאן שירי השחקנים ופזמוני היציע.'
            : `${items.length === 1 ? 'שיר אחד' : `${items.length} שירים`} בארכיון — שירי שחקנים ופזמוני יציע, עם מילים ווידאו.`}
        </p>
      </header>

      <SongsBrowser songs={items} />
    </div>
  );
}
