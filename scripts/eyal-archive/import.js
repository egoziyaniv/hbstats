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
const STAGES = ['raw', 'enrich', 'goals', 'round-dates', 'swap', 'reconcile', 'abandoned', 'history'];
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
      // A drawn game, or the second leg of a tie decided on aggregate — then the shootout we hold must agree.
      const shootoutAgrees = game.homePenalty === file.home && game.awayPenalty === file.away;
      if (game.homeScore !== game.awayScore && !shootoutAgrees) return { status: 'conflict', game, reason: `shootout row but our score ${game.homeScore}:${game.awayScore}` };
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

/**
 * Score conflicts where OUR data has the hosts the wrong way round: the book's game exists
 * with the teams reversed and the same result for each team (2001-05 imports). Each such
 * game gets home and away swapped. A game the book already matched is never touched.
 */
function swapPlan(results, ctx, matchedIds) {
  const plan = new Map();
  for (const { row, m } of results) {
    if (m.status !== 'conflict' || !m.reason.startsWith('score')) continue;
    const file = A.parseScore(row['תוצאה (בית:חוץ)']);
    if (!file) continue;
    const g = m.game;
    const flips = ctx.games.filter((x) => x.seasonId === g.seasonId && x.competitionId === g.competitionId
      && x.homeTeamId === g.awayTeamId && x.awayTeamId === g.homeTeamId
      && x.homeScore === file.away && x.awayScore === file.home);
    if (flips.length !== 1 || matchedIds.has(flips[0].id) || flips[0].apiFootballId != null) continue;
    plan.set(flips[0].id, { game: flips[0], ref: A.sourceRef(row) });
  }
  return [...plan.values()];
}

/** Why a game was abandoned, where the book doesn't say — from the owner, by book row. */
const ABANDONED_REASONS = { 'p164-r1051': 'גשם שוטף' };

/**
 * An abandoned game ("הופסק") replayed later: the book has both rows. The replay is the game
 * of record; the abandoned one is kept on it as a note — date, ground, score at the stop.
 */
function abandonedPlan(results, good) {
  const plan = [];
  for (const { row } of results) {
    if (A.resultKind(row['הערה לתוצאה']) !== 'abandoned') continue;
    const replay = good.find(({ row: r }) => r['עונה'] === row['עונה'] && r['מסגרת'] === row['מסגרת'] && r['יריבה'] === row['יריבה']
      && /חוזר/.test(String(r['מחזור / סיבוב'] || '')) && String(r['מחזור / סיבוב']).startsWith(String(row['מחזור / סיבוב'] || '')));
    if (!replay) continue;
    const g = replay.m.game;
    const score = A.parseScore(row['תוצאה (בית:חוץ)']);
    const note = {
      ref: A.sourceRef(row),
      date: isYmd(row['תאריך']) ? row['תאריך'] : null,
      venueHe: row['מגרש'] || null,
      homeTeamHe: row['קבוצת בית'], awayTeamHe: row['קבוצת חוץ'],
      homeScore: score?.home ?? null, awayScore: score?.away ?? null,
      refereeHe: row['שופט'] || null,
      attendance: Number.isFinite(row['קהל']) ? row['קהל'] : null,
      reasonHe: ABANDONED_REASONS[A.sourceRef(row)] || null,
    };
    const info = g.additionalInfo && typeof g.additionalInfo === 'object' ? g.additionalInfo : {};
    if (JSON.stringify(info.abandonedMatch) === JSON.stringify(note)) continue;
    plan.push({ gameId: g.id, ref: note.ref, changes: [{ field: 'additionalInfo', oldValue: g.additionalInfo ?? null, newValue: { ...info, abandonedMatch: note } }] });
  }
  return plan;
}

