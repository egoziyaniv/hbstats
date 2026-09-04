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

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await readJson(request);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  const existing = await prisma.song.findUnique({ where: { id: params.id } });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const titleHe = String(body.titleHe ?? existing.titleHe).trim();
  let slug = existing.slug;
  const desired = body.slug ? slugifySong(String(body.slug)) : slugifySong(titleHe);
  if (desired && desired !== existing.slug) {
    const taken = await prisma.song.findUnique({ where: { slug: desired }, select: { id: true } });
    if (!taken) slug = desired;
  }

  const song = await prisma.song.update({
    where: { id: params.id },
    data: {
      slug,
      titleHe,
      type: (TYPES.includes(body.type) ? body.type : existing.type) as SongType,
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
      displayOrder: Number.isFinite(+body.displayOrder) ? +body.displayOrder : existing.displayOrder,
    },
  });
  return NextResponse.json(song);
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await getRequestUser(request);
  if (!auth || auth.role !== 'ADMIN') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  await prisma.song.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
