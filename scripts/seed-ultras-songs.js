'use strict';
/**
 * seed-ultras-songs.js — import the harvested אולטרס דרום chant catalogue.
 *
 * Dedup rules that matter:
 *  - Identity is the YOUTUBE VIDEO ID, not the slug — so re-running, or importing
 *    a song already seeded under a different title, updates instead of duplicating.
 *  - Same-title re-uploads in the harvest are merged into ONE song carrying both videos.
 *  - Existing curated data wins: we only FILL empty fields (lyrics, player link);
 *    we never overwrite a title, melody or lyrics that are already there.
 *  - Player links resolve against BEER SHEVA squads only, so a name collision with
 *    another club's player can't produce a wrong link.
 */
const { PrismaClient } = require('@prisma/client');
const CHANTS = require('./data/ultrasouth-songs');
const prisma = new PrismaClient();

const videoId = (url) => {
  const m = String(url || '').match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
};
const slugify = (t) => (t || '').trim().toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
const norm = (s) => (s || '').replace(/['"׳״]/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  const existing = await prisma.song.findMany({
    select: { id: true, slug: true, titleHe: true, videoUrls: true, lyricsHe: true, playerId: true },
  });
  const byVideo = new Map();
  const slugsTaken = new Set(existing.map((s) => s.slug));
  for (const s of existing) for (const u of s.videoUrls) { const v = videoId(u); if (v) byVideo.set(v, s); }

  // Beer Sheva players only — prevents wrong-person links.
  const bsTeams = await prisma.team.findMany({ where: { apiFootballId: 563 }, select: { id: true } });
  const bsPlayers = await prisma.player.findMany({
    where: { teamId: { in: bsTeams.map((t) => t.id) } },
    select: { id: true, nameHe: true, canonicalPlayerId: true },
  });
  const resolvePlayerId = (nameHe) => {
    if (!nameHe) return null;
    const target = norm(nameHe);
    const matches = bsPlayers.filter((p) => norm(p.nameHe) === target);
    if (!matches.length) return null;
    const canonical = matches.find((m) => !m.canonicalPlayerId);
    return canonical ? canonical.id : (matches[0].canonicalPlayerId || matches[0].id);
  };

  // Merge same-title re-uploads into one entry with several videos.
  const groups = new Map();
  for (const c of CHANTS) {
    const key = `${c.type}|${norm(c.titleHe)}`;
    const g = groups.get(key) || { type: c.type, playerNameHe: c.playerNameHe, titleHe: c.titleHe, videos: [], lyricsHe: null };
    if (!g.videos.includes(c.youtubeUrl)) g.videos.push(c.youtubeUrl);
    if (!g.lyricsHe && c.lyricsHe) g.lyricsHe = c.lyricsHe;
    if (!g.playerNameHe && c.playerNameHe) g.playerNameHe = c.playerNameHe;
    groups.set(key, g);
  }

  let created = 0, updated = 0, linked = 0, lyricsAdded = 0;
  for (const g of groups.values()) {
    const ids = g.videos.map(videoId).filter(Boolean);
    const hit = ids.map((v) => byVideo.get(v)).find(Boolean);
    const playerId = g.type === 'PLAYER' ? resolvePlayerId(g.playerNameHe) : null;

    if (hit) {
      // Fill gaps only — never clobber curated content.
      const mergedVideos = [...new Set([...hit.videoUrls, ...g.videos])];
      const data = {};
      if (mergedVideos.length !== hit.videoUrls.length) data.videoUrls = mergedVideos;
      if (!hit.lyricsHe && g.lyricsHe) { data.lyricsHe = g.lyricsHe; lyricsAdded++; }
      if (!hit.playerId && playerId) { data.playerId = playerId; linked++; }
      if (Object.keys(data).length) { await prisma.song.update({ where: { id: hit.id }, data }); updated++; }
      continue;
    }

    let slug = slugify(g.titleHe) || 'song';
    let n = 2;
    while (slugsTaken.has(slug)) slug = `${slugify(g.titleHe)}-${n++}`;
    slugsTaken.add(slug);

    const song = await prisma.song.create({
      data: {
        slug,
        type: g.type,
        titleHe: g.titleHe,
        lyricsHe: g.lyricsHe,
        videoUrls: g.videos,
        performerGroup: 'אולטרס דרום',
        playerId,
        isPublished: true,
      },
    });
    for (const v of ids) byVideo.set(v, { ...song, videoUrls: g.videos });
    created++;
    if (playerId) linked++;
    if (g.lyricsHe) lyricsAdded++;
  }

  const totals = await prisma.song.groupBy({ by: ['type'], _count: true });
  const withLyrics = await prisma.song.count({ where: { NOT: { lyricsHe: null } } });
  const withPlayer = await prisma.song.count({ where: { NOT: { playerId: null } } });
  console.log(`\nharvest groups=${groups.size} created=${created} updated=${updated} newLinks=${linked} lyricsFilled=${lyricsAdded}`);
  console.log('catalogue by type:', totals.map((t) => `${t.type}=${t._count}`).join(' '));
  console.log(`with lyrics=${withLyrics} | linked to a player=${withPlayer}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
