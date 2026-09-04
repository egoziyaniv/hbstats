import { youtubeEmbedUrl } from '@/lib/youtube';

type EditorialData = {
  recapVideoUrl: string | null;
  fullMatchUrl: string | null;
  reportTitleHe: string | null;
  reportHe: string | null;
  matchFactHe: string | null;
} | null;

type GalleryItem = {
  id: string;
  filePath: string;
  title: string | null;
};

// Server-safe editorial block for a game's overview tab: match fact, recap
// video, written report and a photo gallery. Renders only the parts present,
// and nothing at all when there is neither editorial content nor a gallery.
export function GameEditorialBlock({
  editorial,
  gallery,
}: {
  editorial: EditorialData;
  gallery: GalleryItem[];
}) {
  const embedUrl = editorial?.recapVideoUrl ? youtubeEmbedUrl(editorial.recapVideoUrl) : null;
  const fullMatchUrl = editorial?.fullMatchUrl?.trim() || null;
  const matchFactHe = editorial?.matchFactHe?.trim() || null;
  const reportTitleHe = editorial?.reportTitleHe?.trim() || null;
  const reportHe = editorial?.reportHe?.trim() || null;

  const hasFact = !!matchFactHe;
  const hasVideo = !!(embedUrl || fullMatchUrl);
  const hasReport = !!(reportTitleHe || reportHe);
  const hasGallery = gallery.length > 0;

  if (!hasFact && !hasVideo && !hasReport && !hasGallery) return null;

  return (
    <section className="mb-6 space-y-6">
      {hasFact ? (
        <div className="flex items-start gap-3 rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <span className="mt-0.5 inline-flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" />
            </svg>
          </span>
          <div>
            <div className="text-xs font-black tracking-[0.14em] text-[var(--accent)]">פקט מהמשחק</div>
            <p className="mt-1 text-lg font-bold leading-relaxed text-stone-800">{matchFactHe}</p>
          </div>
        </div>
      ) : null}

      {hasVideo ? (
        <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-stone-900">תקציר וידאו</h2>
          {embedUrl ? (
            <div className="mt-4 aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={embedUrl}
                title="תקציר וידאו"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : null}
          {fullMatchUrl ? (
            <a
              href={fullMatchUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] hover:underline"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              צפייה במשחק המלא
            </a>
          ) : null}
        </div>
      ) : null}

      {hasReport ? (
        <article className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          {reportTitleHe ? (
            <h2 className="text-2xl font-black leading-snug text-stone-900">{reportTitleHe}</h2>
          ) : null}
          {reportHe ? (
            <div className="mt-4 whitespace-pre-line leading-loose text-stone-700">{reportHe}</div>
          ) : null}
        </article>
      ) : null}

      {hasGallery ? (
        <div className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black text-stone-900">גלריית תמונות</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {gallery.map((photo) => (
              <figure
                key={photo.id}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.filePath}
                  alt={photo.title || 'תמונת משחק'}
                  className="h-40 w-full object-cover"
                  loading="lazy"
                />
                {photo.title ? (
                  <figcaption className="px-3 py-2 text-xs font-semibold text-stone-500">{photo.title}</figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
