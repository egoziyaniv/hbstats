#!/usr/bin/env node
'use strict';
/**
 * Fill one game from a hand-entered sheet (JSON): lineups, coaches, substitutions, cards,
 * assists and missing match details. For data the owner supplies by hand, e.g. a screenshot
 * of a game page.
 *
 *  - fills, never overwrites: an event already on the game (same team, type, minute, player) is
 *    kept and only completed (an assist added to a goal); a field already set is left alone and
 *    reported when the sheet disagrees;
 *  - players: a name is looked up in that season's team (exactly, or through the sheet's
 *    `aliases` → the spelling already in the DB); a new name becomes a player of that season's
 *    team only — nothing is linked across seasons (the player-identity rule);
 *  - every change goes to data_import_changes under the sheet's `source`, so a batch can be
 *    rolled back.
 *
 * Sheet: { gameId, source, sourceLabelHe, sourceRef?, kickoffIsrael?: "HH:MM", roundNameHe?,
 *   attendance?, assistantRefereesHe?: [], aliases?: {name: dbName},
 *   home|away: { coach?, starters: [{name, number?, pos?, captain?}], subs: [...] },
 *   (OWN_GOAL: `team` is the side that benefits, `player` is from the other side)
 *   events: [{ minute, team: "home"|"away", type: "SUB"|"YELLOW_CARD"|"RED_CARD"|"GOAL"|"PENALTY_GOAL"|"OWN_GOAL",
 *              player, in?, out?, assist? }] }
 *
 * Usage: node scripts/manual-import/game-sheet.js <sheet.json> [--apply]
 */
const fs = require('fs');
const path = require('path');

for (const line of (fs.existsSync(path.resolve(__dirname, '../../.env')) ? fs.readFileSync(path.resolve(__dirname, '../../.env'), 'utf-8') : '').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
}
const { PrismaClient } = require('@prisma/client');

const file = process.argv[2];
const APPLY = process.argv.includes('--apply');
if (!file) { console.error('usage: game-sheet.js <sheet.json> [--apply]'); process.exit(1); }
const sheet = JSON.parse(fs.readFileSync(file, 'utf-8'));
const prisma = new PrismaClient();
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