/** A club's name as we write it: "מכבי פתח-תקוה (ארצית)" → "מכבי פתח תקווה". */
function displayTeamName(name) {
  return String(name || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/מכביתל/g, 'מכבי תל')
    .replace(/-/g, ' ')
    .replace(/תקוה/g, 'תקווה')
    .replace(/קרית/g, 'קריית')
    .replace(/\s+/g, ' ')
    .trim();
}
/** "אריס סלוניקי (יוון)" → "יוון"; a league marker ("(ארצית)", "(ליגה א')") is not a country. */
function countryOf(name) {
  const m = String(name || '').match(/\(([^)]*)\)/);
  if (!m || /ליגה|ארצית|לאומית|^[אבג]'$/.test(m[1])) return null;
  return m[1].trim();
}

/**
 * Stage 2 part B — what is still unmatched where we hold nothing to match against: games of the
 * historical leagues, friendlies, old and European cups, and cup games against clubs from
 * below the league table. Teams that don't exist in that season are created; a league game of
 * a league we already hold whose opponent isn't found is only reported (a spelling we don't
 * know would otherwise become a second copy of a club).
 */
function historyPlan(results, ctx, seasonTeams, seasonInfo, seasonComps) {
  const plan = { competitions: [], teams: new Map(), games: [], report: [], skipped: {} };
  const skip = (why, row) => { plan.skipped[why] = (plan.skipped[why] || 0) + 1; if (row) plan.report.push({ ref: A.sourceRef(row), why }); };
  const needComp = new Set();
  for (const { row, m } of results) {
    if (m.status === 'matched' || m.status === 'conflict' || m.status === 'ambiguous') continue;
    const target = A.competitionTarget(row);
    if (!target || target.europe) { skip('competition', null); continue; }
    const compId = target.ids.length === 1 ? target.ids[0]
      : row['רמת ליגה'] === 2 ? 'comp_toto_cup_leumit' : 'comp_toto_cup_al';
    const isHistory = A.HISTORY_IDS.has(compId);
    const isCup = ['comp_state_cup', 'comp_toto_cup_al', 'comp_toto_cup_leumit'].includes(compId);
    const year = A.seasonStartYear(row['עונה']);
    const info = seasonInfo.get(year);
    if (!info) { skip('no-season', row); continue; }
    // A league season we hold games of is reconcile's — it weighs the book against those games.
    const held = (seasonComps.get(year) || new Set()).has(compId);
    if (!isHistory && !isCup && held) { skip('league-held', row); continue; }
    const bsHome = isBsName(row['קבוצת בית']);
    if (bsHome === isBsName(row['קבוצת חוץ'])) { skip('teams', row); continue; }
    const kind = A.resultKind(row['הערה לתוצאה']);
    const file = A.parseScore(row['תוצאה (בית:חוץ)']);
    if (!file || !['normal', 'aet', 'technical', 'technical-no-points'].includes(kind)) { skip(`result-${kind}`, row); continue; }

    // The opponent: a team of that season by name, else (where allowed) a new team.
    const teams = [...(seasonTeams.get(year) || new Map()).values()];
    const name = displayTeamName(row['יריבה']);
    const scored = teams.map((t) => ({ t, score: Math.max(A.teamNameScore(name, t.nameHe), A.teamNameScore(name, t.nameEn)) }));
    const best = Math.max(0, ...scored.map((x) => x.score));
    const hits = scored.filter((x) => x.score === best && best >= 2);
    let oppRef;
    if (hits.length === 1) oppRef = { id: hits[0].t.id };
    else if (hits.length > 1) { skip('opponent-ambiguous', row); continue; }
    else if (isHistory || isCup || !held) {
      const key = `${year}|${name}`;
      if (!plan.teams.has(key)) plan.teams.set(key, { key, seasonId: info.seasonId, nameHe: name, nameEn: name, countryHe: countryOf(row['יריבה']) });
      oppRef = { key };
    } else { skip('opponent-unknown-in-held-league', row); continue; }

    // The same game held under another competition (same hosts and score) is not created twice.
    if (oppRef.id) {
      const oppIds = new Set(scored.filter((x) => x.score >= 2).map((x) => x.t.id));
      const elsewhere = ctx.games.some((g) => g.season.year === year
        && (bsHome ? ctx.bsIds.has(g.homeTeamId) && oppIds.has(g.awayTeamId) : oppIds.has(g.homeTeamId) && ctx.bsIds.has(g.awayTeamId))
        && g.homeScore === file.home && g.awayScore === file.away);
      if (elsewhere) { skip('held-elsewhere', row); continue; }
    }
    if (isHistory) needComp.add(compId);
    const label = String(row['שלב'] || row['מחזור / סיבוב'] || '').replace(/-/g, ' ').trim();
    plan.games.push({
      ref: A.sourceRef(row), oppRef, bsRef: info.bsId ? { id: info.bsId } : { bsOf: info.seasonId }, bsHome,
      data: {
        seasonId: info.seasonId,
        competitionId: compId,
        dateTime: (isYmd(row['תאריך']) ? dateOnly(row['תאריך']) : new Date(`${year}-09-01T00:00:00.000Z`)).toISOString(),
        homeScore: file.home,
        awayScore: file.away,
        status: 'COMPLETED',
        statusShort: kind === 'aet' ? 'AET' : 'FT',
        ...(label ? { roundNameHe: /^\d+$/.test(label) ? `מחזור ${label}` : label } : {}),
        additionalInfo: {
          sources: [A.SOURCE],
          eyalArchive: { ref: A.sourceRef(row), page: row['עמוד בספר'] ?? null, created: true, ...(row['הערת מסגרת / בית'] ? { groupHe: row['הערת מסגרת / בית'] } : {}) },
          ...(kind.startsWith('technical') ? { awarded: { noteHe: row['הערה לתוצאה'] } } : {}),
        },
      },
    });
  }
  plan.competitions = A.HISTORY_COMPETITIONS.filter((c) => needComp.has(c.id));
  return plan;
}

