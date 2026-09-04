import { MediaAssetKind } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { storeUploadedImage, ALLOWED_UPLOAD_MIME } from '@/lib/media-storage';

export async function POST(request: NextRequest) {
  const viewer = await getRequestUser(request);

  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const entityType = String(formData.get('entityType') || '');
  const entityId = String(formData.get('entityId') || '');
  const title = String(formData.get('title') || '').trim();
  const isPrimary = String(formData.get('isPrimary') || '') === 'true';
  const file = formData.get('file');

  if (!entityId || (entityType !== 'team' && entityType !== 'player' && entityType !== 'venue' && entityType !== 'game') || !(file instanceof File)) {
    return NextResponse.json({ error: 'Missing upload fields.' }, { status: 400 });
  }

  // Allowlist raster types only — `image/svg+xml` would pass a loose image/*
  // check and SVG can carry <script> (stored XSS). The bytes are also sniffed
  // in storeUploadedImage as defense-in-depth (MIME is client-controlled).
  if (!ALLOWED_UPLOAD_MIME.has(file.type)) {
    return NextResponse.json({ error: 'סוג קובץ לא נתמך. מותר: PNG, JPEG, WebP, GIF.' }, { status: 400 });
  }

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'File too large. Maximum 5MB.' }, { status: 413 });
  }

  if (entityType === 'team') {
    const team = await prisma.team.findUnique({
      where: { id: entityId },
      include: { season: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found.' }, { status: 404 });
    }

    const filePath = await storeUploadedImage({
      file,
      entityType: 'teams',
      seasonYear: team.season.year,
      folderName: team.nameEn,
      entityId: team.id,
      label: title || team.nameEn,
    });

    const currentCount = await prisma.mediaAsset.count({
      where: { teamId: team.id },
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        kind: MediaAssetKind.TEAM_LOGO,
        title: title || null,
        originalName: file.name,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        isPrimary,
        displayOrder: currentCount,
        teamId: team.id,
      },
    });

    if (isPrimary || !team.logoUrl) {
      await prisma.team.update({
        where: { id: team.id },
        data: { logoUrl: filePath },
      });
    }

    return NextResponse.json({ asset, filePath });
  }

  if (entityType === 'venue') {
    const venue = await prisma.venue.findUnique({
      where: { id: entityId },
    });

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found.' }, { status: 404 });
    }

    const filePath = await storeUploadedImage({
      file,
      entityType: 'venues',
      folderName: venue.nameEn,
      entityId: venue.id,
      label: title || venue.nameEn,
    });

    const currentCount = await prisma.mediaAsset.count({
      where: { venueId: venue.id },
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        kind: MediaAssetKind.VENUE_PHOTO,
        title: title || null,
        originalName: file.name,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        isPrimary,
        displayOrder: currentCount,
        venueId: venue.id,
      },
    });

    if (isPrimary || !venue.imageUrl) {
      await prisma.venue.update({
        where: { id: venue.id },
        data: { imageUrl: filePath },
      });
    }

    return NextResponse.json({ asset, filePath });
  }

  if (entityType === 'game') {
    const game = await prisma.game.findUnique({
      where: { id: entityId },
      include: { season: true },
    });

    if (!game) {
      return NextResponse.json({ error: 'Game not found.' }, { status: 404 });
    }

    const filePath = await storeUploadedImage({
      file,
      entityType: 'games',
      seasonYear: game.season.year,
      folderName: game.id,
      entityId: game.id,
      label: title || game.id,
    });

    const currentCount = await prisma.mediaAsset.count({
      where: { gameId: game.id },
    });

    const asset = await prisma.mediaAsset.create({
      data: {
        kind: MediaAssetKind.GAME_PHOTO,
        title: title || null,
        originalName: file.name,
        filePath,
        mimeType: file.type,
        sizeBytes: file.size,
        isPrimary,
        displayOrder: currentCount,
        gameId: game.id,
      },
    });

    return NextResponse.json({ asset, filePath });
  }

  const player = await prisma.player.findUnique({
    where: { id: entityId },
    include: {
      canonicalPlayer: true,
      team: {
        include: { season: true },
      },
    },
  });

  if (!player) {
    return NextResponse.json({ error: 'Player not found.' }, { status: 404 });
  }

  const canonicalPlayerId = player.canonicalPlayerId || player.id;

  const filePath = await storeUploadedImage({
    file,
    entityType: 'players',
    seasonYear: player.team.season.year,
    folderName: player.team.nameEn,
    entityId: canonicalPlayerId,
    label: title || player.nameEn,
  });

  const currentCount = await prisma.mediaAsset.count({
    where: { playerId: canonicalPlayerId },
  });

  const asset = await prisma.mediaAsset.create({
    data: {
      kind: MediaAssetKind.PLAYER_PHOTO,
      title: title || null,
      originalName: file.name,
      filePath,
      mimeType: file.type,
      sizeBytes: file.size,
      isPrimary,
      displayOrder: currentCount,
      playerId: canonicalPlayerId,
    },
  });

  if (isPrimary || !player.photoUrl) {
    await prisma.player.update({
      where: { id: player.id },
      data: { photoUrl: filePath },
    });
  }

  return NextResponse.json({ asset, filePath });
}

// Remove a media asset (used by the game-gallery editor). Admin only.
// Deletes the DB row; the underlying file is left on disk (harmless orphan).
export async function DELETE(request: NextRequest) {
  const viewer = await getRequestUser(request);
  if (!viewer || viewer.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });
  await prisma.mediaAsset.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
