'use strict';
/**
 * apply-commons-player-photos.js — attach freely-licensed Wikimedia Commons portraits
 * to Beer Sheva players our own photo archive never covered.
 *
 * The 2009-2015 historical import carried no photos, so the fan-chant players from that
 * era rendered as initials. Every URL below was resolved through the Commons API
 * (500px rendition), verified to return image/jpeg, and each subject was confirmed to be
 * the right person by checking that הפועל באר שבע appears in the club history of his
 * Hebrew Wikipedia article — not merely that the name matched.
 *
 * These are CC BY-SA, which obliges us to name the author and the licence wherever the
 * photo appears, so photoCredit + photoSourceUrl are written with the URL and the UI is
 * expected to render them. Never add a row here without all three.
 *
 * Writes only the canonical root of each family (season rows inherit through it), and
 * never overwrites a photo we already hold.
 *
 * Run: node scripts/apply-commons-player-photos.js [--apply]
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PHOTOS = [
  { nameHe: "מאור מליקסון", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b6/Maor_Melikson_SAM_1678.jpg/500px-Maor_Melikson_SAM_1678.jpg", photoCredit: "Adir Benyamini · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Maor_Melikson_SAM_1678.jpg" },
  { nameHe: "אליניב ברדה", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Elyaniv_Barda_%283%29.JPG/500px-Elyaniv_Barda_%283%29.JPG", photoCredit: "Botend · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Elyaniv_Barda_(3).JPG" },
  { nameHe: "רועי גורדנה", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Roei_Gordana.JPG/500px-Roei_Gordana.JPG", photoCredit: "Botend · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Roei_Gordana.JPG" },
  { nameHe: "דור מלול", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/%D7%93%D7%95%D7%A8_%D7%9E%D7%9C%D7%95%D7%9C.JPG/500px-%D7%93%D7%95%D7%A8_%D7%9E%D7%9C%D7%95%D7%9C.JPG", photoCredit: "רועי ביטון · CC BY-SA 3.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:%D7%93%D7%95%D7%A8_%D7%9E%D7%9C%D7%95%D7%9C.JPG" },
  { nameHe: "דובב גבאי", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/%D7%93%D7%95%D7%91%D7%91_%D7%92%D7%91%D7%90%D7%99_2.jpg/500px-%D7%93%D7%95%D7%91%D7%91_%D7%92%D7%91%D7%90%D7%99_2.jpg", photoCredit: "Adir Benyamini · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:%D7%93%D7%95%D7%91%D7%91_%D7%92%D7%91%D7%90%D7%99_2.jpg" },
  { nameHe: "גל אראל", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Gal_Arel.jpg/500px-Gal_Arel.jpg", photoCredit: "Adir Benyamini · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Gal_Arel.jpg" },
  { nameHe: "בן ביטון", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Ben_Bitton.JPG/500px-Ben_Bitton.JPG", photoCredit: "Botend · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Ben_Bitton.JPG" },
  { nameHe: "יוסף אבו לבן", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Yosef_Abu_Laben.JPG/500px-Yosef_Abu_Laben.JPG", photoCredit: "Botend · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Yosef_Abu_Laben.JPG" },
  { nameHe: "אוסטין אמאמצ'וקו אג'ידה", photoUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/Austin_Ejide.jpg/500px-Austin_Ejide.jpg", photoCredit: "Adir Benyamini · CC BY-SA 4.0", photoSourceUrl: "https://commons.wikimedia.org/wiki/File:Austin_Ejide.jpg" },
];

const APPLY = process.argv.includes('--apply');

(async () => {
  let applied = 0;
  let skipped = 0;

  for (const p of PHOTOS) {
    const rows = await prisma.player.findMany({
      where: { nameHe: p.nameHe },
      select: { id: true, photoUrl: true, canonicalPlayerId: true },
    });
    const roots = rows.filter((r) => !r.canonicalPlayerId);
    if (roots.length !== 1) {
      console.log(`SKIP ${p.nameHe} — expected exactly one canonical row, found ${roots.length} (merge first)`);
      skipped++;
      continue;
    }
    const root = roots[0];
    if (root.photoUrl && !root.photoUrl.startsWith('https://upload.wikimedia.org')) {
      console.log(`SKIP ${p.nameHe} — already has our own photo (${root.photoUrl})`);
      skipped++;
      continue;
    }

    console.log(`${APPLY ? 'SET ' : 'PLAN'} ${p.nameHe.padEnd(24)} ${p.photoCredit}`);
    if (APPLY) {
      await prisma.player.update({
        where: { id: root.id },
        data: { photoUrl: p.photoUrl, photoCredit: p.photoCredit, photoSourceUrl: p.photoSourceUrl },
      });
      applied++;
    }
  }

  console.log(`\n${APPLY ? 'APPLIED' : 'DRY RUN'} — photos set: ${applied}, skipped: ${skipped}`);
  if (!APPLY) console.log('re-run with --apply to write');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
