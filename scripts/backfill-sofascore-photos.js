#!/usr/bin/env node
/**
 * backfill-sofascore-photos.js — download player photos from Sofascore for
 * players imported by scrape-sofascore-squads.js (which stores
 * additionalInfo.sofascoreId but skips photos, since img.sofascore.com is
 * Cloudflare-blocked for our datacenter IP).
 *
 * Fetches images as base64 from inside a Firecrawl stealth page context (the
 * residential IP reaches img.sofascore.com), writes them under
 * public/uploads/players/<year>/<team-slug>/, and sets Player.photoUrl.
 * A pm2 restart is needed afterwards for Next to serve the new files.
 *
 * Usage:
 *   node scripts/backfill-sofascore-photos.js                 # dry-run, 2026
 *   node scripts/backfill-sofascore-photos.js --execute
 *   node scripts/backfill-sofascore-photos.js --team 563 --execute   # one club
 *   node scripts/backfill-sofascore-photos.js --limit 20 --execute   # cap
 */
'use strict';
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '.env'));

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const SEASON_YEAR = parseInt(arg('season', '2026'), 10);
const TEAM_AF = arg('team', null) ? parseInt(arg('team'), 10) : null;
const LIMIT = parseInt(arg('limit', '0'), 10);
const BATCH = parseInt(arg('batch', '10'), 10);
const EXECUTE = process.argv.includes('--execute');
const FC_KEY = process.env.FIRECRAWL_API_KEY;

const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');
const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const extFromCt = (ct) => (ct?.includes('png') ? '.png' : ct?.includes('webp') ? '.webp' : '.jpg');

// Fetch a batch of player images as base64 from inside the Firecrawl page.
async function fetchImages(ids) {
  const script =
    `(async()=>{const out={};for(const id of ${JSON.stringify(ids)}){try{` +
    `const r=await fetch('https://img.sofascore.com/api/v1/player/'+id+'/image');` +
    `if(r.status!==200){out[id]={status:r.status};continue;}` +
    `const b=new Uint8Array(await r.arrayBuffer());let s='';for(let i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);` +
    `out[id]={status:200,ct:r.headers.get('content-type'),b64:btoa(s)};}catch(e){out[id]={err:String(e)};}}` +
    `return JSON.stringify(out);})()`;
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: 'https://www.sofascore.com/football/tournament/israel/ligat-haal/266',
      proxy: 'stealth', waitFor: 5000, formats: ['markdown'],
      actions: [{ type: 'wait', milliseconds: 3500 }, { type: 'executeJavascript', script }],
    }),
  });
  const text = await res.text();
  let d; try { d = JSON.parse(text); } catch { throw new Error('Firecrawl non-JSON: ' + text.slice(0, 120)); }
  if (!d.success) throw new Error('Firecrawl error: ' + (d.error || '').slice(0, 150));
  const raw = (d.data?.actions?.javascriptReturns || [])[0]?.value;
  if (!raw) throw new Error('no JS return');
  return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
}

async function main() {
  if (!FC_KEY) { console.error('Missing FIRECRAWL_API_KEY'); process.exit(1); }
  const season = await prisma.season.findUnique({ where: { year: SEASON_YEAR } });
  if (!season) { console.error(`No season ${SEASON_YEAR}`); process.exit(1); }

  const where = { team: { seasonId: season.id } };
  if (TEAM_AF) where.team = { seasonId: season.id, apiFootballId: TEAM_AF };
  const all = await prisma.player.findMany({
    where,
    select: { id: true, nameEn: true, photoUrl: true, additionalInfo: true, team: { select: { nameEn: true } } },
  });
  let targets = all.filter((p) => p.additionalInfo?.sofascoreId && (!p.photoUrl || p.photoUrl.includes('sofascore') || !p.photoUrl.startsWith('/uploads')));
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  console.log(`Season ${SEASON_YEAR}: ${targets.length} players need photos${TEAM_AF ? ` (team af=${TEAM_AF})` : ''} ${EXECUTE ? '(EXECUTE)' : '(DRY-RUN)'}`);
  if (!targets.length) { await prisma.$disconnect(); return; }

  let saved = 0, missing = 0, failed = 0;
  for (let i = 0; i < targets.length; i += BATCH) {
    const batch = targets.slice(i, i + BATCH);
    const byId = new Map(batch.map((p) => [String(p.additionalInfo.sofascoreId), p]));
    console.log(`\nbatch ${i / BATCH + 1}/${Math.ceil(targets.length / BATCH)} — ${batch.length} images`);
    if (!EXECUTE) { batch.forEach((p) => console.log(`  · ${p.nameEn} (ss=${p.additionalInfo.sofascoreId})`)); continue; }
    let images;
    try { images = await fetchImages(batch.map((p) => Number(p.additionalInfo.sofascoreId))); }
    catch (e) { console.error(`  ✗ batch failed: ${e.message}`); failed += batch.length; continue; }
    for (const [ssId, o] of Object.entries(images)) {
      const p = byId.get(ssId);
      if (!p) continue;
      if (o.status !== 200 || !o.b64) { missing++; continue; }
      try {
        const buf = Buffer.from(o.b64, 'base64');
        if (buf.length < 500) { missing++; continue; } // guard against empty/placeholder stubs
        const rel = path.join('uploads', 'players', String(SEASON_YEAR), slugify(p.team.nameEn), `${p.id}-${slugify(p.nameEn)}${extFromCt(o.ct)}`);
        const abs = path.resolve(PUBLIC_DIR, rel);
        if (!abs.startsWith(path.resolve(PUBLIC_DIR, 'uploads'))) { failed++; continue; }
        await fsp.mkdir(path.dirname(abs), { recursive: true });
        await fsp.writeFile(abs, buf);
        await prisma.player.update({ where: { id: p.id }, data: { photoUrl: `/${rel.replace(/\\/g, '/')}` } });
        saved++;
      } catch (e) { console.error(`  ✗ ${p.nameEn}: ${e.message}`); failed++; }
    }
    console.log(`  running totals — saved=${saved} missing=${missing} failed=${failed}`);
  }

  console.log(`\nDONE — saved=${saved}, no-image=${missing}, failed=${failed}`);
  if (EXECUTE && saved > 0) console.log('→ Run `pm2 restart hbstats` so Next serves the new photos.');
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
