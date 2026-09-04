// src/lib/youtube.ts — YouTube URL helpers for fan-song videos (never self-hosted).
const ID_RE = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Extract an 11-char YouTube video id from any common URL form, else null. */
export function youtubeId(input: string | null | undefined): string | null {
  if (!input) return null;
  const m = String(input).match(ID_RE);
  return m ? m[1] : null;
}

function idOrBare(input: string | null | undefined): string | null {
  return youtubeId(input) ?? (input && /^[A-Za-z0-9_-]{11}$/.test(input) ? input : null);
}

/** Privacy-friendly embed URL from a url or a bare id. */
export function youtubeEmbedUrl(input: string | null | undefined): string | null {
  const id = idOrBare(input);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

/** Thumbnail URL from a url or a bare id. */
export function youtubeThumb(input: string | null | undefined): string | null {
  const id = idOrBare(input);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}
