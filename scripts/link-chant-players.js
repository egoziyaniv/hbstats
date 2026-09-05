'use strict';
/**
 * link-chant-players.js — link the remaining player chants to their real player
 * records, and normalise rough auto-transliterated names to the correct spelling.
 * Every pairing below was confirmed against the player's ENGLISH name, so no
 * guesswork: e.g. "אנתוני נוקם" is A. Nwakaeme, "מיכאל אוהן" is M. Ohana.
 * Deliberately NOT linked (candidates were different people / absent):
 *   עדן בן בסט (עדן שמיר = E. Shamir), דודו גורש (דודו טויטו = D. Twito),
 *   מהראן ראדי, דיא סבע, לוסיו.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LINKS = [
  { chant: 'רותם חטואל',   dbName: 'רותם הטואל',                 fixTo: 'רותם חטואל' },
  { chant: 'גיא חיימוב',    dbName: 'גיא המוב',                   fixTo: 'גיא חיימוב' },
  { chant: 'אנתוני נוואקמה', dbName: 'אנתוני נוקם',                fixTo: 'אנתוני נוואקמה' },
  { chant: 'מיכאל אוחנה',   dbName: 'מיכאל אוהן',                 fixTo: 'מיכאל אוחנה' },
  { chant: 'יובל שבתאי',    dbName: 'יובל שבט',                   fixTo: 'יובל שבתאי' },
  { chant: 'מיחאי קורהוט',  dbName: 'מיהלי קורהוט',               fixTo: null },
  { chant: 'יוסף אבו לאבן', dbName: 'יוסף אבו לבן',               fixTo: null },
  { chant: 'טומיסלב פאיוביץ', dbName: "טומיסלב פיוביץ'",          fixTo: null },
  { chant: "אוסטין אג'ידה", dbName: "אוסטין אמאמצ'וקו אג'ידה",     fixTo: null },
];

(async () => {
  const bsTeams = await prisma.team.findMany({ where: { apiFootballId: 563 }, select: { id: true } });
  const bsIds = bsTeams.map((t) => t.id);

  for (const L of LINKS) {
    const row = await prisma.player.findFirst({
      where: { nameHe: L.dbName, teamId: { in: bsIds } },
      select: { id: true, canonicalPlayerId: true },
    });
    if (!row) { console.log(`SKIP  ${L.chant} — no BS row named "${L.dbName}"`); continue; }
    const canonicalId = row.canonicalPlayerId || row.id;

    // Normalise the whole canonical family to the correct spelling.
    if (L.fixTo) {
      const r = await prisma.player.updateMany({
        where: { OR: [{ id: canonicalId }, { canonicalPlayerId: canonicalId }] },
        data: { nameHe: L.fixTo },
      });
      console.log(`RENAME ${L.dbName} -> ${L.fixTo} (${r.count} rows)`);
    }

    const s = await prisma.song.updateMany({
      where: { type: 'PLAYER', playerId: null, titleHe: { contains: L.chant } },
      data: { playerId: canonicalId },
    });
    console.log(`LINK  ${L.chant} -> ${canonicalId.slice(0, 8)} (${s.count} song${s.count === 1 ? '' : 's'})`);
  }

  const linked = await prisma.song.count({ where: { type: 'PLAYER', NOT: { playerId: null } } });
  const total = await prisma.song.count({ where: { type: 'PLAYER' } });
  console.log(`\nplayer chants linked: ${linked}/${total}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
