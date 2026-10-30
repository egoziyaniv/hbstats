#!/usr/bin/env node
'use strict';
/**
 * Import Eyal Hatav's HBS games archive (1950-2020) into our games.
 * Plan: docs/superpowers/plans/2026-10-30-eyal-archive-migration.md
 *
 * Input is the JSON from scripts/eyal-archive/export-xlsx.py — the workbook itself never
 * enters git. Every write is logged in data_import_changes (old value → new value) and
 * every created event carries source='eyal-archive', so scripts/eyal-archive/rollback.js
 * can undo a stage exactly.
 *
 * Stages (each --apply is one batch, undoable on its own):
 *   raw          one scraped_matches row per archive row (source='eyal-archive')
 *   enrich       date (only over a placeholder), round, referee, venue, attendance,
 *                extra time / shootout — only into EMPTY fields
 *   goals        scorer events, only for games with no goal events and when the scorers
 *                add up to our score on both sides
 *   round-dates  every placeholder-dated game of a Beer Sheva league round gets that
 *                round's date (basis 'round-inferred')
 *
 * Usage:
 *   node scripts/eyal-archive/import.js --file <archive.json>                 # dry run, all stages
 *   node scripts/eyal-archive/import.js --file <archive.json> --stage enrich --apply
 *   add --report <out.json> to save the full report (conflicts, unmatched rows, …)
 */
const fs = require('fs');
const path = require('path');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadEnv(path.resolve(__dirname, '..', '..', '.env'));

const { PrismaClient } = require('@prisma/client');
const A = require('../lib/eyal-archive');

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const FILE = arg('--file');
const STAGE = arg('--stage');
const APPLY = process.argv.includes('--apply');
const REPORT = arg('--report');
const STAGES = ['raw', 'enrich', 'goals', 'round-dates'];
if (!FILE) { console.error('--file <archive.json> is required'); process.exit(1); }
if (APPLY && !STAGES.includes(STAGE)) { console.error(`--apply needs --stage ${STAGES.join('|')}`); process.exit(1); }
if (STAGE && !STAGES.includes(STAGE)) { console.error(`unknown stage ${STAGE}`); process.exit(1); }

const prisma = new PrismaClient();

/** Same rule as src/lib/game-date.ts — the dates imports used when they had none. */
function isPlaceholderDate(d, apiFootballId) {
  if (apiFootballId != null) return false;
  const iso = new Date(d).toISOString().slice(5);
  return iso === '09-01T00:00:00.000Z' || iso === '05-01T20:00:00.000Z';
}
/** The book gives a day, not a kickoff: stored at 10:00 UTC, which the site shows as a date only. */
const DATE_ONLY_UTC = 'T10:00:00.000Z';
const dateOnly = (ymd) => new Date(`${ymd}${DATE_ONLY_UTC}`);
const isYmd = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const empty = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim());
const BS_NAME = 'הפועל באר שבע';
const isBsName = (n) => A.normalizeTeamName(n) === A.normalizeTeamName('הפועל באר-שבע');
const decade = (y) => `${Math.floor(y / 10) * 10}s`;

async function loadOurGames() {
  const bsTeams = await prisma.team.findMany({
    where: { OR: [{ apiFootballId: 563 }, { nameHe: BS_NAME }] },
    select: { id: true },
  });
  const bsIds = new Set(bsTeams.map((t) => t.id));
  const games = await prisma.game.findMany({
    where: { OR: [{ homeTeamId: { in: [...bsIds] } }, { awayTeamId: { in: [...bsIds] } }] },
    select: {
      id: true, dateTime: true, apiFootballId: true, homeTeamId: true, awayTeamId: true,
      homeScore: true, awayScore: true, homePenalty: true, awayPenalty: true, statusShort: true,
      roundNameHe: true, roundNameEn: true, refereeHe: true, refereeId: true,
      venueNameHe: true, venueId: true, attendance: true, additionalInfo: true,
      seasonId: true, competitionId: true,
      season: { select: { year: true } },
      competition: { select: { type: true } },
      homeTeam: { select: { nameHe: true, nameEn: true } },
      awayTeam: { select: { nameHe: true, nameEn: true } },
      _count: { select: { events: { where: { type: { in: ['GOAL', 'PENALTY_GOAL', 'OWN_GOAL'] } } } } },
    },
  });
  return { bsIds, games };
}

