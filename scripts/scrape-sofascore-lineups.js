#!/usr/bin/env node
/**
 * scrape-sofascore-lineups.js — pull a match's lineups (starting XI +
 * substitutes + formation + coaches), the penalty-shootout result, and team
 * statistics when Sofascore publishes them, for games API-Football doesn't
 * cover (cup finals, Super Cup, friendlies). API-Football marks such games
 * status=PEN but leaves the shootout tally null, so Sofascore is our source.
 *
 * Why the roundabout Firecrawl route: api.sofascore.com is Cloudflare-blocked
 * for our datacenter IP (403), and puppeteer-real-browser no longer clears it
 * either. Firecrawl's `stealth` proxy renders www.sofascore.com from a
 * residential IP with the CF challenge solved; from inside that page context
 * we `executeJavascript` a same-origin fetch to the JSON API (exactly what the
 * SPA does), which returns clean, correctly-attributed JSON.
 *
 * Writes GameLineupEntry rows (role STARTER/SUBSTITUTE/COACH, participantName,
 * jerseyNumber, positionName, formation), linking to our Player rows by name
 * where possible (Hebrew display + click-through); unlinked entries fall back
 * to the Sofascore display name. Idempotent: replaces existing lineup entries
 * for the game.
 *
 * Usage:
 *   node scripts/scrape-sofascore-lineups.js --game <gameId> --url <sofascore-match-url> [--dry]
 *   node scripts/scrape-sofascore-lineups.js --game <gameId> --event <sofascoreEventId> [--dry]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const GAME_ID = arg('game', process.env.SS_GAME || null);
const URL_ARG = arg('url', process.env.SS_URL || null);
let EVENT_ID = arg('event', process.env.SS_EVENT || null);
const DRY = process.argv.includes('--dry') || process.env.SS_DRY === '1';
// Materialize ONLY the team statistics (skip lineup import) — used to enrich a
// game whose lineups already came from a better source (e.g. API-Football).
const STATS_ONLY = process.argv.includes('--stats-only');

let FC_KEY = process.env.FIRECRAWL_API_KEY;
if (!FC_KEY) {
  try {
    const e = fs.readFileSync(path.resolve(__dirname, '..', '.env'), 'utf8')
      .match(/^FIRECRAWL_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (e) FC_KEY = e[1].trim();
  } catch {}
}

if (!EVENT_ID && URL_ARG) {
  const m = URL_ARG.match(/#id:(\d+)/) || URL_ARG.match(/[?&]id=(\d+)/);
  if (m) EVENT_ID = m[1];
}

const POS_HE = { G: 'שוער', D: 'הגנה', M: 'קישור', F: 'חלוץ' };

// our Team.apiFootballId → Sofascore team id (Ligat Ha'al; used to auto-resolve
// a fixture's Sofascore event id from a team's schedule feed).
const AF_TO_SS = {
  657: 5204, 4481: 5392, 563: 5202, 2253: 5201, 4510: 5399, 4486: 86406,
  4488: 5199, 4489: 7385, 4501: 5396, 6181: 61702, 4195: 5197, 4495: 5333,
  4505: 5395, 604: 5198,
};
const stripAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => stripAccents(s).replace(/[.,'"`\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokensOf = (s) => norm(s).split(' ').filter((t) => t.length > 1); // drop single-letter initials
const firstInitial = (s) => (norm(s)[0] || '');

// Generic: render a www.sofascore.com page via Firecrawl stealth and run `script`
// (a bare async IIFE expression) inside the page context; returns its parsed
// JSON string result. This is how we reach api.sofascore.com (CF-blocked for our
// datacenter IP) — same-origin fetch from the loaded page.
async function fcEval(pageUrl, script) {
  const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: pageUrl, proxy: 'stealth', waitFor: 6000, formats: ['markdown'],
      actions: [{ type: 'wait', milliseconds: 4000 }, { type: 'executeJavascript', script }],
    }),
  });
  const text = await res.text();
  let d; try { d = JSON.parse(text); } catch { throw new Error('Firecrawl non-JSON: ' + text.slice(0, 150)); }
  if (!d.success) throw new Error('Firecrawl error: ' + (d.error || JSON.stringify(d)).slice(0, 200));
  const raw = (d.data?.actions?.javascriptReturns || [])[0]?.value;
  if (!raw) throw new Error('No JS return from Firecrawl action');
  return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw));
}

async function fetchViaFirecrawl(eventId, pageUrl) {
  const eps = ['lineups', 'managers', 'statistics'];
  // `_summary` = the base event object (carries score.penalties + team ids).
  const script =
    `(async()=>{const out={};` +
    `try{const r=await fetch('https://api.sofascore.com/api/v1/event/${eventId}');out._summary={status:r.status,body:await r.text()};}catch(e){out._summary={err:String(e)};}` +
    `for(const ep of ${JSON.stringify(eps)}){try{` +
    `const r=await fetch('https://api.sofascore.com/api/v1/event/${eventId}/'+ep);` +
    `out[ep]={status:r.status,body:await r.text()};}catch(e){out[ep]={err:String(e)};}}` +
    `return JSON.stringify(out);})()`;
  const parsed = await fcEval(pageUrl, script);
  const result = {};
  for (const ep of eps) {
    const r = parsed[ep];
    result[ep] = r && r.status === 200 ? JSON.parse(r.body) : null;
    if (r && r.status !== 200) console.log(`  · /${ep}: HTTP ${r.status} (skipped)`);
  }
  const s = parsed._summary;
  result.summary = s && s.status === 200 ? JSON.parse(s.body) : null;
  return result;
}

// Auto-resolve a fixture's Sofascore event id from a team's schedule feed:
// map one of the fixture's teams to its Sofascore id, pull last+next events,
// match by kickoff date (±1 day). Returns the event id or null.
async function resolveEventId(game, pageUrl) {
  const afIds = [game.homeTeam?.apiFootballId, game.awayTeam?.apiFootballId].filter((x) => x != null);
  const ssId = afIds.map((af) => AF_TO_SS[af]).find(Boolean);
  if (!ssId) { console.log('  · no Sofascore team mapping for either side — cannot auto-resolve'); return null; }
  const script =
    `(async()=>{const out={};for(const w of ['last','next']){try{` +
    `const r=await fetch('https://api.sofascore.com/api/v1/team/${ssId}/events/'+w+'/0');` +
    `out[w]=r.status===200?await r.text():null;}catch(e){out[w]=null;}}return JSON.stringify(out);})()`;
  const parsed = await fcEval(pageUrl, script);
  const events = [];
  for (const w of ['last', 'next']) { if (parsed[w]) { try { events.push(...(JSON.parse(parsed[w]).events || [])); } catch {} } }
  const target = new Date(game.dateTime).getTime();
  const DAY = 86400 * 1000;
  const match = events.find((e) => Math.abs(e.startTimestamp * 1000 - target) <= DAY);
  if (match) console.log(`  · resolved Sofascore event ${match.id} (${match.homeTeam?.name} v ${match.awayTeam?.name}, ${match.tournament?.name})`);
  return match ? String(match.id) : null;
}

// Flatten Sofascore's /statistics response (period "ALL") into our
// SofascoreMatchStats payload shape: [{section, label, home, away}] with the
// English group/label kept (the display panel translates known keys to Hebrew).
function buildStatsPayload(statsApi) {
  const periods = statsApi && Array.isArray(statsApi.statistics) ? statsApi.statistics : [];
  const all = periods.find((p) => p.period === 'ALL') || periods[0];
  if (!all || !Array.isArray(all.groups)) return [];
  const out = [];
  for (const g of all.groups) {
    for (const it of (g.statisticsItems || [])) {
      if (it.home == null && it.away == null) continue;
      out.push({
        section: g.groupName || 'Other',
        label: it.name || '',
        home: String(it.home ?? ''),
        away: String(it.away ?? ''),
      });
    }
  }
  return out;
}

async function materializeStats(gameId, statsApi) {
  const payload = buildStatsPayload(statsApi);
  if (!payload.length) { console.log('  · no team statistics in Sofascore response'); return 0; }
  await prisma.sofascoreMatchStats.upsert({
    where: { gameId },
    create: { gameId, payload, scrapedAt: new Date() },
    update: { payload, scrapedAt: new Date() },
  });
  console.log(`  ✓ materialized ${payload.length} team-stat rows into SofascoreMatchStats`);
  return payload.length;
}

// Build a surname-token index for one club's players (all seasons, most-recent
// first). Sofascore gives full English names; our nameEn is abbreviated
// ("O. Marciano") but lastNameEn/firstNameEn hold the full parts, so we match
// the Sofascore surname against lastNameEn tokens and disambiguate by first
// initial, preferring the most recent season.
async function buildPlayerLookup(teamNameHe, teamNameEn) {
  const players = await prisma.player.findMany({
    where: { team: { OR: [{ nameHe: teamNameHe }, { nameEn: teamNameEn }] } },
    select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true, team: { select: { season: { select: { year: true } } } } },
    orderBy: { team: { season: { year: 'desc' } } },
  });
  const index = new Map(); // surname token → [{ id, fi, year }]
  for (const p of players) {
    const year = p.team?.season?.year || 0;
    const fi = firstInitial(p.firstNameEn || p.nameEn);
    const surTokens = tokensOf(p.lastNameEn || p.nameEn);
    for (const tok of new Set(surTokens)) {
      if (!index.has(tok)) index.set(tok, []);
      index.get(tok).push({ id: p.id, fi, year });
    }
  }
  return { index, count: players.length };
}

function linkPlayer(lookup, ssName) {
  const toks = tokensOf(ssName);
  if (!toks.length) return null;
  const ssLast = toks[toks.length - 1];
  const ssFi = firstInitial(ssName);
  const cands = lookup.index.get(ssLast);
  if (!cands || !cands.length) return null;
  const withFi = cands.filter((c) => c.fi === ssFi);
  const pool = withFi.length ? withFi : cands;
  pool.sort((a, b) => b.year - a.year); // most recent first
  return pool[0].id;
}

function buildEntries(sideData, teamId, lookup, coachName) {
  const formation = sideData?.formation || null;
  const entries = [];
  for (const e of sideData?.players || []) {
    const name = e.player?.name || e.player?.shortName || 'שחקן';
    const jersey = parseInt(e.jerseyNumber ?? e.shirtNumber ?? e.player?.jerseyNumber, 10);
    const pos = e.position || e.player?.position || null;
    entries.push({
      role: e.substitute ? 'SUBSTITUTE' : 'STARTER',
      participantType: 'PLAYER',
      participantName: name,
      jerseyNumber: Number.isFinite(jersey) ? jersey : null,
      positionName: pos ? (POS_HE[pos] || pos) : null,
      formation,
      teamId,
      playerId: linkPlayer(lookup, name),
    });
  }
  if (coachName) {
    entries.push({ role: 'COACH', participantType: 'COACH', participantName: coachName, formation, teamId, playerId: null, jerseyNumber: null, positionName: null });
  }
  return entries;
}

async function main() {
  if (!GAME_ID) {
    console.error('Usage: --game <gameId> [--url <sofascore-match-url> | --event <id>] [--dry]');
    console.error('  Without --url/--event the Sofascore event id is auto-resolved from the fixture.');
    process.exit(1);
  }
  if (!FC_KEY) { console.error('Missing FIRECRAWL_API_KEY'); process.exit(1); }

  const game = await prisma.game.findUnique({
    where: { id: GAME_ID },
    select: {
      id: true, homeTeamId: true, awayTeamId: true, dateTime: true,
      homeTeam: { select: { nameHe: true, nameEn: true, apiFootballId: true } },
      awayTeam: { select: { nameHe: true, nameEn: true, apiFootballId: true } },
    },
  });
  if (!game) { console.error(`No game ${GAME_ID}`); process.exit(1); }

  const pageUrl = URL_ARG || 'https://www.sofascore.com/';
  if (!EVENT_ID) {
    console.log(`Auto-resolving Sofascore event id for ${game.homeTeam.nameHe} vs ${game.awayTeam.nameHe} (${new Date(game.dateTime).toISOString().slice(0,10)}) …`);
    EVENT_ID = await resolveEventId(game, pageUrl);
    if (!EVENT_ID) { console.error('Could not auto-resolve a Sofascore event id — pass --event or --url.'); process.exit(1); }
  }
  console.log(`Game: ${game.homeTeam.nameHe} vs ${game.awayTeam.nameHe} (event ${EVENT_ID})`);

  console.log(`Fetching Sofascore via Firecrawl (stealth) …`);
  const data = await fetchViaFirecrawl(EVENT_ID, pageUrl);

  // Stats-only: materialize team statistics and stop (leave lineups untouched —
  // used when a better lineup source already populated the game).
  if (STATS_ONLY) {
    if (DRY) {
      console.log('[dry-run] stats payload preview:');
      console.log(JSON.stringify(buildStatsPayload(data.statistics).slice(0, 8), null, 2));
    } else {
      await materializeStats(GAME_ID, data.statistics);
    }
    await prisma.$disconnect();
    return;
  }

  const lineups = data.lineups;
  if (!lineups || (!lineups.home?.players?.length && !lineups.away?.players?.length)) {
    console.error('No lineups returned from Sofascore for this event.');
    process.exit(1);
  }

  const [homeLookup, awayLookup] = await Promise.all([
    buildPlayerLookup(game.homeTeam.nameHe, game.homeTeam.nameEn),
    buildPlayerLookup(game.awayTeam.nameHe, game.awayTeam.nameEn),
  ]);
  console.log(`Player pools — home: ${homeLookup.count}, away: ${awayLookup.count}`);

  const mgr = data.managers;
  const homeCoach = mgr?.homeManager?.name || null;
  const awayCoach = mgr?.awayManager?.name || null;

  const entries = [
    ...buildEntries(lineups.home, game.homeTeamId, homeLookup, homeCoach),
    ...buildEntries(lineups.away, game.awayTeamId, awayLookup, awayCoach),
  ];

  const linked = entries.filter((e) => e.playerId).length;
  const players = entries.filter((e) => e.role !== 'COACH').length;
  console.log(`\nParsed ${players} players (${linked} linked to DB), formations ${lineups.home?.formation}/${lineups.away?.formation}, coaches ${homeCoach || '—'}/${awayCoach || '—'}`);

  // Penalty shootout: Sofascore's base event carries score.penalties. Map to
  // OUR home/away — align by Sofascore team id (via AF_TO_SS) so a home/away
  // flip vs Sofascore can't reverse the result; fall back to positional.
  let penUpdate = null;
  const evt = data.summary && data.summary.event;
  const rawHome = evt && evt.homeScore ? evt.homeScore.penalties : undefined;
  const rawAway = evt && evt.awayScore ? evt.awayScore.penalties : undefined;
  if (typeof rawHome === 'number' && typeof rawAway === 'number') {
    const ourAwaySs = AF_TO_SS[game.awayTeam.apiFootballId];
    const flipped = !!(evt.homeTeam && ourAwaySs != null && evt.homeTeam.id === ourAwaySs);
    penUpdate = { homePenalty: flipped ? rawAway : rawHome, awayPenalty: flipped ? rawHome : rawAway };
    console.log(`Penalty shootout: ${game.homeTeam.nameHe} ${penUpdate.homePenalty}-${penUpdate.awayPenalty} ${game.awayTeam.nameHe}${flipped ? '  (orientation flipped vs Sofascore — corrected by team id)' : ''}`);
  }

  for (const [label, side, teamId] of [['HOME', lineups.home, game.homeTeamId], ['AWAY', lineups.away, game.awayTeamId]]) {
    console.log(`\n${label} (${label === 'HOME' ? game.homeTeam.nameHe : game.awayTeam.nameHe}) — ${side?.formation || '?'}`);
    for (const e of entries.filter((x) => x.teamId === teamId && x.role !== 'COACH')) {
      console.log(`  ${e.role === 'STARTER' ? '⚽' : '🔁'} #${e.jerseyNumber ?? '?'} ${e.positionName || ''} ${e.participantName} ${e.playerId ? '→ ' + e.playerId : '(unlinked)'}`);
    }
  }

  if (DRY) { console.log('\n[dry-run] no DB writes.'); await prisma.$disconnect(); return; }

  await prisma.$transaction([
    prisma.gameLineupEntry.deleteMany({ where: { gameId: GAME_ID } }),
    ...entries.map((e) => prisma.gameLineupEntry.create({ data: { gameId: GAME_ID, ...e } })),
  ], { timeout: 60_000 });
  console.log(`\n✓ Wrote ${entries.length} lineup entries to game ${GAME_ID}`);

  if (penUpdate) {
    await prisma.game.update({ where: { id: GAME_ID }, data: penUpdate });
    console.log(`✓ Set penalty shootout ${penUpdate.homePenalty}-${penUpdate.awayPenalty}`);
  }

  // Team statistics — only present for some matches; fill when available.
  if (data.statistics) {
    await materializeStats(GAME_ID, data.statistics);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