/** The book starts in 1950. Before 1991 we hold each top-flight season's table and its teams but
 *  hardly a game, so the games are created against those teams (stage 2). */
const RECONCILE_FROM = 1949;

/** Where a row's game goes when Beer Sheva has no game of ours in that competition that season:
 *  the league whose table we hold that season, the State Cup, or the Toto Cup of its level. */
function fallbackCompetition(target, row, info) {
  if (!info) return null;
  if (row['מסגרת'] === 'משחקי הליגה') return target.ids.find((id) => info.tableComps.has(id)) || null;
  if (target.ids.includes('comp_state_cup')) return 'comp_state_cup';
  if (target.ids.includes('comp_toto_cup_al')) return row['רמת ליגה'] === 2 ? 'comp_toto_cup_leumit' : 'comp_toto_cup_al';
  return null;
}

/**
 * What matching left over, per season + competition + opponent: the book's rows against our
 * games no row took. The book decides (the owner's rule), in this order:
 *   swap   — our game has the hosts reversed (each team's goals the same)
 *   fix    — one row and one game left at the same venue: the same game, take the book's
 *            score / shootout / round / date
 *   create — a row with no game of ours left at that venue: the game is missing
 * A game of ours still left at a venue blocks creating there (it may be the same game).
 */
function reconcilePlan(results, ctx, matchedIds, seasonTeams, seasonInfo) {
  const groups = new Map();
  const skipped = {};
  const skippedRefs = [];
  let current = null;
  const skip = (why) => { skipped[why] = (skipped[why] || 0) + 1; if (current) skippedRefs.push({ ref: A.sourceRef(current), why }); };
  for (const { row, m } of results) {
    if (m.status === 'matched') continue;
    const year = A.seasonStartYear(row['עונה']);
    if (year < RECONCILE_FROM) continue;
    current = row;
    const target = A.competitionTarget(row);
    if (!target || target.europe) { skip('competition'); continue; }
    const bsHome = isBsName(row['קבוצת בית']);
    if (bsHome === isBsName(row['קבוצת חוץ'])) { skip('teams'); continue; }
    const bsGames = ctx.games.filter((g) => g.season.year === year && target.ids.includes(g.competitionId));
    const info = seasonInfo.get(year);
    let comps = [...new Set(bsGames.map((g) => g.competitionId))];
    if (!comps.length && info?.bsId) comps = [fallbackCompetition(target, row, info)].filter(Boolean);
    if (comps.length !== 1) { skip(comps.length ? 'competition-ambiguous' : 'competition-not-held'); continue; }
    const teams = seasonTeams.get(year) || new Map();
    const scored = [...teams.values()].map((t) => ({ t, score: Math.max(A.teamNameScore(row['יריבה'], t.nameHe), A.teamNameScore(row['יריבה'], t.nameEn)) }));
    const best = Math.max(0, ...scored.map((x) => x.score));
    const opp = scored.filter((x) => x.score === best);
    if (best < 2 || opp.length !== 1) { skip(best < 2 ? 'opponent-unknown' : 'opponent-ambiguous'); continue; }
    const key = `${year}|${comps[0]}|${opp[0].t.id}`;
    // Every team the name could be — a club held twice ("בני יהודה" / "בני יהודה תל אביב") must not get a second copy of a game.
    const oppIds = new Set(scored.filter((x) => x.score >= 2).map((x) => x.t.id));
    if (!groups.has(key)) {
      // A season can sit under two season rows (and Beer Sheva under two team rows): take the common one.
      const mode = (xs) => [...xs.reduce((m, x) => m.set(x, (m.get(x) || 0) + 1), new Map())].sort((a, b) => b[1] - a[1])[0][0];
      groups.set(key, {
        year, oppIds, competitionId: comps[0], oppId: opp[0].t.id, rows: [],
        seasonId: bsGames.length ? mode(bsGames.map((g) => g.seasonId)) : info.seasonId,
        bsId: bsGames.length ? mode(bsGames.map((g) => (ctx.bsIds.has(g.homeTeamId) ? g.homeTeamId : g.awayTeamId))) : info.bsId,
        games: ctx.games.filter((g) => g.season.year === year && g.competitionId === comps[0] && !matchedIds.has(g.id)
          && (oppIds.has(g.homeTeamId) || oppIds.has(g.awayTeamId))),
      });
    }
    const isLeague = row['מסגרת'] === 'משחקי הליגה';
    // The book's round runs on through a play-off (1991-92: 23-32), as ours does.
    const round = isLeague ? A.roundNumber(row['מחזור / סיבוב']) : null;
    groups.get(key).rows.push({ row, bsHome, isLeague, round, kind: A.resultKind(row['הערה לתוצאה']), file: A.parseScore(row['תוצאה (בית:חוץ)']) });
  }

  current = null;
  const plan = { swap: [], fix: [], create: [], left: [], skipped, skippedRefs };
  for (const grp of groups.values()) {
    let rows = grp.rows;
    let games = grp.games;
    const bsHomeOf = (g) => ctx.bsIds.has(g.homeTeamId);
    for (const r of [...rows]) {
      if (!r.file || !['normal', 'aet'].includes(r.kind)) continue;
      const g = games.find((x) => bsHomeOf(x) !== r.bsHome && x.homeScore === r.file.away && x.awayScore === r.file.home);
      if (!g || g.apiFootballId != null) continue;
      plan.swap.push({ game: g, ref: A.sourceRef(r.row) });
      rows = rows.filter((x) => x !== r);
      games = games.filter((x) => x !== g);
    }
    for (const side of [true, false]) {
      const rs = rows.filter((r) => r.bsHome === side);
      const gs = games.filter((g) => bsHomeOf(g) === side);
      if (rs.length === 1 && gs.length === 1 && gs[0].apiFootballId == null) {
        const fix = fixChanges(rs[0], gs[0]);
        if (fix.length) plan.fix.push({ gameId: gs[0].id, ref: A.sourceRef(rs[0].row), changes: fix });
        rows = rows.filter((x) => x !== rs[0]);
        games = games.filter((x) => x !== gs[0]);
      }
      if (games.some((g) => bsHomeOf(g) === side)) continue;
      for (const r of rows.filter((x) => x.bsHome === side)) {
        if (!r.file || !['normal', 'aet'].includes(r.kind)) { skip(`create-${r.kind}`); continue; }
        // The same game held under another competition (State Cup finals sit in their own one).
        const elsewhere = ctx.games.some((g) => g.season.year === grp.year
          && (side ? ctx.bsIds.has(g.homeTeamId) && grp.oppIds.has(g.awayTeamId) : grp.oppIds.has(g.homeTeamId) && ctx.bsIds.has(g.awayTeamId))
          && g.homeScore === r.file.home && g.awayScore === r.file.away);
        if (elsewhere) { skip('create-held-elsewhere'); continue; }
        plan.create.push({ ref: A.sourceRef(r.row), data: createData(r, grp) });
        rows = rows.filter((x) => x !== r);
      }
    }
    for (const g of games) plan.left.push({ gameId: g.id, why: 'no book row' });
    for (const r of rows) plan.left.push({ ref: A.sourceRef(r.row), why: 'our game at that venue left unmatched' });
  }
  return plan;
}

