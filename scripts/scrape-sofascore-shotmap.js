'use strict';
/**
 * scrape-sofascore-shotmap.js — pull Sofascore shot maps (+ full match stats)
 * for a game or a tracked team's season, via Firecrawl stealth. Sofascore's API
 * is Cloudflare-blocked for our datacenter IP, so we render www.sofascore.com
 * through Firecrawl's residential stealth proxy and same-origin-fetch the API
 * from inside the page (same pattern as scrape-sofascore-lineups.js).
 *
 * Stores into SofascoreMatchStats:
 *   - shotmap: normalized shots [{isHome, player, min, outcome, situation,
 *     bodyPart, x, y, goalMouth}] for the ShotMap component.
 *   - payload: the ~40-metric stats panel [{section,label,home,away}].
 * Both are oriented to OUR game's home/away (flipped when Sofascore lists the
 * teams the other way round — happens on neutral-venue European ties).
 * Sofascore carries no per-shot xG for lower-tier comps (field absent; team xG
 * 0.00), so we store geometry + outcome only.
 *
 * Usage:
 *   node scripts/scrape-sofascore-shotmap.js --game <gameId> [--event <ssEventId>] [--dry]
 *   node scripts/scrape-sofascore-shotmap.js --team 563 --season 2026 [--limit N] [--dry]
 * Env fallbacks: SS_GAME, SS_EVENT, SS_TEAM, SS_SEASON, SS_DRY.
 */
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const GAME_ID = arg('game', process.env.SS_GAME || null);
const EVENT_ID = arg('event', process.env.SS_EVENT || null);
const TEAM_AF = parseInt(arg('team', process.env.SS_TEAM || '0'), 10) || null;
const SEASON = parseInt(arg('season', process.env.SS_SEASON || '0'), 10) || null;
const LIMIT = parseInt(arg('limit', '0'), 10) || null;
const DRY = process.argv.includes('--dry') || process.env.SS_DRY === '1';

let FC = process.env.FIRECRAWL_API_KEY;
if (!FC) { try { const m = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8').match(/^FIRECRAWL_API_KEY\s*=\s*"?([^"\n]+)"?/m); if (m) FC = m[1].trim(); } catch {} }

// our Team.apiFootballId → Sofascore team id (from scrape-sofascore-lineups.js)
const AF_TO_SS = { 657: 5204, 4481: 5392, 563: 5202, 2253: 5201, 4510: 5399, 4486: 86406, 4488: 5199, 4489: 7385, 4501: 5396, 6181: 61702, 4195: 5197, 4495: 5333, 4505: 5395, 604: 5198 };
const RENDER_PAGE = 'https://www.sofascore.com/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Render a Sofascore page via Firecrawl stealth and same-origin-fetch every URL
// in ONE call. Returns parsed JSON per URL (null on non-200).
async function fcFetch(urls) {
  if (!FC) throw new Error('Missing FIRECRAWL_API_KEY');
  const script =
    `(async()=>{const U=${JSON.stringify(urls)};const out=[];` +
    `for(const u of U){try{const r=await fetch(u);out.push({status:r.status,body:await r.text()});}catch(e){out.push({status:0,body:'',error:String(e)});}}` +
    `return JSON.stringify(out);})()`;
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FC}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: RENDER_PAGE, proxy: 'stealth', waitFor: 6000, formats: ['markdown'], actions: [{ type: 'wait', milliseconds: 3500 }, { type: 'executeJavascript', script }] }),
  });
  const d = JSON.parse(await res.text());
  if (!d.success) throw new Error('Firecrawl: ' + JSON.stringify(d.error || d).slice(0, 220));
  const raw = (d.data && d.data.actions && d.data.actions.javascriptReturns || [])[0];
  const arr = JSON.parse(raw && raw.value);
  return arr.map((x) => (x && x.status === 200 ? (() => { try { return JSON.parse(x.body); } catch { return null; } })() : null));
}

function buildStatsPayload(statsApi, flip) {
  const periods = statsApi && Array.isArray(statsApi.statistics) ? statsApi.statistics : [];
  const all = periods.find((p) => p.period === 'ALL') || periods[0];
  if (!all || !Array.isArray(all.groups)) return [];
  const out = [];
  for (const g of all.groups) for (const it of (g.statisticsItems || [])) {
    if (it.home == null && it.away == null) continue;
    const home = String(it.home ?? '');
    const away = String(it.away ?? '');
    out.push({ section: g.groupName || 'Other', label: it.name || '', home: flip ? away : home, away: flip ? home : away });
  }
  return out;
}

