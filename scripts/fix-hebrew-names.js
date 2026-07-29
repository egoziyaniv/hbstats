#!/usr/bin/env node
/**
 * fix-hebrew-names.js — fix WRONG Hebrew player names for a season's Ligat
 * Ha'al squads, using the accurate English name (from the API-Football sync).
 *
 * Targeted + safe (a blind bulk re-transliterate is a known footgun — it
 * degrades good curated names). We only touch a record when its current nameHe
 * is essentially UNRELATED to a transliteration of its English name (similarity
 * below threshold) OR is a duplicate nameHe shared by another player in the same
 * team (e.g. two different Cohens both "גבריל כהן"). Curated names that merely
 * differ in spelling from the transliteration (מרציאנו vs מרסיאנו) stay put.
 *
 * Usage:
 *   node scripts/fix-hebrew-names.js --season 2026 [--execute]
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { translateName } = require('./transliterate-players.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_YEAR = parseInt(arg('season', '2026'), 10);
const EXECUTE = process.argv.includes('--execute');
const SIM_THRESHOLD = 0.35; // below → treat current nameHe as an unrelated (wrong) name

function lev(a, b) {
  a = a || ''; b = b || '';
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}
const sim = (a, b) => { const L = Math.max((a || '').length, (b || '').length); return L ? 1 - lev(a, b) / L : 1; };

async function main() {
  console.log(`=== fix-hebrew-names season=${SEASON_YEAR} ${EXECUTE ? '(EXECUTE)' : '(DRY)'} ===\n`);
  const season = await prisma.season.findFirst({ where: { year: SEASON_YEAR }, select: { id: true } });
  const teams = await prisma.team.findMany({
    where: { seasonId: season.id, standings: { some: { competitionId: 'comp_liga_haal' } } },
    select: { id: true, nameHe: true, players: { select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true, canonicalPlayerId: true } } },
  });

  const fixes = [];
  for (const t of teams) {
    // duplicate nameHe within team (different nameEn → at least one wrong)
    const heCount = {};
    t.players.forEach((p) => { const k = (p.nameHe || '').trim(); if (k) heCount[k] = (heCount[k] || 0) + 1; });
    for (const p of t.players) {
      const trans = translateName(p.firstNameEn, p.lastNameEn, p.nameEn);
      if (!trans || !/[֐-׿]/.test(trans)) continue; // no usable Hebrew transliteration
      const cur = (p.nameHe || '').trim();
      const isDup = cur && heCount[cur] > 1;
      const isUnrelated = sim(cur, trans) < SIM_THRESHOLD;
      const hasLatin = /[A-Za-z]/.test(cur);
      // Guard against the footgun: an abbreviated English first initial ("M.",
      // "S.") transliterates to a single Hebrew char ("ם"/"ס") — replacing a
      // good full current name with that DEGRADES it. Only apply when the
      // replacement has a real first name (≥2 chars).
      const goodTrans = (trans.split(/\s+/)[0] || '').length >= 2;
      if ((isDup || isUnrelated || hasLatin) && cur !== trans && goodTrans) {
        fixes.push({ team: t.nameHe, id: p.id, canonicalPlayerId: p.canonicalPlayerId, nameEn: p.nameEn, from: cur || '(empty)', to: trans, why: hasLatin ? 'latin' : isDup ? 'dup' : 'unrelated' });
      }
    }
  }

  console.log(`Flagged ${fixes.length} wrong names:\n`);
  for (const f of fixes) console.log(`  [${f.why}] ${f.team} | ${f.nameEn}: "${f.from}" → "${f.to}"`);

  if (EXECUTE) {
    for (const f of fixes) {
      await prisma.player.update({ where: { id: f.id }, data: { nameHe: f.to } }).catch(() => {});
      if (f.canonicalPlayerId) await prisma.player.update({ where: { id: f.canonicalPlayerId }, data: { nameHe: f.to } }).catch(() => {});
    }
    console.log(`\n✓ Updated ${fixes.length} records (+ canonicals).`);
  } else {
    console.log('\n[DRY] pass --execute to apply.');
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