/** The book's score / shootout / round / date onto our game. */
function fixChanges(r, g) {
  const out = [];
  const set = (field, newValue) => { if (JSON.stringify(g[field] ?? null) !== JSON.stringify(newValue)) out.push({ field, oldValue: g[field] ?? null, newValue }); };
  if (r.file && ['normal', 'aet'].includes(r.kind)) { set('homeScore', r.file.home); set('awayScore', r.file.away); }
  if (r.file && r.kind === 'pens') { set('homePenalty', r.file.home); set('awayPenalty', r.file.away); }
  if (r.isLeague && r.round !== null && A.roundNumber(g.roundNameHe || g.roundNameEn) !== r.round) {
    if (g.roundNameHe) set('roundNameHe', `מחזור ${r.round}`);
    else set('roundNameEn', `Round ${r.round}`);
  }
  if (isYmd(r.row['תאריך']) && new Date(g.dateTime).toISOString().slice(0, 10) !== r.row['תאריך']) {
    out.push({ field: 'dateTime', oldValue: new Date(g.dateTime).toISOString(), newValue: dateOnly(r.row['תאריך']).toISOString() });
  }
  return out;
}

/** A game the book has and we don't. Referee, venue, crowd and scorers follow from the enrich and goals stages. */
function createData(r, grp) {
  const year = A.seasonStartYear(r.row['עונה']);
  const label = String(r.row['שלב'] || r.row['מחזור / סיבוב'] || '').replace(/-/g, ' ').trim();
  return {
    seasonId: grp.seasonId,
    competitionId: grp.competitionId,
    homeTeamId: r.bsHome ? grp.bsId : grp.oppId,
    awayTeamId: r.bsHome ? grp.oppId : grp.bsId,
    dateTime: (isYmd(r.row['תאריך']) ? dateOnly(r.row['תאריך']) : new Date(`${year}-09-01T00:00:00.000Z`)).toISOString(),
    homeScore: r.file.home,
    awayScore: r.file.away,
    status: 'COMPLETED',
    statusShort: r.kind === 'aet' ? 'AET' : 'FT',
    ...(r.isLeague && r.round !== null ? { roundNameEn: `Round ${r.round}` } : label ? { roundNameHe: /^\d+$/.test(label) ? `מחזור ${label}` : label } : {}),
    additionalInfo: { sources: [A.SOURCE], eyalArchive: { ref: A.sourceRef(r.row), page: r.row['עמוד בספר'] ?? null, created: true } },
  };
}

