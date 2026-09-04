// src/lib/song-display.ts — Hebrew labels + slug helper for fan songs.
import type { SongType } from '@prisma/client';

export const SONG_TYPE_HE: Record<SongType, string> = {
  STAND: 'שיר יציע',
  PLAYER: 'שיר שחקן',
  STUDIO: 'שיר אולפן',
  CHAMPIONSHIP: 'שיר אליפות',
};

/** URL-safe slug that keeps Hebrew letters; strips punctuation, collapses spaces. */
export function slugifySong(title: string): string {
  return (title || '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '') // drop punctuation, keep letters/digits/space/hyphen
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