// Emit the SAME normalized shape the ShotMap component uses (px/py 0-100 with
// our home attacking the right goal). Sofascore normalises every shot to attack
// x≈0, so our home → px=100-x, our away → px=x (mirror y). No per-shot xG.
const BODY_TO_TYPE = { head: 'Header', 'left-foot': 'Left footed shot', 'right-foot': 'Right footed shot' };
function buildShotmap(shotApi, flip) {
  const shots = shotApi && Array.isArray(shotApi.shotmap) ? shotApi.shotmap : [];
  return shots.map((s) => {
    const ourHome = flip ? !s.isHome : !!s.isHome;
    const x = s.playerCoordinates ? s.playerCoordinates.x : null;
    const y = s.playerCoordinates ? s.playerCoordinates.y : null;
    if (x == null || y == null) return null;
    return {
      isHome: ourHome,
      player: (s.player && (s.player.name || s.player.shortName)) || '',
      min: s.time ?? null,
      outcome: s.shotType || 'miss', // goal | save | miss | block | post
      xg: null,
      xgot: null,
      situation: s.situation || null,
      shotType: BODY_TO_TYPE[s.bodyPart] || null,
      px: ourHome ? 100 - x : x,
      py: ourHome ? y : 100 - y,
    };
  }).filter(Boolean);
}

// Load our completed games for a tracked team + season, with both teams' AF ids.
async function loadTeamGames(teamAf, season) {
  const s = await prisma.season.findFirst({ where: { year: season }, select: { id: true } });
  if (!s) return [];
  const teams = await prisma.team.findMany({ where: { apiFootballId: teamAf, seasonId: s.id }, select: { id: true } });
  const teamIds = teams.map((t) => t.id);
  return prisma.game.findMany({
    where: { seasonId: s.id, status: 'COMPLETED', OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] },
    select: { id: true, dateTime: true, homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } }, awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } } },
    orderBy: { dateTime: 'desc' },
  });
}

async function upsert(gameId, eventId, payload, shotmap) {
  const data = { matchUrl: `https://www.sofascore.com/event/${eventId}`, scrapedAt: new Date() };
  if (payload && payload.length) data.payload = payload;
  if (shotmap && shotmap.length) data.shotmap = shotmap;
  // never blank an existing payload with an empty pull
  const existing = await prisma.sofascoreMatchStats.findUnique({ where: { gameId }, select: { payload: true } });
  const createPayload = data.payload || existing?.payload || [];
  await prisma.sofascoreMatchStats.upsert({
    where: { gameId },
    create: { gameId, payload: createPayload, shotmap: data.shotmap || undefined, matchUrl: data.matchUrl },
    update: data,
  });
}