/** Find our game for one archive row. Only Beer Sheva's opponents in that season and
 *  competition are candidates, so names need to agree loosely, never across seasons. */
function matchRow(row, ctx) {
  const target = A.competitionTarget(row);
  if (!target) return { status: 'no-competition' };
  const year = A.seasonStartYear(row['עונה']);
  const years = String(row['עונה']).match(/^\d{4}-(\d{2})$/) && Number(String(row['עונה']).slice(5)) - (year % 100) > 1
    ? [year, year + 1]
    : [year];
  const bsHome = isBsName(row['קבוצת בית']);
  const bsAway = isBsName(row['קבוצת חוץ']);
  if (bsHome === bsAway) return { status: 'no-teams' };
  const opponent = row['יריבה'];
  // In a play-off stage ("גמר-רגל עליון") the book restarts the count at 1; we number those
  // rounds on from the regular season (27-36), so the book's round can't be compared.
  const round = row['שלב'] ? null : A.roundNumber(row['מחזור / סיבוב']);
  const isLeague = row['מסגרת'] === 'משחקי הליגה';

  let cands = ctx.games.filter((g) => years.includes(g.season.year)
    && (target.europe ? g.competition?.type === 'EUROPE' : target.ids.includes(g.competitionId))
    && (bsHome ? ctx.bsIds.has(g.homeTeamId) : ctx.bsIds.has(g.awayTeamId)));
  if (!cands.length) return { status: 'no-season-games' };
  const scored = cands
    .map((g) => {
      const opp = bsHome ? g.awayTeam : g.homeTeam;
      return { g, score: Math.max(A.teamNameScore(opponent, opp.nameHe), A.teamNameScore(opponent, opp.nameEn)) };
    })
    .filter((x) => x.score > 0);
  if (!scored.length) return { status: 'no-opponent', opponent };
  const best = Math.max(...scored.map((x) => x.score));
  cands = scored.filter((x) => x.score === best).map((x) => x.g);
  if (isLeague && round !== null && cands.length > 1) {
    const sameRound = cands.filter((g) => A.roundNumber(g.roundNameHe || g.roundNameEn) === round);
    if (sameRound.length) cands = sameRound;
  }
  if (cands.length > 1) {
    const file = A.parseScore(row['תוצאה (בית:חוץ)']);
    const sameScore = file ? cands.filter((g) => g.homeScore === file.home && g.awayScore === file.away) : [];
    if (sameScore.length === 1) cands = sameScore;
  }
  if (cands.length > 1 && isYmd(row['תאריך'])) {
    const sameDay = cands.filter((g) => new Date(g.dateTime).toISOString().slice(0, 10) === row['תאריך']);
    if (sameDay.length === 1) cands = sameDay;
  }
  if (cands.length !== 1) return { status: 'ambiguous', count: cands.length };
  const game = cands[0];

  // A league game whose round we hold must be the same round.
  const ourRound = A.roundNumber(game.roundNameHe || game.roundNameEn);
  if (isLeague && round !== null && ourRound !== null && ourRound !== round) {
    return { status: 'conflict', game, reason: `round ${ourRound} vs ${round}` };
  }
  const kind = A.resultKind(row['הערה לתוצאה']);
  const file = A.parseScore(row['תוצאה (בית:חוץ)']);
  if (kind === 'invalid') return { status: 'conflict', game, reason: `unreadable note: ${row['הערה לתוצאה']}` };
  if (file && game.homeScore !== null && game.awayScore !== null) {
    if (kind === 'pens') {
      if (game.homeScore !== game.awayScore) return { status: 'conflict', game, reason: `shootout row but our score ${game.homeScore}:${game.awayScore}` };
    } else if (!['technical', 'technical-no-points'].includes(kind) && (file.home !== game.homeScore || file.away !== game.awayScore)) {
      return { status: 'conflict', game, reason: `score ${game.homeScore}:${game.awayScore} vs book ${file.home}:${file.away}` };
    }
  }
  // The round as WE number it — what round-dates must key on.
  return { status: 'matched', game, kind, file, round: ourRound ?? round, bsHome };
}

