#!/usr/bin/env node
/**
 * scrape-walla-squad.js — pull a Ligat Ha'al team's squad from Walla (native,
 * authoritative Hebrew names — better than transliteration) and update our
 * players' nameHe.
 *
 * Walla renders the squad server-side (curl works): position-group <h3> blocks
 * of <li class="entity"><a href="/entity/ID">…<h4>Hebrew Name</h4>.
 *
 * Matching (the hard part — Walla has only Hebrew, our records have accurate
 * English): bridge via transliteration. For each of our 2026 players compute
 * translateName(English) → Hebrew, and match to the Walla player whose Hebrew
 * shares the surname token (highest similarity, one-to-one greedy). Then set
 * our nameHe = the Walla Hebrew (authoritative). This does NOT rely on our
 * current nameHe, so it fixes the wrong ones too.
 *
 * Usage:
 *   node scripts/scrape-walla-squad.js --team 563           # DRY (one team by our apiFootballId)
 *   node scripts/scrape-walla-squad.js --all                # DRY all 14
 *   node scripts/scrape-walla-squad.js --team 563 --execute
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { translateName } = require('./transliterate-players.js');

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const EXECUTE = process.argv.includes('--execute');
const ALL = process.argv.includes('--all');
const TEAM = arg('team') ? parseInt(arg('team'), 10) : null;

// Walla team id → our apiFootballId (Ligat Ha'al 2026/27; from walla-squads memory)
const WALLA_TO_AF = {
  3987: 563, 742: 657, 4008: 4481, 741: 2253, 14119: 4486, 743: 4488,
  4017: 4489, 738: 4501, 740: 4195, 750: 4505, 744: 4495, 739: 604,
  14115: 6181, 9707: 4510,
};
const AF_TO_WALLA = Object.fromEntries(Object.entries(WALLA_TO_AF).map(([w, a]) => [a, parseInt(w, 10)]));

const decode = (s) => s.replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const stripAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const heTokens = (s) => (s || '').replace(/["'.\-]/g, ' ').split(/\s+/).filter((t) => t.length > 1);
function lev(a, b) { a = a || ''; b = b || ''; const m = a.length, n = b.length; if (!m) return n; if (!n) return m; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 0; j <= n; j++) d[0][j] = j; for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const sim = (a, b) => { const L = Math.max((a || '').length, (b || '').length); return L ? 1 - lev(a, b) / L : 1; };
// Order-insensitive FULL-name similarity (sorted tokens joined). Full-name (not
// best-token) avoids surname-coincidence mispairs (two "Cohen"s scoring 1.0).
const normForMatch = (s) => heTokens(s).slice().sort().join(' ');
function nameScore(a, b) {
  const na = normForMatch(a), nb = normForMatch(b);
  if (!na || !nb) return 0;
  return sim(na, nb);
}

async function fetchWallaSquad(wallaId) {
  const res = await fetch(`https://sports.walla.co.il/team/${wallaId}/2913`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const out = [];
  const parts = html.split(/<h3>([^<]+)<\/h3>/);
  const GROUPS = new Set(['שוערים', 'הגנה', 'קישור', 'התקפה', 'מגנים', 'קשרים', 'חלוצים']);
  for (let i = 1; i < parts.length - 1; i += 2) {
    const grp = parts[i].trim();
    if (!GROUPS.has(grp)) continue;
    const re = /<li class="entity"><a href="\/entity\/(\d+)">.*?<h4>([^<]+)<\/h4>/gs;
    let m;
    while ((m = re.exec(parts[i + 1]))) out.push({ entityId: m[1], nameHe: decode(m[2]).trim(), group: grp });
  }
  return out;
}

async function reconcileTeam(af) {
  const wallaId = AF_TO_WALLA[af];
  if (!wallaId) { console.log(`  no Walla id for af=${af}`); return; }
  const team = await prisma.team.findFirst({ where: { apiFootballId: af, season: { year: 2026 } }, select: { id: true, nameHe: true } });
  if (!team) return;
  const squad = await fetchWallaSquad(wallaId);
  // ONLY current-squad players (apiFootballId set) — avoids old/departed rows
  // grabbing wrong Walla matches when our roster is bigger than Walla's.
  const ours = (await prisma.player.findMany({ where: { teamId: team.id, apiFootballId: { not: null } }, select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true, canonicalPlayerId: true } }));
  console.log(`\n=== ${team.nameHe} (af=${af}, walla=${wallaId}) — Walla ${squad.length} players, ours(current) ${ours.length} ===`);

  const THRESH = 0.72;
  const trans = new Map(ours.map((o) => [o.id, translateName(o.firstNameEn, o.lastNameEn, o.nameEn)]));
  // MUTUAL-BEST match: accept (o,w) only when w is o's best Walla AND o is w's
  // best ours, both above threshold. Prevents cascading mispairs.
  const bestWforO = new Map(); // o.id -> {w, sc}
  for (const o of ours) { let b = null, bs = 0; for (const w of squad) { const sc = nameScore(trans.get(o.id), w.nameHe); if (sc > bs) { bs = sc; b = w; } } bestWforO.set(o.id, { w: b, sc: bs }); }
  const bestOforW = new Map(); // w.entityId -> {o, sc}
  for (const w of squad) { let b = null, bs = 0; for (const o of ours) { const sc = nameScore(trans.get(o.id), w.nameHe); if (sc > bs) { bs = sc; b = o; } } bestOforW.set(w.entityId, { o: b, sc: bs }); }
  const pairs = [];
  for (const o of ours) {
    const { w, sc } = bestWforO.get(o.id);
    if (w && sc >= THRESH && bestOforW.get(w.entityId)?.o?.id === o.id) pairs.push({ o, w, score: sc });
  }
  let changed = 0;
  for (const { o, w, score } of pairs) {
    const cur = (o.nameHe || '').trim();
    if (cur !== w.nameHe) {
      console.log(`  ${o.nameEn}: "${cur}" → "${w.nameHe}" (score ${score.toFixed(2)})`);
      changed++;
      if (EXECUTE) {
        await prisma.player.update({ where: { id: o.id }, data: { nameHe: w.nameHe } }).catch(() => {});
        if (o.canonicalPlayerId) await prisma.player.update({ where: { id: o.canonicalPlayerId }, data: { nameHe: w.nameHe } }).catch(() => {});
      }
    }
  }
  const matchedW = new Set(pairs.map((p) => p.w.entityId));
  const unmatchedWalla = squad.filter((w) => !matchedW.has(w.entityId)).map((w) => w.nameHe);
  const unmatchedOurs = ours.filter((o) => !pairs.find((p) => p.o.id === o.id)).map((o) => o.nameEn);
  console.log(`  → ${changed} name changes | unmatched Walla: ${unmatchedWalla.join(', ') || '—'} | unmatched ours: ${unmatchedOurs.join(', ') || '—'}`);
}

async function main() {
  console.log(`=== scrape-walla-squad ${EXECUTE ? '(EXECUTE)' : '(DRY)'} ===`);
  const afs = ALL ? Object.values(WALLA_TO_AF) : TEAM ? [TEAM] : [];
  if (!afs.length) { console.error('Pass --team <apiFootballId> or --all'); process.exit(1); }
  for (const af of afs) { await reconcileTeam(af).catch((e) => console.error(`  err af=${af}: ${e.message}`)); await new Promise((r) => setTimeout(r, 400)); }
  console.log(EXECUTE ? '\nMode: EXECUTE — written.' : '\n[DRY] pass --execute to apply.');
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