/** Swap home and away on one game — fields, and the side of each event — with its ledger rows. */
async function applySwap(batchId, gameId, ref) {
  const g = await prisma.game.findUnique({
    where: { id: gameId },
    include: { events: { select: { id: true, team: true } }, gameStats: { select: { id: true } }, sofascoreMatchStats: { select: { id: true } }, fotmobData: { select: { id: true } } },
  });
  // Per-side statistics would need swapping too — none of these old games has them; skip if one does.
  if (g.gameStats || g.sofascoreMatchStats || g.fotmobData) return false;
  const changes = [];
  for (const [h, a] of SWAP_PAIRS) {
    if (g[h] === g[a]) continue;
    changes.push({ field: h, oldValue: g[h], newValue: g[a] }, { field: a, oldValue: g[a], newValue: g[h] });
  }
  const flip = (t) => (t === 'home' ? 'away' : t === 'away' ? 'home' : t);
  const events = g.events.filter((e) => flip(e.team) !== e.team);
  await prisma.$transaction([
    prisma.game.update({ where: { id: g.id }, data: Object.fromEntries(changes.map((c) => [c.field, c.newValue])) }),
    ...events.map((e) => prisma.gameEvent.update({ where: { id: e.id }, data: { team: flip(e.team) } })),
    prisma.dataImportChange.createMany({
      data: [
        ...changes.map((c) => ({ source: A.SOURCE, batchId, table: 'games', recordId: g.id, field: c.field, oldValue: c.oldValue ?? undefined, newValue: c.newValue ?? undefined, basis: 'home-away-swap', sourceRef: ref })),
        ...events.map((e) => ({ source: A.SOURCE, batchId, table: 'game_events', recordId: e.id, field: 'team', oldValue: e.team, newValue: flip(e.team), basis: 'home-away-swap', sourceRef: ref })),
      ],
    }),
  ]);
  return true;
}