/** Field changes for one matched game — only into empty fields (a placeholder date counts as empty). */
function enrichChanges(row, m, referees) {
  const g = m.game;
  const out = [];
  const set = (field, oldValue, newValue) => out.push({ field, oldValue, newValue });
  if (isYmd(row['תאריך']) && isPlaceholderDate(g.dateTime, g.apiFootballId)) {
    set('dateTime', new Date(g.dateTime).toISOString(), dateOnly(row['תאריך']).toISOString());
  }
  if (empty(g.roundNameHe) && empty(g.roundNameEn) && !empty(row['מחזור / סיבוב'])) {
    const label = String(row['מחזור / סיבוב']).trim();
    set('roundNameHe', null, /^\d+$/.test(label) ? `מחזור ${label}` : label);
  }
  const referee = String(row['שופט'] || '').trim();
  if (referee && empty(g.refereeHe) && !g.refereeId) {
    set('refereeHe', null, referee);
    const linked = referees.get(A.normalizeTeamName(referee));
    if (linked) set('refereeId', null, linked);
  }
  const venue = String(row['מגרש'] || '').trim();
  if (venue && empty(g.venueNameHe) && !g.venueId) set('venueNameHe', null, venue);
  if (Number.isFinite(row['קהל']) && g.attendance == null) set('attendance', null, Math.round(row['קהל']));
  if (m.kind === 'aet' && empty(g.statusShort)) set('statusShort', null, 'AET');
  if (m.kind === 'pens' && m.file && g.homePenalty == null && g.awayPenalty == null) {
    set('homePenalty', null, m.file.home);
    set('awayPenalty', null, m.file.away);
  }
  if (out.length) {
    const info = g.additionalInfo && typeof g.additionalInfo === 'object' ? g.additionalInfo : {};
    const sources = Array.isArray(info.sources) ? info.sources : [];
    const next = {
      ...info,
      sources: sources.includes(A.SOURCE) ? sources : [...sources, A.SOURCE],
      eyalArchive: {
        ref: A.sourceRef(row),
        page: row['עמוד בספר'] ?? null,
        ...(row['שלב'] ? { stage: row['שלב'] } : {}),
        ...(['technical', 'technical-no-points', 'abandoned'].includes(m.kind) ? { resultNote: row['הערה לתוצאה'] } : {}),
        fields: out.map((c) => c.field),
      },
    };
    set('additionalInfo', g.additionalInfo ?? null, next);
  }
  return out;
}

/** Scorer events for a game with none, when both sides add up to OUR score. */
function goalEvents(row, m) {
  const g = m.game;
  if (g._count.events > 0) return { skip: 'has-goal-events' };
  if (g.homeScore == null || g.awayScore == null) return { skip: 'no-score' };
  if (['technical', 'technical-no-points', 'not-played', 'abandoned'].includes(m.kind)) return { skip: `result-${m.kind}` };
  const bs = A.parseScorers(row['מבקיעים באר-שבע']).goals;
  const opp = A.parseScorers(row['מבקיעים יריבה']).goals;
  const bsScore = m.bsHome ? g.homeScore : g.awayScore;
  const oppScore = m.bsHome ? g.awayScore : g.homeScore;
  if (bs.length !== bsScore || opp.length !== oppScore) return { skip: 'count-mismatch' };
  if (!bs.length && !opp.length) return { skip: 'goalless' };
  const all = [...bs.map((x) => ({ ...x, bsSide: true })), ...opp.map((x) => ({ ...x, bsSide: false }))];
  if (all.some((x) => x.minute === null)) return { skip: 'missing-minute' };
  const events = all
    .sort((a, b) => a.minute - b.minute)
    .map((x, i) => {
      const home = x.bsSide === m.bsHome;
      return {
        gameId: g.id,
        minute: x.minute,
        type: x.kind === 'penalty' ? 'PENALTY_GOAL' : x.kind === 'own-goal' ? 'OWN_GOAL' : 'GOAL',
        // An own goal is credited to the side it counts for — the convention of every OWN_GOAL row.
        team: home ? 'home' : 'away',
        teamId: home ? g.homeTeamId : g.awayTeamId,
        participantName: x.name,
        source: A.SOURCE,
        sortOrder: i,
      };
    });
  return { events };
}