async function main() {
  console.log(`=== sofascore shotmap ${DRY ? '(DRY)' : ''} ===`);
  if (!FC) { console.error('Missing FIRECRAWL_API_KEY'); process.exit(1); }

  // ── Single game ──
  if (GAME_ID) {
    const game = await prisma.game.findUnique({ where: { id: GAME_ID }, select: { id: true, homeTeam: { select: { apiFootballId: true, nameHe: true } }, awayTeam: { select: { apiFootballId: true, nameHe: true } } } });
    if (!game) { console.error('game not found'); process.exit(1); }
    const trackedAf = AF_TO_SS[game.homeTeam.apiFootballId] ? game.homeTeam.apiFootballId : game.awayTeam.apiFootballId;
    const trackedSs = AF_TO_SS[trackedAf];
    let eventId = EVENT_ID;
    let ssHomeId = null;
    if (!eventId) {
      if (!trackedSs) { console.error('no Sofascore id for either team; pass --event'); process.exit(1); }
      const [last, next] = await fcFetch([`https://api.sofascore.com/api/v1/team/${trackedSs}/events/last/0`, `https://api.sofascore.com/api/v1/team/${trackedSs}/events/next/0`]);
      const evs = [...((last && last.events) || []), ...((next && next.events) || [])];
      const gd = game && (await prisma.game.findUnique({ where: { id: GAME_ID }, select: { dateTime: true } })).dateTime;
      const target = gd ? new Date(gd).toISOString().slice(0, 10) : null;
      const match = evs.find((e) => new Date(e.startTimestamp * 1000).toISOString().slice(0, 10) === target)
        || evs.find((e) => Math.abs(e.startTimestamp * 1000 - new Date(gd).getTime()) < 36 * 3600 * 1000);
      if (!match) { console.error('could not resolve Sofascore event by date; pass --event'); process.exit(1); }
      eventId = match.id; ssHomeId = match.homeTeam && match.homeTeam.id;
    }
    if (ssHomeId == null) { const [ev] = await fcFetch([`https://api.sofascore.com/api/v1/event/${eventId}`]); ssHomeId = ev && ev.event && ev.event.homeTeam && ev.event.homeTeam.id; }
    const ourHomeTracked = game.homeTeam.apiFootballId === trackedAf;
    const ssHomeTracked = ssHomeId === trackedSs;
    const flip = ourHomeTracked !== ssHomeTracked;
    const [stats, shot] = await fcFetch([`https://api.sofascore.com/api/v1/event/${eventId}/statistics`, `https://api.sofascore.com/api/v1/event/${eventId}/shotmap`]);
    const payload = buildStatsPayload(stats, flip);
    const shotmap = buildShotmap(shot, flip);
    console.log(`  game ${GAME_ID} ← ss event ${eventId} | stats=${payload.length} shots=${shotmap.length} flip=${flip}`);
    if (!DRY) await upsert(GAME_ID, eventId, payload, shotmap);
    await prisma.$disconnect();
    return;
  }

  // ── Team season batch ──
  if (TEAM_AF && SEASON) {
    const trackedSs = AF_TO_SS[TEAM_AF];
    if (!trackedSs) { console.error(`no Sofascore id for team af=${TEAM_AF}`); process.exit(1); }
    let games = await loadTeamGames(TEAM_AF, SEASON);
    if (LIMIT) games = games.slice(0, LIMIT);
    console.log(`  ${games.length} completed games for af=${TEAM_AF} season=${SEASON}`);
    const [last, next] = await fcFetch([`https://api.sofascore.com/api/v1/team/${trackedSs}/events/last/0`, `https://api.sofascore.com/api/v1/team/${trackedSs}/events/next/0`]);
    const evs = [...((last && last.events) || []), ...((next && next.events) || [])];
    const byDate = new Map();
    for (const e of evs) byDate.set(new Date(e.startTimestamp * 1000).toISOString().slice(0, 10), e);
    let ok = 0, miss = 0;
    for (const g of games) {
      const target = g.dateTime ? new Date(g.dateTime).toISOString().slice(0, 10) : null;
      const ev = target ? byDate.get(target) : null;
      const label = `${g.homeTeam.nameHe || g.homeTeam.nameEn} vs ${g.awayTeam.nameHe || g.awayTeam.nameEn} (${target})`;
      if (!ev) { console.log(`  · SKIP ${label} — no Sofascore event on that date`); miss++; continue; }
      const ourHomeTracked = g.homeTeam.apiFootballId === TEAM_AF;
      const ssHomeTracked = (ev.homeTeam && ev.homeTeam.id) === trackedSs;
      const flip = ourHomeTracked !== ssHomeTracked;
      try {
        const [stats, shot] = await fcFetch([`https://api.sofascore.com/api/v1/event/${ev.id}/statistics`, `https://api.sofascore.com/api/v1/event/${ev.id}/shotmap`]);
        const payload = buildStatsPayload(stats, flip);
        const shotmap = buildShotmap(shot, flip);
        console.log(`  ✓ ${label} ← ss ${ev.id} | stats=${payload.length} shots=${shotmap.length} flip=${flip}`);
        if (!DRY && (payload.length || shotmap.length)) await upsert(g.id, ev.id, payload, shotmap);
        ok++;
      } catch (e) { console.log(`  ✗ ${label}: ${e.message}`); }
      await sleep(400);
    }
    console.log(`Done. matched=${ok} skipped=${miss}`);
    await prisma.$disconnect();
    return;
  }

  console.error('Pass --game <id> or --team <af> --season <year>.');
  process.exit(1);
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
