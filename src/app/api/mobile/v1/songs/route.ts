import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { youtubeThumb } from '@/lib/youtube';
import { SongType } from '@prisma/client';
import type { SongSummary, SongsPayload } from '@shared/types/mobile-api';

export const dynamic = 'force-dynamic';

const TYPES = Object.values(SongType) as string[];

export async function GET(request: NextRequest) {
  const typeParam = request.nextUrl.searchParams.get('type');
  const type = typeParam && TYPES.includes(typeParam) ? (typeParam as SongType) : null;

  const rows = await prisma.song.findMany({
    where: { isPublished: true, ...(type ? { type } : {}) },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    include: { player: { select: { id: true, nameHe: true } } },
  });

  const songs: SongSummary[] = rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    type: s.type as SongSummary['type'],
    titleHe: s.titleHe,
    performerGroup: s.performerGroup,
    debutSeasonYear: s.debutSeasonYear,
    thumbUrl: youtubeThumb(s.videoUrls[0] ?? null),
    contentWarning: s.contentWarning,
    player: s.player ? { id: s.player.id, nameHe: s.player.nameHe } : null,
  }));

  const payload: SongsPayload = { songs };
  return NextResponse.json(payload);
}