(async () => {
  const game = await prisma.game.findUnique({
    where: { id: sheet.gameId },
    include: { homeTeam: true, awayTeam: true, events: true, lineupEntries: true },
  });
  if (!game) throw new Error(`game ${sheet.gameId} not found`);
  const SOURCE = sheet.source;
  const batchId = `${SOURCE}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const ledger = [];
  const notes = [];
  const log = (s) => console.log(s);
  log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${game.dateTime.toISOString().slice(0, 10)} ${game.homeTeam.nameHe} ${game.homeScore}-${game.awayScore} ${game.awayTeam.nameHe}`);

  const teamOf = { home: game.homeTeam, away: game.awayTeam };
  const squads = {};
  for (const side of ['home', 'away']) {
    squads[side] = new Map((await prisma.player.findMany({ where: { teamId: teamOf[side].id }, select: { id: true, nameHe: true } })).map((p) => [clean(p.nameHe), p.id]));
  }
  const alias = (n) => clean(sheet.aliases?.[clean(n)] ?? n);
  const created = [];
  async function playerId(side, rawName) {
    const name = alias(rawName);
    if (squads[side].has(name)) return { id: squads[side].get(name), name };
    let id = `(new:${name})`;
    if (APPLY) {
      const sp = name.indexOf(' ');
      const data = {
        teamId: teamOf[side].id, nameHe: name, nameEn: name,
        ...(sp > 0 ? { firstNameHe: name.slice(0, sp), lastNameHe: name.slice(sp + 1) } : {}),
        additionalInfo: { sources: [SOURCE] },
      };
      id = (await prisma.player.create({ data, select: { id: true } })).id;
      ledger.push({ table: 'players', recordId: id, field: '*created*', newValue: data });
    }
    squads[side].set(name, id);
    created.push(`${teamOf[side].nameHe}: ${name}`);
    return { id, name };
  }
  const realId = (id) => (id.startsWith('(new:') ? null : id);

  // ── Game fields ────────────────────────────────────────────────────────────
  const gameData = {};
  const setIfEmpty = (field, value, label) => {
    if (value == null || value === '') return;
    const cur = game[field];
    if (cur == null || cur === '') { gameData[field] = value; log(`  + ${label}: ${value}`); }
    else if (String(cur) !== String(value)) notes.push(`${label}: אצלנו ${cur}, ב${sheet.sourceLabelHe} ${value} — נשאר שלנו`);
  };
  setIfEmpty('roundNameHe', sheet.roundNameHe, 'מחזור');
  setIfEmpty('attendance', sheet.attendance, 'צופים');
  if (sheet.kickoffIsrael) {
    const [hh, mm] = sheet.kickoffIsrael.split(':').map(Number);
    // Israel was UTC+2 in winter / +3 in summer; take the offset from the stored date's own zone.
    const day = game.dateTime.toISOString().slice(0, 10);
    const offset = Number(new Intl.DateTimeFormat('en', { timeZone: 'Asia/Jerusalem', timeZoneName: 'shortOffset' })
      .formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === 'timeZoneName').value.replace('GMT', '') || 2);
    const kickoff = new Date(Date.UTC(...day.split('-').map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), hh - offset, mm));
    if (kickoff.getTime() !== game.dateTime.getTime()) { gameData.dateTime = kickoff; log(`  + שעת פתיחה: ${sheet.kickoffIsrael}`); }
  }
  const info = { ...(game.additionalInfo || {}) };
  info.sources = [...new Set([...(info.sources || []), SOURCE])];
  if (sheet.assistantRefereesHe?.length) info.assistantRefereesHe = sheet.assistantRefereesHe;
  info[SOURCE] = { label: sheet.sourceLabelHe, ref: sheet.sourceRef || null, importedAt: new Date().toISOString() };
  gameData.additionalInfo = info;

  // ── Lineups ────────────────────────────────────────────────────────────────
  const lineupRows = [];
  for (const side of ['home', 'away']) {
    const s = sheet[side] || {};
    const has = game.lineupEntries.filter((l) => l.teamId === teamOf[side].id);
    if (has.length) { notes.push(`${teamOf[side].nameHe}: כבר יש הרכב (${has.length} שורות) — לא נגעתי`); continue; }
    if (s.coach) lineupRows.push({ gameId: game.id, teamId: teamOf[side].id, role: 'COACH', participantType: 'COACH', participantName: clean(s.coach) });
    for (const [role, list] of [['STARTER', s.starters || []], ['SUBSTITUTE', s.subs || []]]) {
      for (const p of list) {
        const pl = await playerId(side, p.name);
        lineupRows.push({
          gameId: game.id, teamId: teamOf[side].id, role, participantType: 'PLAYER', participantName: pl.name,
          playerId: realId(pl.id), jerseyNumber: p.number ?? null, positionName: p.pos ?? null,
        });
      }
    }
    log(`  + הרכב ${teamOf[side].nameHe}: ${(s.starters || []).length} פותחים, ${(s.subs || []).length} מחליפים${s.coach ? `, מאמן ${s.coach}` : ''}`);
    if ((s.starters || []).some((p) => p.captain)) info.captains = { ...(info.captains || {}), [side]: alias((s.starters || []).find((p) => p.captain).name) };
  }

  // ── Events ─────────────────────────────────────────────────────────────────
  const newEvents = [];
  const eventUpdates = [];
  const same = (e, side, types, minute, name) => e.team === side && types.includes(e.type) && Math.abs(e.minute - minute) <= 1 && (!name || clean(e.participantName) === name);
  for (const ev of sheet.events || []) {
    const side = ev.team;
    const teamId = teamOf[side].id;
    if (ev.type === 'SUB') {
      const pin = await playerId(side, ev.in);
      const pout = await playerId(side, ev.out);
      if (game.events.some((e) => same(e, side, ['SUBSTITUTION_IN', 'SUBSTITUTION_OUT'], ev.minute, null) && [pin.name, pout.name].includes(clean(e.participantName)))) continue;
      newEvents.push(
        { gameId: game.id, minute: ev.minute, team: side, teamId, type: 'SUBSTITUTION_IN', participantName: pin.name, relatedParticipantName: pout.name, playerId: realId(pin.id), relatedPlayerId: realId(pout.id), source: SOURCE, ...(ev.minute === 0 ? { notesHe: 'הדקה לא ידועה' } : {}) },
        { gameId: game.id, minute: ev.minute, team: side, teamId, type: 'SUBSTITUTION_OUT', participantName: pout.name, relatedParticipantName: pin.name, playerId: realId(pout.id), relatedPlayerId: realId(pin.id), source: SOURCE, ...(ev.minute === 0 ? { notesHe: 'הדקה לא ידועה' } : {}) },
      );
      log(`  + ${ev.minute}' חילוף ${teamOf[side].nameHe}: ${pin.name} ↔ ${pout.name}`);
      continue;
    }
    // Own goal: the event belongs to the team that benefits (sheet `team`), the player to the other side.
    const playerSide = ev.type === 'OWN_GOAL' ? (side === 'home' ? 'away' : 'home') : side;
    const pl = await playerId(playerSide, ev.player);
    const goalTypes = ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'];
    const types = goalTypes.includes(ev.type) ? goalTypes : [ev.type];
    const existing = game.events.find((e) => same(e, side, types, ev.minute, pl.name)) || game.events.find((e) => same(e, side, types, ev.minute, null));
    const assist = ev.assist ? await playerId(side, ev.assist) : null;
    if (existing) {
      if (existing.type !== ev.type) notes.push(`${ev.minute}' ${pl.name}: אצלנו ${existing.type}, ב${sheet.sourceLabelHe} ${ev.type} — נשאר שלנו`);
      if (!existing.playerId && clean(existing.participantName) === pl.name) {
        eventUpdates.push({ id: existing.id, data: { playerId: realId(pl.id) } });
        log(`  + ${ev.minute}' קישור השער של ${pl.name} לשחקן`);
      }
      if (assist && !existing.relatedParticipantName) {
        eventUpdates.push({ id: existing.id, data: { relatedParticipantName: assist.name, relatedPlayerId: realId(assist.id) } });
        log(`  + ${ev.minute}' בישול ל${clean(existing.participantName)}: ${assist.name}`);
      }
      continue;
    }
    newEvents.push({
      gameId: game.id, minute: ev.minute, team: side, teamId, type: ev.type, participantName: pl.name, playerId: realId(pl.id),
      ...(assist ? { relatedParticipantName: assist.name, relatedPlayerId: realId(assist.id) } : {}), source: SOURCE,
      // Minute 0 in the source means "minute not recorded" (cards listed with no time).
      ...(ev.note ? { notesHe: ev.note } : ev.minute === 0 ? { notesHe: 'הדקה לא ידועה' } : {}),
    });
    log(`  + ${ev.minute}' ${ev.type} ${teamOf[side].nameHe}: ${pl.name}${assist ? ` (בישול ${assist.name})` : ''}`);
  }
  // The sheet's goals vs ours.
  const sheetGoals = (sheet.events || []).filter((e) => ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'].includes(e.type)).length;
  const ourGoals = game.events.filter((e) => ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'].includes(e.type)).length;
  if (sheetGoals !== ourGoals) notes.push(`שערים: אצלנו ${ourGoals} אירועי שער, ב${sheet.sourceLabelHe} ${sheetGoals}`);

  if (created.length) log(`  שחקנים חדשים (לעונה הזו בלבד): ${created.join(', ')}`);
  for (const n of notes) log(`  ! ${n}`);

  if (!APPLY) { log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  await prisma.$transaction(async (tx) => {
    const old = {};
    for (const k of Object.keys(gameData)) old[k] = game[k];
    await tx.game.update({ where: { id: game.id }, data: gameData });
    for (const k of Object.keys(gameData)) ledger.push({ table: 'games', recordId: game.id, field: k, oldValue: old[k] ?? null, newValue: gameData[k] });
    for (const row of lineupRows) {
      const r = await tx.gameLineupEntry.create({ data: row, select: { id: true } });
      ledger.push({ table: 'game_lineup_entries', recordId: r.id, field: '*created*', newValue: row });
    }
    for (const row of newEvents) {
      const r = await tx.gameEvent.create({ data: row, select: { id: true } });
      ledger.push({ table: 'game_events', recordId: r.id, field: '*created*', newValue: row });
    }
    for (const u of eventUpdates) {
      await tx.gameEvent.update({ where: { id: u.id }, data: u.data });
      for (const [k, v] of Object.entries(u.data)) ledger.push({ table: 'game_events', recordId: u.id, field: k, oldValue: null, newValue: v });
    }
    await tx.dataImportChange.createMany({
      data: ledger.map((l) => ({ source: SOURCE, batchId, basis: 'direct', sourceRef: sheet.sourceRef || null, ...l, newValue: JSON.parse(JSON.stringify(l.newValue ?? null)), oldValue: l.oldValue === undefined ? undefined : JSON.parse(JSON.stringify(l.oldValue)) })),
    });
  });
  log(`\napplied — ${lineupRows.length} lineup rows, ${newEvents.length} events, ${eventUpdates.length} event updates, ${created.length} new players — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
