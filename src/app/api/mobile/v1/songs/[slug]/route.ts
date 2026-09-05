import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { youtubeThumb, youtubeEmbedUrl } from '@/lib/youtube';
import type { SongDetail } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const slug = decodeURIComponent(params.slug);
  const s = await prisma.song.findUnique({
    where: { slug },
    include: { player: { select: { id: true, nameHe: true, photoUrl: true } } },
  });
  if (!s || !s.isPublished) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const detail: SongDetail = {
    id: s.id,
    slug: s.slug,
    type: s.type as SongDetail['type'],
    titleHe: s.titleHe,
    performerGroup: s.performerGroup,
    debutSeasonYear: s.debutSeasonYear,
    thumbUrl: youtubeThumb(s.videoUrls[0] ?? null),
    contentWarning: s.contentWarning,
    hasLyrics: !!s.lyricsHe,
    player: s.player ? { id: s.player.id, nameHe: s.player.nameHe, photoUrl: s.player.photoUrl } : null,
    lyricsHe: s.lyricsHe,
    chordsHe: s.chordsHe,
    originalMelody: s.originalMelody,
    originalMelodyUrl: s.originalMelodyUrl,
    videoEmbedUrls: s.videoUrls.map((u) => youtubeEmbedUrl(u)).filter((u): u is string => !!u),
  };
  return NextResponse.json(detail);
}