/** Every round of a Beer Sheva league game dated in the book → that date for the round's
 *  placeholder-dated games. A midweek Beer Sheva game was a rescheduled one, so its date
 *  says nothing about the rest of the round. */
async function roundDatePlan(matches) {
  const rounds = new Map();
  for (const { row, m } of matches) {
    if (row['מסגרת'] !== 'משחקי הליגה' || m.round === null || !isYmd(row['תאריך'])) continue;
    const dow = new Date(`${row['תאריך']}T12:00:00Z`).getUTCDay();
    if (dow >= 2 && dow <= 4) continue;
    rounds.set(`${m.game.seasonId}|${m.game.competitionId}|${m.round}`, { date: row['תאריך'], ref: A.sourceRef(row), bsGameId: m.game.id });
  }
  const seasonIds = [...new Set([...rounds.keys()].map((k) => k.split('|')[0]))];
  const others = await prisma.game.findMany({
    where: { seasonId: { in: seasonIds }, apiFootballId: null },
    select: { id: true, dateTime: true, apiFootballId: true, seasonId: true, competitionId: true, roundNameHe: true, roundNameEn: true },
  });
  const plan = [];
  for (const g of others) {
    if (!isPlaceholderDate(g.dateTime, g.apiFootballId)) continue;
    const r = rounds.get(`${g.seasonId}|${g.competitionId}|${A.roundNumber(g.roundNameHe || g.roundNameEn)}`);
    if (!r || r.bsGameId === g.id) continue;
    plan.push({ gameId: g.id, oldValue: new Date(g.dateTime).toISOString(), newValue: dateOnly(r.date).toISOString(), ref: r.ref });
  }
  return { plan, rounds: rounds.size };
}

const toPrismaValue = (field, v) => (field === 'dateTime' && v ? new Date(v) : v);

async function writeChanges(batchId, items) {
  let n = 0;
  for (const it of items) {
    const data = Object.fromEntries(it.changes.map((c) => [c.field, toPrismaValue(c.field, c.newValue)]));
    await prisma.$transaction([
      prisma.game.update({ where: { id: it.gameId }, data }),
      prisma.dataImportChange.createMany({
        data: it.changes.map((c) => ({
          source: A.SOURCE, batchId, table: 'games', recordId: it.gameId, field: c.field,
          oldValue: c.oldValue ?? undefined, newValue: c.newValue ?? undefined,
          basis: it.basis || 'direct', sourceRef: it.ref,
        })),
      }),
    ]);
    n += 1;
  }
  return n;
}

async function recordBatch(batchId, stage, counts) {
  await prisma.mergeOperation.create({
    data: {
      source: A.SOURCE, mergeType: stage, status: 'executed', executedAt: new Date(),
      description: `${A.SOURCE_LABEL_HE} — ${stage} (batch ${batchId})`,
      changesJson: { batchId, ...counts },
      recordsMatched: counts.matched ?? 0, recordsUpdated: counts.updated ?? 0, recordsCreated: counts.created ?? 0,
    },
  });
}

