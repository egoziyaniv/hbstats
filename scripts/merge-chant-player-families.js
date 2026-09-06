'use strict';
/**
 * merge-chant-player-families.js — unify the per-season Player rows of the fan-chant
 * players into one canonical family each.
 *
 * Why: the 2009-2015 historical import created a separate ROOT Player row per season
 * (no birthDate, no photo, canonicalPlayerId=null), while the 2016+ rows were properly
 * canonicalised. A player therefore appeared as up to 15 unrelated people, so his page
 * and his chant card showed a single season's numbers as if they were his whole career
 * (בן ביטון: 33 appearances instead of 249 across the fragments).
 *
 * Safety: the name list below is NOT heuristic — each of these 11 was verified by hand
 * against shirt number continuity and a non-overlapping club timeline before being added
 * (see the session notes). The script refuses any name that is not on the list, and it
 * only ever writes Player.canonicalPlayerId plus the song/hall-of-fame pointers — no
 * game, event or lineup row is touched, so the merge is fully reversible.
 *
 * Root choice: prefer a row that already carries birthDate + photoUrl (the 2016+ import,
 * which is also what existing links point at); otherwise the row with the most lineups.
 *
 * Run: node scripts/merge-chant-player-families.js [--apply]
 * Without --apply it is a dry run and prints the plan only.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Hand-verified: each name below resolves to exactly one real person.
const VERIFIED_NAMES = [
  'מאור מליקסון',
  'אליניב ברדה',
  'רועי גורדנה',
  'לואי טאהא',
  'דור מלול',
  'דובב גבאי',
  'גל אראל',
  'בן ביטון',
  'יוסף אבו לבן',
  "טומיסלב פיוביץ'",
  "אוסטין אמאמצ'וקו אג'ידה",
  'גיא חיימוב',
  'מתן אוחיון',
];

const APPLY = process.argv.includes('--apply');

(async () => {
  let merged = 0;
  let relinked = 0;

  for (const nameHe of VERIFIED_NAMES) {
    const rows = await prisma.player.findMany({
      where: { nameHe },
      select: {
        id: true, birthDate: true, photoUrl: true, position: true,
        canonicalPlayerId: true,
        team: { select: { nameHe: true, season: { select: { year: true } } } },
      },
    });
    if (rows.length < 2) {
      console.log(`SKIP ${nameHe} — ${rows.length} row(s), nothing to merge`);
      continue;
    }

    const lineups = new Map();
    for (const r of rows) {
      lineups.set(r.id, await prisma.gameLineupEntry.count({ where: { playerId: r.id } }));
    }

    // Prefer the richest row (birthDate + photo); fall back to most appearances.
    const score = (r) => (r.birthDate ? 4 : 0) + (r.photoUrl ? 2 : 0);
    const root = [...rows].sort(
      (a, b) => score(b) - score(a) || lineups.get(b.id) - lineups.get(a.id),
    )[0];

    const children = rows.filter((r) => r.id !== root.id);
    const alreadyOk = children.every((c) => c.canonicalPlayerId === root.id) && !root.canonicalPlayerId;
    const totalApps = [...lineups.values()].reduce((a, b) => a + b, 0);

    console.log(
      `\n${nameHe} — ${rows.length} rows, ${totalApps} lineups total` +
      `\n  root: ${root.id} (${root.team ? root.team.season.year + ' ' + root.team.nameHe : '?'})` +
      ` photo=${root.photoUrl ? 'Y' : 'N'} dob=${root.birthDate ? 'Y' : 'N'}` +
      (alreadyOk ? '\n  already merged' : `\n  -> ${children.length} rows become children`),
    );

    if (!APPLY || alreadyOk) continue;

    await prisma.player.update({ where: { id: root.id }, data: { canonicalPlayerId: null } });
    await prisma.player.updateMany({
      where: { id: { in: children.map((c) => c.id) } },
      data: { canonicalPlayerId: root.id },
    });
    merged++;

    // Fill gaps on the root from whichever season row happens to carry the detail.
    const donorPhoto = rows.find((r) => r.photoUrl);
    const donorDob = rows.find((r) => r.birthDate);
    const donorPos = rows.find((r) => r.position);
    const fill = {};
    if (!root.photoUrl && donorPhoto) fill.photoUrl = donorPhoto.photoUrl;
    if (!root.birthDate && donorDob) fill.birthDate = donorDob.birthDate;
    if (!root.position && donorPos) fill.position = donorPos.position;
    if (Object.keys(fill).length) {
      await prisma.player.update({ where: { id: root.id }, data: fill });
      console.log(`  filled root: ${Object.keys(fill).join(', ')}`);
    }

    // Anything pointing at a row that is now a child must follow the root, or the
    // family lookup (id OR canonicalPlayerId = id) would collapse to one season.
    const childIds = children.map((c) => c.id);
    const songs = await prisma.song.updateMany({
      where: { playerId: { in: childIds } },
      data: { playerId: root.id },
    });
    const hof = await prisma.hallOfFameEntry.updateMany({
      where: { playerId: { in: childIds } },
      data: { playerId: root.id },
    });
    if (songs.count || hof.count) {
      console.log(`  relinked: ${songs.count} song(s), ${hof.count} hall-of-fame entry(ies)`);
      relinked += songs.count + hof.count;
    }
  }

  console.log(
    `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — families merged: ${merged}, pointers relinked: ${relinked}`,
  );
  if (!APPLY) console.log('re-run with --apply to write');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
