import type { SongType } from '@prisma/client';
import { SONG_TYPE_HE } from '@/lib/song-display';
import { youtubeThumb } from '@/lib/youtube';

type SongCardData = {
  slug: string;
  type: SongType;
  titleHe: string;
  performerGroup?: string | null;
  debutSeasonYear?: number | null;
  videoUrls?: string[];
};

export default function SongCard({ song }: { song: SongCardData }) {
  const thumb = youtubeThumb(song.videoUrls?.[0]);
  const metaParts = [
    song.performerGroup?.trim() || null,
    song.debutSeasonYear ? `עונת ${song.debutSeasonYear}` : null,
  ].filter(Boolean) as string[];

  return (
    <a
      href={`/songs/${song.slug}`}
      className="group modern-card block overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition hover:border-[var(--accent)]/40 hover:shadow-md"
    >
      <div className="relative aspect-video w-full overflow-hidden bg-stone-100">
        {thumb ? (
          <img
            src={thumb}
            alt={song.titleHe}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--accent),#7f1d1d)]">
            <svg viewBox="0 0 24 24" className="h-12 w-12 text-white/90" fill="currentColor" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur">
          {SONG_TYPE_HE[song.type]}
        </span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-lg font-black text-stone-900">{song.titleHe}</h3>
        {metaParts.length > 0 ? (
          <p className="mt-1 text-sm text-stone-500">{metaParts.join(' · ')}</p>
        ) : null}
      </div>
    </a>
  );
}