const SWAP_PAIRS = [['homeTeamId', 'awayTeamId'], ['homeScore', 'awayScore'], ['homeScoreRegular', 'awayScoreRegular'], ['homePenalty', 'awayPenalty']];

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
  // Beer Sheva's league each season ("ליגה ג' הנגב") — names the historical lower leagues.
  const leagueBySeason = new Map((archive.seasons || []).map((x) => [x['עונה'], x['ליגה']]));
  for (const r of rows) Object.defineProperty(r, '_leagueName', { value: leagueBySeason.get(r['עונה']) || null, enumerable: false });
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

  // ── abandoned games ──
  const abandoned = abandonedPlan(results, good);
  console.log(`\nabandoned: ${abandoned.length} replays get a note of the abandoned game`);

  // ── swap ──
  const swaps = swapPlan(results, ctx, new Set(good.map((x) => x.m.game.id)));
  console.log(`\nswap: ${swaps.length} games of ours have home and away the wrong way round`);
  for (const w of swaps.slice(0, 6)) console.log(`  ${w.ref} ${w.game.homeTeam.nameHe} - ${w.game.awayTeam.nameHe} ${w.game.homeScore}:${w.game.awayScore} → swapped`);

  // ── reconcile ──
  const seasonTeams = new Map();
  for (const g of await prisma.game.findMany({
    where: { season: { year: { gte: RECONCILE_FROM } } },
    select: { season: { select: { year: true } }, homeTeam: { select: { id: true, nameHe: true, nameEn: true } }, awayTeam: { select: { id: true, nameHe: true, nameEn: true } } },
  })) {
    const m = seasonTeams.get(g.season.year) || new Map();
    for (const t of [g.homeTeam, g.awayTeam]) if (!ctx.bsIds.has(t.id)) m.set(t.id, t);
    seasonTeams.set(g.season.year, m);
  }
  // The season's own teams (its table) — before 1991 almost the only trace of a season we hold.
  const seasonInfo = new Map();
  for (const sn of await prisma.season.findMany({
    where: { year: { gte: RECONCILE_FROM } },
    select: { id: true, year: true, teams: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } }, standings: { select: { competitionId: true } } },
  })) {
    const m = seasonTeams.get(sn.year) || new Map();
    for (const t of sn.teams) if (!ctx.bsIds.has(t.id)) m.set(t.id, t);
    seasonTeams.set(sn.year, m);
    const bs = sn.teams.filter((t) => ctx.bsIds.has(t.id));
    const prev = seasonInfo.get(sn.year);
    // Two season rows for one year: the one with Beer Sheva and a table wins.
    if (prev && (prev.bsId && prev.tableComps.size >= new Set(sn.standings.map((x) => x.competitionId)).size)) continue;
    if (!bs.length && prev) continue;
    seasonInfo.set(sn.year, {
      seasonId: sn.id,
      bsId: (bs.find((t) => t.apiFootballId != null) || bs[0])?.id || null,
      tableComps: new Set(sn.standings.map((x) => x.competitionId)),
    });
  }
  const rec = reconcilePlan(results, ctx, new Set(good.map((x) => x.m.game.id)), seasonTeams, seasonInfo);
  console.log(`\nreconcile: swap ${rec.swap.length}, fix ${rec.fix.length}, create ${rec.create.length}, left ${rec.left.length}; skipped`, rec.skipped);
  // Which competitions we hold any game of, per season — a league season we hold nothing of is created like a historical one.
  const seasonComps = new Map();
  for (const x of await prisma.game.groupBy({ by: ['seasonId', 'competitionId'], _count: { _all: true } })) {
    const y = [...seasonInfo.entries()].find(([, v]) => v.seasonId === x.seasonId)?.[0];
    if (y == null) continue;
    seasonComps.set(y, new Set([...(seasonComps.get(y) || []), x.competitionId]));
  }
  const hist = historyPlan(results, ctx, seasonTeams, seasonInfo, seasonComps);
  {
    const byComp = {};
    for (const g of hist.games) byComp[g.data.competitionId] = (byComp[g.data.competitionId] || 0) + 1;
    console.log(`\nhistory: ${hist.games.length} games, ${hist.teams.size} new teams, ${hist.competitions.length} new competitions; by competition`, byComp, '; skipped', hist.skipped);
  }
  for (const f of rec.fix) console.log(`  fix ${f.ref} ${f.gameId}: ${f.changes.map((c) => `${c.field} ${JSON.stringify(c.oldValue)}→${JSON.stringify(c.newValue)}`).join(', ')}`);

  if (REPORT) {
    fs.writeFileSync(REPORT, JSON.stringify({ byStatus, byDecade, roundCheck, fieldCounts, goalSkips, conflicts, unmatched, roundDates: rd.plan.length, reconcile: { swap: rec.swap.map((w) => ({ ref: w.ref, gameId: w.game.id })), fix: rec.fix, create: rec.create, left: rec.left, skippedRefs: rec.skippedRefs }, history: { games: hist.games, teams: [...hist.teams.values()], competitions: hist.competitions, report: hist.report }, swaps: swaps.map((w) => ({ ref: w.ref, gameId: w.game.id })) }, null, 1));
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

  if (STAGE === 'swap') {
    let updated = 0;
    const skipped = [];
    for (const w of swaps) {
      if (await applySwap(batchId, w.game.id, w.ref)) updated += 1;
      else skipped.push(w.ref);
    }
    await recordBatch(batchId, STAGE, { updated });
    console.log(`\nswap: ${updated} games swapped${skipped.length ? `, skipped (have per-side stats): ${skipped.join(' ')}` : ''} — batch ${batchId}. Re-run enrich, goals and round-dates to fill them.`);
  }

  if (STAGE === 'abandoned') {
    const updated = await writeChanges(batchId, abandoned);
    await recordBatch(batchId, STAGE, { updated });
    console.log(`\nabandoned: ${updated} replays noted — batch ${batchId}`);
  }

  if (STAGE === 'history') {
    const competitions = await prisma.competition.findMany({ where: { id: { in: hist.competitions.map((c) => c.id) } }, select: { id: true } });
    const have = new Set(competitions.map((c) => c.id));
    for (const c of hist.competitions) {
      if (have.has(c.id)) continue;
      const data = { id: c.id, nameHe: c.nameHe, nameEn: c.nameEn, type: c.type, countryHe: c.type === 'EUROPE' ? null : 'ישראל', countryEn: c.type === 'EUROPE' ? null : 'Israel' };
      await prisma.$transaction([
        prisma.competition.create({ data }),
        prisma.dataImportChange.create({ data: { source: A.SOURCE, batchId, table: 'competitions', recordId: c.id, field: '*created*', newValue: data, basis: 'created' } }),
      ]);
    }
    // Beer Sheva's own team in a season we held none of.
    const bsTemplate = await prisma.team.findFirst({ where: { apiFootballId: 563 }, orderBy: { createdAt: 'asc' } });
    const bsOf = new Map();
    const newTeam = async (data) => {
      const t = await prisma.team.create({ data, select: { id: true } });
      await prisma.dataImportChange.create({ data: { source: A.SOURCE, batchId, table: 'teams', recordId: t.id, field: '*created*', newValue: data, basis: 'created' } });
      return t.id;
    };
    const teamIds = new Map();
    for (const t of hist.teams.values()) {
      teamIds.set(t.key, await newTeam({ seasonId: t.seasonId, nameHe: t.nameHe, nameEn: t.nameEn, ...(t.countryHe ? { countryHe: t.countryHe } : { countryHe: 'ישראל', countryEn: 'Israel' }), additionalInfo: { sources: [A.SOURCE] } }));
    }
    let created = 0;
    for (const g of hist.games) {
      let bsId = g.bsRef.id;
      if (!bsId) {
        if (!bsOf.has(g.bsRef.bsOf)) {
          bsOf.set(g.bsRef.bsOf, await newTeam({
            seasonId: g.bsRef.bsOf, nameHe: 'הפועל באר שבע', nameEn: bsTemplate.nameEn, apiFootballId: 563, logoUrl: bsTemplate.logoUrl,
            cityEn: bsTemplate.cityEn, countryEn: bsTemplate.countryEn, founded: bsTemplate.founded, additionalInfo: { sources: [A.SOURCE] },
          }));
        }
        bsId = bsOf.get(g.bsRef.bsOf);
      }
      const oppId = g.oppRef.id || teamIds.get(g.oppRef.key);
      const data = { ...g.data, dateTime: new Date(g.data.dateTime), homeTeamId: g.bsHome ? bsId : oppId, awayTeamId: g.bsHome ? oppId : bsId };
      await prisma.$transaction(async (tx) => {
        const row = await tx.game.create({ data, select: { id: true } });
        await tx.dataImportChange.create({ data: { source: A.SOURCE, batchId, table: 'games', recordId: row.id, field: '*created*', newValue: { ...g.data, homeTeamId: data.homeTeamId, awayTeamId: data.awayTeamId }, basis: 'created', sourceRef: g.ref } });
      });
      created += 1;
    }
    await recordBatch(batchId, STAGE, { created, updated: 0, matched: 0 });
    console.log(`\nhistory: ${created} games, ${teamIds.size + bsOf.size} teams, ${hist.competitions.filter((c) => !have.has(c.id)).length} competitions created — batch ${batchId}. Re-run enrich, goals, round-dates and build-squads.`);
  }

  if (STAGE === 'reconcile') {
    let swapped = 0;
    for (const w of rec.swap) if (await applySwap(batchId, w.game.id, w.ref)) swapped += 1;
    for (const f of rec.fix) await writeChanges(batchId, [{ gameId: f.gameId, ref: f.ref, basis: 'book-correction', changes: f.changes }]);
    let created = 0;
    for (const c of rec.create) {
      await prisma.$transaction(async (tx) => {
        const g = await tx.game.create({ data: { ...c.data, dateTime: new Date(c.data.dateTime) }, select: { id: true } });
        await tx.dataImportChange.create({ data: { source: A.SOURCE, batchId, table: 'games', recordId: g.id, field: '*created*', newValue: c.data, basis: 'created', sourceRef: c.ref } });
      });
      created += 1;
    }
    await recordBatch(batchId, STAGE, { updated: swapped + rec.fix.length, created });
    console.log(`\nreconcile: ${swapped} swapped, ${rec.fix.length} corrected, ${created} created — batch ${batchId}. Re-run enrich, goals and round-dates to fill them.`);
  }

  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
