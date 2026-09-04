import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { slugifySong } from '@/lib/song-display';
import { SongType } from '@prisma/client';

const TYPES = Object.values(SongType) as string[];
async function readJson(req: NextRequest): Promise<any | null> {
  try { return await req.json(); } catch { return null; }
}
function cleanUrls(v: unknown): string[] {
  return Array.isArray(v) ? v.map((s) => String(s).trim()).filter(Boolean) : [];
}
async function uniqueSlug(base: string): Promise<string> {
  const root = base || 'song';
  let slug = root;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await prisma.song.findUnique({ where: { slug }, select: { id: true } })) slug = `${root}-${n++}`;
  return slug;
}

export async function GET(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const songs = await prisma.song.findMany({
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'desc' }],
    include: { player: { select: { id: true, nameHe: true } } },
  });
  return NextResponse.json({ songs });
}

export async function POST(request: NextRequest) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const titleHe = String(body.titleHe ?? '').trim();
  if (!titleHe) return NextResponse.json({ error: 'titleHe is required' }, { status: 400 });
  const type = (TYPES.includes(body.type) ? body.type : SongType.STAND) as SongType;
  const slug = await uniqueSlug(body.slug ? slugifySong(String(body.slug)) : slugifySong(titleHe));

  const song = await prisma.song.create({
    data: {
      slug,
      type,
      titleHe,
      lyricsHe: body.lyricsHe?.trim() || null,
      chordsHe: body.chordsHe?.trim() || null,
      originalMelody: body.originalMelody?.trim() || null,
      originalMelodyUrl: body.originalMelodyUrl?.trim() || null,
      performerGroup: body.performerGroup?.trim() || null,
      debutSeasonYear: Number.isFinite(+body.debutSeasonYear) ? +body.debutSeasonYear : null,
      videoUrls: cleanUrls(body.videoUrls),
      playerId: body.playerId || null,
      contentWarning: !!body.contentWarning,
      isPublished: body.isPublished !== false,
      displayOrder: Number.isFinite(+body.displayOrder) ? +body.displayOrder : 0,
    },
  });
  return NextResponse.json(song, { status: 201 });
}
