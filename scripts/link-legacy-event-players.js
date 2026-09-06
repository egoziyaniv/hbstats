'use strict';
/**
 * link-legacy-event-players.js — attach playerId to the pre-2016 game events.
 *
 * The historical import stored each event's scorer as free text (participantName) and
 * never resolved it to a Player row, so every goal before 2016 counted as nobody's:
 * אליניב ברדה showed 2 goals in 111 Beer Sheva appearances. The events are there, the
 * players are there, only the link is missing.
 *
 * Matching is exact nameHe within the SAME teamId. A teamId is one squad in one season,
 * so an exact name match inside it cannot be a different person; where a squad somehow
 * holds two players with the identical name the event is left alone rather than guessed.
 *
 * Fills playerId from participantName and relatedPlayerId from relatedParticipantName
 * (the assisting / substituted player). Never overwrites a link that already exists.
 *
 * Run: node scripts/link-legacy-event-players.js [--apply]
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const norm = (s) => (s || '').replace(/['"׳״]/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  const candidates = await prisma.gameEvent.findMany({
    where: {
      teamId: { not: null },
      OR: [
        { playerId: null, participantName: { not: null } },
        { relatedPlayerId: null, relatedParticipantName: { not: null } },
      ],
    },
    select: {
      id: true, teamId: true,
      playerId: true, participantName: true,
      relatedPlayerId: true, relatedParticipantName: true,
    },
  });
  console.log(`events missing a link: ${candidates.length}`);
  if (candidates.length === 0) { await prisma.$disconnect(); return; }

  // Squad rosters, one lookup per team involved.
  const teamIds = [...new Set(candidates.map((c) => c.teamId))];
  const roster = new Map(); // teamId -> Map<normalisedName, playerId | AMBIGUOUS>
  const AMBIGUOUS = Symbol('ambiguous');
  const CHUNK = 500;
  for (let i = 0; i < teamIds.length; i += CHUNK) {
    const players = await prisma.player.findMany({
      where: { teamId: { in: teamIds.slice(i, i + CHUNK) } },
      select: { id: true, teamId: true, nameHe: true },
    });
    for (const p of players) {
      const byName = roster.get(p.teamId) ?? new Map();
      const key = norm(p.nameHe);
      byName.set(key, byName.has(key) ? AMBIGUOUS : p.id);
      roster.set(p.teamId, byName);
    }
  }

  const resolve = (teamId, name) => {
    const hit = roster.get(teamId)?.get(norm(name));
    return hit && hit !== AMBIGUOUS ? hit : null;
  };

  let primary = 0, related = 0, ambiguous = 0, unmatched = 0;
  const updates = [];
  for (const e of candidates) {
    const data = {};
    if (!e.playerId && e.participantName) {
      const id = resolve(e.teamId, e.participantName);
      if (id) { data.playerId = id; primary++; }
      else if (roster.get(e.teamId)?.get(norm(e.participantName))) ambiguous++;
      else unmatched++;
    }
    if (!e.relatedPlayerId && e.relatedParticipantName) {
      const id = resolve(e.teamId, e.relatedParticipantName);
      if (id) { data.relatedPlayerId = id; related++; }
    }
    if (Object.keys(data).length) updates.push({ id: e.id, data });
  }

  console.log(
    `resolvable: ${primary} scorers/bookings + ${related} related` +
    ` | ambiguous (same name twice in a squad): ${ambiguous} | no match in squad: ${unmatched}`,
  );

  if (!APPLY) {
    console.log('\nDRY RUN — re-run with --apply to write');
    await prisma.$disconnect();
    return;
  }

  let done = 0;
  for (const u of updates) {
    await prisma.gameEvent.update({ where: { id: u.id }, data: u.data });
    if (++done % 2000 === 0) console.log(`  ${done}/${updates.length}`);
  }
  console.log(`\nAPPLIED — ${done} events linked`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
