#!/usr/bin/env node
/**
 * mark-departed-players.js — flag/unflag current-season players who have left
 * the club (e.g. a transfer ABROAD that API-Football's /players/squads lags on
 * — it kept Kings Kangwa in Beer Sheva weeks after he moved overseas, and
 * /transfers doesn't reflect the current window either).
 *
 * This sets a REVERSIBLE display flag (additionalInfo.departed) — it never
 * deletes the player, so their game history (Kangwa's 2 CL goals vs Víkingur)
 * is kept; the players directory just hides departed players from the current
 * squad. Targeted by apiFootballId because no source reliably auto-detects
 * abroad-transfers (Walla-absence flags too many active players as false
 * positives; the Israeli→Israeli case is handled by prune-departed-squad.js).
 *
 * Usage:
 *   node scripts/mark-departed-players.js --af 122428[,<af>...] --execute   # mark departed
 *   node scripts/mark-departed-players.js --clear 122428 --execute          # undo
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const arg = (n) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : null; };
const EXECUTE = process.argv.includes('--execute');
function defaultSeasonYear() { const now = new Date(); return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1; }

async function main() {
  const markAfs = (arg('af') || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
  const clearAfs = (arg('clear') || '').split(',').map((x) => parseInt(x, 10)).filter(Boolean);
  if (!markAfs.length && !clearAfs.length) { console.error('Pass --af <apiFootballId,...> to mark, or --clear <...> to undo.'); process.exit(1); }
  const season = await prisma.season.findFirst({ where: { year: defaultSeasonYear() }, select: { id: true } });
  const apply = async (afs, departed) => {
    for (const af of afs) {
      const recs = await prisma.player.findMany({ where: { apiFootballId: af, team: { seasonId: season.id } }, select: { id: true, nameHe: true, nameEn: true, additionalInfo: true, team: { select: { nameHe: true } } } });
      if (!recs.length) { console.log(`  af=${af}: no current-season record`); continue; }
      for (const r of recs) {
        const ai = { ...(r.additionalInfo || {}) };
        if (departed) ai.departed = true; else delete ai.departed;
        console.log(`  ${departed ? '✗ DEPARTED' : '↩ ACTIVE'} ${r.nameHe} / ${r.nameEn} @ ${r.team.nameHe}`);
        if (EXECUTE) await prisma.player.update({ where: { id: r.id }, data: { additionalInfo: ai } });
      }
    }
  };
  console.log(`=== mark-departed-players ${EXECUTE ? '(EXECUTE)' : '(DRY)'} ===`);
  if (markAfs.length) await apply(markAfs, true);
  if (clearAfs.length) await apply(clearAfs, false);
  console.log(EXECUTE ? 'Written.' : '[DRY] pass --execute to apply.');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