(async () => {
  const archive = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  const rows = archive.games;
  console.log(`${APPLY ? `APPLY ${STAGE}` : 'DRY RUN'} — ${A.SOURCE_LABEL_HE}: ${rows.length} rows`);
  const batchId = `${A.SOURCE}-${STAGE || 'dry'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;

  const ctx = await loadOurGames();
  const referees = new Map(
    (await prisma.referee.findMany({ where: { nameHe: { not: null } }, select: { id: true, nameHe: true } }))
      .map((r) => [A.normalizeTeamName(r.nameHe), r.id]),
  );

  // ── match every row ──
  const results = rows.map((row) => ({ row, m: matchRow(row, ctx) }));
  const matched = results.filter((x) => x.m.status === 'matched');
  const taken = new Map();
  for (const x of matched) taken.set(x.m.game.id, (taken.get(x.m.game.id) || 0) + 1);
  for (const x of matched) if (taken.get(x.m.game.id) > 1) x.m = { status: 'ambiguous', count: taken.get(x.m.game.id), game: x.m.game };
  const good = results.filter((x) => x.m.status === 'matched');

  const byStatus = {};
  const byDecade = {};
  for (const { row, m } of results) {
    byStatus[m.status] = (byStatus[m.status] || 0) + 1;
    const d = decade(A.seasonStartYear(row['עונה']));
    byDecade[d] = byDecade[d] || { rows: 0, matched: 0 };
    byDecade[d].rows += 1;
    if (m.status === 'matched') byDecade[d].matched += 1;
  }
  console.log('\nmatching:', byStatus);
  console.log('by decade:', Object.entries(byDecade).map(([d, v]) => `${d} ${v.matched}/${v.rows}`).join(' · '));

  // ── enrich ──
  const enrich = good.map(({ row, m }) => ({ gameId: m.game.id, ref: A.sourceRef(row), changes: enrichChanges(row, m, referees) }))
    .filter((x) => x.changes.length);
  const fieldCounts = {};
  for (const e of enrich) for (const c of e.changes) fieldCounts[c.field] = (fieldCounts[c.field] || 0) + 1;
  console.log(`\nenrich: ${enrich.length} games would change`, fieldCounts);

  // ── goals ──
  const goals = good.map(({ row, m }) => ({ row, m, r: goalEvents(row, m) }));
  const goalSkips = {};
  for (const x of goals) if (x.r.skip) goalSkips[x.r.skip] = (goalSkips[x.r.skip] || 0) + 1;
  const goalGames = goals.filter((x) => x.r.events);
  console.log(`\ngoals: ${goalGames.length} games, ${goalGames.reduce((s, x) => s + x.r.events.length, 0)} events; skipped`, goalSkips);

  // ── round dates ──
  const rd = await roundDatePlan(good);
  console.log(`\nround-dates: ${rd.rounds} dated rounds → ${rd.plan.length} other games get a date`);

  const conflicts = results.filter((x) => x.m.status === 'conflict').map(({ row, m }) => ({
    ref: A.sourceRef(row), season: row['עונה'], game: row['משחק ותוצאה (כמקור)'], gameId: m.game?.id, reason: m.reason,
  }));
  const unmatched = results.filter((x) => !['matched', 'conflict'].includes(x.m.status)).map(({ row, m }) => ({
    ref: A.sourceRef(row), season: row['עונה'], competition: row['מסגרת'], level: row['רמת ליגה'], game: row['משחק ותוצאה (כמקור)'], status: m.status,
  }));
  console.log(`\nconflicts (${conflicts.length}):`);
  for (const c of conflicts.slice(0, 12)) console.log(`  ${c.ref} ${c.season} ${c.game} — ${c.reason}`);
  const unmatchedLeague = unmatched.filter((u) => u.competition === 'משחקי הליגה' && u.level === 1);
  console.log(`\nunmatched top-flight league rows: ${unmatchedLeague.length}`);
  for (const u of unmatchedLeague.slice(0, 12)) console.log(`  ${u.ref} ${u.season} ${u.game} — ${u.status}`);

  // Our round vs the book's, per season — where they disagree, one numbering is wrong.
  const roundCheck = {};
  for (const { row, m } of results) {
    if (!m.game || row['מסגרת'] !== 'משחקי הליגה') continue;
    if (row['שלב']) continue;
    const book = A.roundNumber(row['מחזור / סיבוב']);
    const ours = A.roundNumber(m.game.roundNameHe || m.game.roundNameEn);
    if (book === null || ours === null) continue;
    const k = row['עונה'];
    roundCheck[k] = roundCheck[k] || { same: 0, diff: 0 };
    roundCheck[k][book === ours ? 'same' : 'diff'] += 1;
  }
  console.log('\nround agreement (season same/diff):', Object.entries(roundCheck).map(([k, v]) => `${k} ${v.same}/${v.diff}`).join(' · '));

  if (REPORT) {
    fs.writeFileSync(REPORT, JSON.stringify({ byStatus, byDecade, roundCheck, fieldCounts, goalSkips, conflicts, unmatched, roundDates: rd.plan.length }, null, 1));
    console.log(`\nreport → ${REPORT}`);
  }

  if (!APPLY) {
    console.log('\nDry run — nothing written. Re-run with --stage <stage> --apply.');
    await prisma.$disconnect();
    return;
  }

  // ── apply one stage ──
  if (STAGE === 'raw') {
    let created = 0;
    for (const { row } of results) {
      const kind = A.resultKind(row['הערה לתוצאה']);
      const score = A.parseScore(row['תוצאה (בית:חוץ)']);
      const data = {
        season: String(row['עונה']), leagueNameHe: row['מסגרת'] || null, framework: row['מסגרת'] || null,
        round: row['מחזור / סיבוב'] != null ? String(row['מחזור / סיבוב']) : null,
        dateStr: row['תאריך'] != null ? String(row['תאריך']) : null,
        dateTime: isYmd(row['תאריך']) ? dateOnly(row['תאריך']) : null,
        homeTeamName: row['קבוצת בית'] || '', awayTeamName: row['קבוצת חוץ'] || '',
        homeScore: kind === 'pens' ? null : score?.home ?? null, awayScore: kind === 'pens' ? null : score?.away ?? null,
        homePenalty: kind === 'pens' ? score?.home ?? null : null, awayPenalty: kind === 'pens' ? score?.away ?? null : null,
        venue: row['מגרש'] || null, referee: row['שופט'] || null, refereeMain: row['שופט'] || null,
        status: row['הערה לתוצאה'] || null, rawJson: row,
      };
      await prisma.scrapedMatch.upsert({
        where: { source_sourceId: { source: A.SOURCE, sourceId: A.sourceRef(row) } },
        create: { source: A.SOURCE, sourceId: A.sourceRef(row), ...data },
        update: data,
      });
      created += 1;
    }
    await recordBatch(batchId, STAGE, { created, matched: good.length });
    console.log(`\nraw: ${created} scraped rows — batch ${batchId}`);
  }

  if (STAGE === 'enrich') {
    const updated = await writeChanges(batchId, enrich);
    await recordBatch(batchId, STAGE, { matched: good.length, updated });
    console.log(`\nenrich: ${updated} games updated — batch ${batchId}`);
  }

  if (STAGE === 'goals') {
    let created = 0;
    for (const x of goalGames) {
      for (const ev of x.r.events) {
        const e = await prisma.gameEvent.create({ data: ev, select: { id: true } });
        await prisma.dataImportChange.create({
          data: { source: A.SOURCE, batchId, table: 'game_events', recordId: e.id, field: '*created*', newValue: ev, sourceRef: A.sourceRef(x.row) },
        });
        created += 1;
      }
    }
    await recordBatch(batchId, STAGE, { matched: goalGames.length, created });
    console.log(`\ngoals: ${created} events created — batch ${batchId}. Next: node scripts/link-legacy-event-players.js`);
  }

  if (STAGE === 'round-dates') {
    const items = rd.plan.map((p) => ({
      gameId: p.gameId, ref: p.ref, basis: 'round-inferred',
      changes: [{ field: 'dateTime', oldValue: p.oldValue, newValue: p.newValue }],
    }));
    const updated = await writeChanges(batchId, items);
    await recordBatch(batchId, STAGE, { updated });
    console.log(`\nround-dates: ${updated} games dated — batch ${batchId}`);
  }

  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
