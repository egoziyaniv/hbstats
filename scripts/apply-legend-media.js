'use strict';
/**
 * apply-legend-media.js — set hall-of-fame legends' Wikimedia photo + YouTube
 * video, and link each to their real Player record where we have one (so the
 * legend page can surface true contribution/stats + a link to the full page).
 * Idempotent: matches by nameHe, updates in place.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Validated Wikimedia Commons photos (freely licensed; 200 verified) + YouTube.
const MEDIA = [
  { nameHe: 'שלמה אילוז', photoUrl: null, videoUrl: 'https://www.youtube.com/watch?v=V4avYEUPjeI' },
  { nameHe: 'שלום אביטן', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/1/1a/Shalom_Avitan_1.jpg', videoUrl: 'https://www.youtube.com/watch?v=TgiAh1eSW9U' },
  { nameHe: 'אליניב ברדה', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Elyaniv_Barda_%283%29.JPG/500px-Elyaniv_Barda_%283%29.JPG', videoUrl: 'https://www.youtube.com/watch?v=DE8f2RHASyU' },
  { nameHe: 'מיגל ויטור', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/d/d8/%D7%9E%D7%99%D7%92%D7%9C_%D7%95%D7%99%D7%98%D7%95%D7%A8_%D7%91%D7%9E%D7%93%D7%99_%D7%94%D7%A4%D7%95%D7%A2%D7%9C_%D7%91%D7%90%D7%A8_%D7%A9%D7%91%D7%A2_2025.jpg', videoUrl: 'https://www.youtube.com/watch?v=pK_B65S3Cy8' },
  { nameHe: 'אליהו עופר', photoUrl: null, videoUrl: 'https://www.youtube.com/watch?v=ssMPD5PR1OA' },
  { nameHe: 'מאיר ברד', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/0/02/Meir_Barad_2_2012.jpg', videoUrl: 'https://www.youtube.com/watch?v=mpKDNfylBFg' },
  { nameHe: 'סתיו אלימלך', photoUrl: null, videoUrl: 'https://www.youtube.com/watch?v=TMtS-1PjkVY' },
  { nameHe: 'רפי אליהו', photoUrl: null, videoUrl: 'https://www.youtube.com/watch?v=pHiWxsdFOis' },
  { nameHe: 'מאור מליקסון', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/e/e6/Maor_Melikson2.jpg', videoUrl: 'https://www.youtube.com/watch?v=9gPdM0im3iE' },
  { nameHe: 'ברק בכר', photoUrl: 'https://upload.wikimedia.org/wikipedia/commons/c/cc/Barak_Bakhar.jpeg', videoUrl: 'https://www.youtube.com/watch?v=PrpWzPF3IUk' },
];

// Resolve a Player id by exact Hebrew name — prefer the canonical record (so the
// player page shows the whole career), else the canonical of the first match.
async function resolvePlayerId(nameHe) {
  const matches = await prisma.player.findMany({
    where: { nameHe },
    select: { id: true, canonicalPlayerId: true },
  });
  if (!matches.length) return null;
  const canonical = matches.find((m) => !m.canonicalPlayerId);
  return canonical ? canonical.id : matches[0].canonicalPlayerId || matches[0].id;
}

(async () => {
  // One-time name correction: מאיר בראד → מאיר ברד.
  const renamed = await prisma.hallOfFameEntry.updateMany({ where: { nameHe: 'מאיר בראד' }, data: { nameHe: 'מאיר ברד' } });
  if (renamed.count) console.log('renamed מאיר בראד → מאיר ברד');

  for (const m of MEDIA) {
    const entry = await prisma.hallOfFameEntry.findFirst({ where: { nameHe: m.nameHe }, select: { id: true } });
    if (!entry) { console.log('SKIP (no entry):', m.nameHe); continue; }
    const playerId = await resolvePlayerId(m.nameHe);
    await prisma.hallOfFameEntry.update({
      where: { id: entry.id },
      data: {
        ...(m.photoUrl ? { photoUrl: m.photoUrl } : {}),
        videoUrl: m.videoUrl,
        ...(playerId ? { playerId } : {}),
      },
    });
    console.log(`${m.nameHe}: photo=${m.photoUrl ? 'yes' : 'no'} video=yes player=${playerId ? 'linked' : '—'}`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
