import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { SONG_TYPE_HE } from '@/lib/song-display';
import { youtubeEmbedUrl } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

export default async function SongPage({ params }: { params: { slug: string } }) {
  const song = await prisma.song.findUnique({
    where: { slug: decodeURIComponent(params.slug) },
    include: { player: { select: { id: true, nameHe: true } } },
  });

  if (!song || !song.isPublished) {
    notFound();
  }

  const metaParts: Array<{ label: string; node: React.ReactNode }> = [];
  if (song.debutSeasonYear) {
    metaParts.push({ label: 'בכורה', node: <>בכורה: {song.debutSeasonYear}</> });
  }
  if (song.performerGroup) {
    metaParts.push({ label: 'ארגון', node: <>ארגון: {song.performerGroup}</> });
  }
  if (song.originalMelody) {
    metaParts.push({
      label: 'שיר מקור',
      node: song.originalMelodyUrl ? (
        <>
          שיר מקור:{' '}
          <a
            href={song.originalMelodyUrl}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            {song.originalMelody}
          </a>
        </>
      ) : (
        <>שיר מקור: {song.originalMelody}</>
      ),
    });
  }

  const embeds = (song.videoUrls || [])
    .map((url) => youtubeEmbedUrl(url))
    .filter((url): url is string => Boolean(url));

  return (
    <div dir="rtl" className="mx-auto max-w-3xl px-4 py-8">
      <div className="space-y-6">
        <div>
          <Link href="/songs" className="text-sm font-semibold text-stone-500 hover:text-[var(--accent)]">
            → חזרה לכל השירים
          </Link>
        </div>

        <header className="space-y-3">
          <span className="inline-block rounded-full bg-[var(--accent)] px-3 py-1 text-xs font-bold text-white">
            {SONG_TYPE_HE[song.type]}
          </span>
          <h1 className="text-3xl font-black leading-tight text-stone-900 sm:text-4xl">{song.titleHe}</h1>
        </header>

        {song.contentWarning ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            שימו לב: היציע מתועד כפי שהוא, וייתכן תוכן בוטה.
          </div>
        ) : null}

        {metaParts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-600">
            {metaParts.map((part, i) => (
              <span key={part.label} className="inline-flex items-center gap-2">
                {i > 0 ? <span className="text-stone-300">·</span> : null}
                <span>{part.node}</span>
              </span>
            ))}
          </div>
        ) : null}

        {song.lyricsHe ? (
          <section className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
            <div className="whitespace-pre-line text-base leading-loose text-stone-800">{song.lyricsHe}</div>
          </section>
        ) : null}

        {song.chordsHe ? (
          <details className="modern-card rounded-2xl border border-stone-200/80 bg-white p-6 shadow-sm">
            <summary className="cursor-pointer text-lg font-black text-stone-900">אקורדים</summary>
            <pre className="mt-4 whitespace-pre-wrap font-mono text-sm leading-relaxed text-stone-700">{song.chordsHe}</pre>
          </details>
        ) : null}

        {embeds.length > 0 ? (
          <section className="space-y-4">
            <h2 className="border-r-[3px] border-[var(--accent)] pr-3 text-xl font-black text-stone-900">וידאו</h2>
            {embeds.map((url) => (
              <div key={url} className="relative w-full overflow-hidden rounded-2xl border border-stone-200/80 bg-black pt-[56.25%] shadow-sm">
                <iframe
                  src={url}
                  className="absolute inset-0 h-full w-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={song.titleHe}
                />
              </div>
            ))}
          </section>
        ) : null}

        {song.player ? (
          <div>
            <Link
              href={`/players/${song.player.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm font-bold text-stone-900 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
            >
              שיר השחקן של {song.player.nameHe}
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
