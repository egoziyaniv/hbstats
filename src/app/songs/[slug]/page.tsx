import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { SONG_TYPE_HE } from '@/lib/song-display';
import { buildPlayerContribution } from '@/lib/player-contribution';
import { youtubeEmbedUrl } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

function monogram(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');
}

export default async function SongPage({ params }: { params: { slug: string } }) {
  const song = await prisma.song.findUnique({
    where: { slug: decodeURIComponent(params.slug) },
    include: { player: { select: { id: true, nameHe: true } } },
  });

  if (!song || !song.isPublished) {
    notFound();
  }

  // A player chant is *about* someone we hold 26 seasons of data on — surface
  // that contribution here and hand the reader straight through to his page.
  const contribution = song.player ? await buildPlayerContribution(song.player.id) : null;

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

        {song.player ? (
          <section className="modern-card overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
            <Link
              href={`/players/${song.player.id}`}
              className="group flex items-center gap-4 p-5 transition hover:bg-stone-50"
            >
              {contribution?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={contribution.photoUrl}
                  alt={song.player.nameHe}
                  className="h-20 w-20 shrink-0 rounded-2xl border border-stone-200 bg-white object-cover object-top"
                />
              ) : (
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),#7f1d1d)]">
                  <span className="text-2xl font-black text-white/90">{monogram(song.player.nameHe)}</span>
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-stone-400">שיר השחקן של</div>
                <div className="truncate text-2xl font-black text-stone-900 group-hover:text-[var(--accent)]">
                  {song.player.nameHe}
                </div>
                {contribution?.position ? (
                  <div className="mt-0.5 text-sm text-stone-500">{contribution.position}</div>
                ) : null}
              </div>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-stone-300 group-hover:text-[var(--accent)]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="15 6 9 12 15 18" />
              </svg>
            </Link>

            {contribution ? (
              <>
                <div className="grid grid-cols-2 divide-x divide-x-reverse divide-stone-200/80 border-y border-stone-200/80 bg-stone-50">
                  <Link href={`/players/${song.player.id}?tab=games`} className="p-4 text-center transition hover:bg-white">
                    <div className="text-2xl font-black text-stone-900">{contribution.appearances}</div>
                    <div className="mt-0.5 text-xs font-semibold text-stone-500">הופעות</div>
                  </Link>
                  <Link href={`/players/${song.player.id}?tab=stats`} className="p-4 text-center transition hover:bg-white">
                    <div className="text-2xl font-black text-stone-900">{contribution.goals}</div>
                    <div className="mt-0.5 text-xs font-semibold text-stone-500">שערים</div>
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2 p-4">
                  <Link
                    href={`/players/${song.player.id}`}
                    className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
                  >
                    לדף השחקן
                  </Link>
                  <Link
                    href={`/players/${song.player.id}?tab=stats`}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                  >
                    כל הסטטיסטיקות
                  </Link>
                  <Link
                    href={`/players/${song.player.id}?tab=games`}
                    className="inline-flex items-center gap-2 rounded-xl border border-stone-200 px-4 py-2 text-sm font-bold text-stone-700 transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
                  >
                    המשחקים שלו
                  </Link>
                </div>
              </>
            ) : null}
          </section>
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

      </div>
    </div>
  );
}
