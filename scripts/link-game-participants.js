/**
 * link-game-participants.js — back-link a game's lineup entries + events to our
 * Player records by NAME, for participants that arrived unlinked (playerId null).
 *
 * Why: the API-Football import links players by apiFootballId. Squads created
 * via the Sofascore importer have NO apiFootballId, so their players stay
 * unlinked and render as the raw English participantName with no photo (e.g.
 * Hapoel Beer Sheva's 2026 squad). This fills playerId by surname-token +
 * first-initial matching (same logic as scrape-sofascore-lineups.js), scoped to
 * the entry's team. It ONLY sets rows where playerId is null — never unlinks —
 * so already-linked participants (e.g. API-Football-sourced opponents) are safe.
 *
 * Usage:
 *   node scripts/link-game-participants.js --game <gameId> [--dry]
 *   SS_GAME=<id> SS_DRY=1 node scripts/link-game-participants.js
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const GAME_ID = arg('game', process.env.SS_GAME || null);
const DRY = process.argv.includes('--dry') || process.env.SS_DRY === '1';

const stripAccents = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s) => stripAccents(s).replace(/[.,'"`\-]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokensOf = (s) => norm(s).split(' ').filter((t) => t.length > 1);
const firstInitial = (s) => (norm(s)[0] || '');

// Surname-token index for one club's players (all seasons, most-recent first).
async function buildLookup(teamNameHe, teamNameEn) {
  const players = await prisma.player.findMany({
    where: { team: { OR: [{ nameHe: teamNameHe }, { nameEn: teamNameEn }] } },
    select: { id: true, nameHe: true, nameEn: true, firstNameEn: true, lastNameEn: true, team: { select: { season: { select: { year: true } } } } },
    orderBy: { team: { season: { year: 'desc' } } },
  });
  const index = new Map();
  for (const p of players) {
    const year = p.team?.season?.year || 0;
    const fi = firstInitial(p.firstNameEn || p.nameEn);
    for (const tok of new Set(tokensOf(p.lastNameEn || p.nameEn))) {
      if (!index.has(tok)) index.set(tok, []);
      index.get(tok).push({ id: p.id, fi, year });
    }
  }
  return { index, count: players.length };
}

function linkByName(lookup, name) {
  const toks = tokensOf(name);
  if (!toks.length) return null;
  const cands = lookup.index.get(toks[toks.length - 1]);
  if (!cands || !cands.length) return null;
  const fi = firstInitial(name);
  const withFi = cands.filter((c) => c.fi === fi);
  const pool = withFi.length ? withFi : cands;
  pool.sort((a, b) => b.year - a.year);
  return pool[0].id;
}

async function main() {
  if (!GAME_ID) { console.error('Usage: --game <gameId> [--dry]'); process.exit(1); }
  const game = await prisma.game.findUnique({
    where: { id: GAME_ID },
    select: {
      id: true, homeTeamId: true, awayTeamId: true,
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
    },
  });
  if (!game) { console.error(`No game ${GAME_ID}`); process.exit(1); }

  const [homeLookup, awayLookup] = await Promise.all([
    buildLookup(game.homeTeam.nameHe, game.homeTeam.nameEn),
    buildLookup(game.awayTeam.nameHe, game.awayTeam.nameEn),
  ]);
  const lookupFor = (teamId) => (teamId === game.homeTeamId ? homeLookup : awayLookup);
  console.log(`Pools — ${game.homeTeam.nameHe}: ${homeLookup.count}, ${game.awayTeam.nameHe}: ${awayLookup.count}`);

  // Lineup entries
  const entries = await prisma.gameLineupEntry.findMany({
    where: { gameId: GAME_ID, playerId: null, participantName: { not: null } },
    select: { id: true, teamId: true, participantName: true },
  });
  let lnLinked = 0;
  for (const e of entries) {
    const pid = linkByName(lookupFor(e.teamId), e.participantName);
    if (!pid) { console.log(`  · lineup unmatched: ${e.participantName}`); continue; }
    console.log(`  ✓ lineup ${e.participantName} → ${pid}`);
    if (!DRY) await prisma.gameLineupEntry.update({ where: { id: e.id }, data: { playerId: pid } });
    lnLinked++;
  }

  // Events — primary (participantName) + related (relatedParticipantName)
  const events = await prisma.gameEvent.findMany({
    where: { gameId: GAME_ID, OR: [{ playerId: null, participantName: { not: null } }, { relatedPlayerId: null, relatedParticipantName: { not: null } }] },
    select: { id: true, teamId: true, playerId: true, relatedPlayerId: true, participantName: true, relatedParticipantName: true },
  });
  let evLinked = 0;
  for (const ev of events) {
    const lk = lookupFor(ev.teamId);
    const data = {};
    if (!ev.playerId && ev.participantName) { const pid = linkByName(lk, ev.participantName); if (pid) data.playerId = pid; }
    if (!ev.relatedPlayerId && ev.relatedParticipantName) { const rid = linkByName(lk, ev.relatedParticipantName); if (rid) data.relatedPlayerId = rid; }
    if (Object.keys(data).length) {
      console.log(`  ✓ event ${ev.participantName || ''}${ev.relatedParticipantName ? ' / ' + ev.relatedParticipantName : ''} → ${JSON.stringify(data)}`);
      if (!DRY) await prisma.gameEvent.update({ where: { id: ev.id }, data });
      evLinked++;
    }
  }

  console.log(`\n${DRY ? '[dry-run] would link' : 'Linked'} ${lnLinked} lineup entries + ${evLinked} events.`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
