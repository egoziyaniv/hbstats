#!/usr/bin/env node
'use strict';
/**
 * The league and group tables of Eyal Hatav's book (its "tables" sheet, 1,122 rows), against ours.
 *
 * The book gives each team its place, games, goals and points — no wins, draws or losses.
 *  - a table we hold none of (the historical lower leagues, cup groups, Leumit 1999-2001/2005-06)
 *    is created from the book. Wins/draws/losses are left unknown (additionalInfo.wdlUnknown) —
 *    except Beer Sheva's, counted from its games when we hold all of them. The site shows the
 *    book's order (additionalInfo.bookOrder), not a re-sort by points: before 1980 a tie was
 *    split by goal average, and some tables were frozen mid-season;
 *  - a table we hold in full is only compared, team by team, and the differences reported —
 *    our full tables carry wins/draws/losses the book can't correct consistently.
 * The book writes goals as against:for ("10:63" for Maccabi Tel Aviv's 63 scored). A digit after a
 * name ("הפועל פתח-תקוה9") is a footnote mark: sometimes a points deduction, often not (checked
 * against our tables of 1978-2018), so it is kept as it is and not read as one.
 *
 * Ledger: data_import_changes, source 'eyal-archive', basis 'book-table'; rollback.js undoes it.
 *
 * Usage: node scripts/eyal-archive/tables.js --file <eyal-archive.json> [--apply] [--report <json>]
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

const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const FILE = arg('--file');
const REPORT = arg('--report');
const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const BS_NAME = 'הפועל באר שבע';
const isBsName = (n) => A.normalizeTeamName(n) === A.normalizeTeamName('הפועל באר-שבע');
const STAGES = {
  'גמר-רגל עליון': { en: 'Championship', he: 'פלייאוף עליון' },
  'גמר-רגל אמצעי': { en: 'Middle', he: 'פלייאוף אמצעי' },
  'גמר-רגל תחתון': { en: 'Relegation', he: 'פלייאוף תחתון' },
};

/** "הפועל תל-אביב9" → the name and the book's footnote mark ("9"); what the mark says isn't in the sheet. */
function splitMark(name) {
  const m = String(name || '').match(/^(.*?)(\d+)\s*$/);
  return m ? { name: m[1].trim(), mark: m[2] } : { name: String(name || '').trim(), mark: null };
}

/** "10:63" → for 63, against 10. */
function parseGoals(text) {
  const m = String(text || '').match(/^\s*(\d+)\s*:\s*(\d+)\s*$/);
  return m ? { goalsFor: Number(m[2]), goalsAgainst: Number(m[1]) } : null;
}

/** The competition a book table belongs to, or null. */
function tableCompetition(t, europeComps) {
  const name = t.name.replace(/^טבלת\s+/, '').trim();
  if (/^ליג/.test(name)) {
    if (t.level === 1) return 'comp_liga_haal';
    if (t.level === 2 && name.startsWith('ליגה לאומית')) return 'comp_liga_leumit';
    return A.HISTORY_COMPETITIONS.find((c) => c.league && c.league === A.leagueBaseName(name))?.id || null;
  }
  if (name === 'משחקי המבחן') return 'comp_hist_test_matches';
  if (name === 'הליגה האירופית') return europeComps.get(t.year) || null;
  const target = A.competitionTarget({ 'מסגרת': name, 'רמת ליגה': t.level });
  if (!target || !target.ids) return null;
  if (target.ids.length === 1) return target.ids[0];
  return t.level === 2 ? 'comp_toto_cup_leumit' : 'comp_toto_cup_al';
}

(async () => {
  const archive = JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} — ${A.SOURCE_LABEL_HE}: ${archive.tables.length} table rows`);

  // ── the book's tables ──
  const tables = new Map();
  for (const r of archive.tables) {
    const key = [r['עונה'], r['טבלה'], r['שלב'] || ''].join('|');
    if (!tables.has(key)) {
      tables.set(key, { key, season: r['עונה'], year: A.seasonStartYear(r['עונה']), level: r['רמת ליגה'], name: r['טבלה'], stage: r['שלב'], note: r['הערה'], page: r['עמוד בספר'], rows: [] });
    }
    const { name, mark } = splitMark(r['קבוצה']);
    tables.get(key).rows.push({ ...r, 'קבוצה': name, mark });
  }

  // ── ours ──
  const bsIds = new Set((await prisma.team.findMany({ where: { OR: [{ apiFootballId: 563 }, { nameHe: BS_NAME }] }, select: { id: true } })).map((t) => t.id));
  const seasons = await prisma.season.findMany({
    select: { id: true, year: true, teams: { select: { id: true, nameHe: true, nameEn: true, apiFootballId: true } }, standings: { select: { competitionId: true } } },
  });
  // One season row per year: the one holding Beer Sheva, then the one with tables.
  const seasonOf = new Map();
  const teamsOf = new Map();
  for (const s of seasons) {
    teamsOf.set(s.year, [...(teamsOf.get(s.year) || []), ...s.teams]);
    const prev = seasonOf.get(s.year);
    const hasBs = s.teams.some((t) => bsIds.has(t.id));
    const score = (hasBs ? 2 : 0) + (s.standings.length ? 1 : 0);
    if (!prev || score > prev.score) seasonOf.set(s.year, { id: s.id, score });
  }
  const europeComps = new Map();
  for (const g of await prisma.game.findMany({
    where: { competition: { type: 'EUROPE', OR: [{ nameHe: { contains: 'אירופית' } }, { nameEn: { contains: 'Europa League' } }] }, OR: [{ homeTeamId: { in: [...bsIds] } }, { awayTeamId: { in: [...bsIds] } }] },
    select: { competitionId: true, season: { select: { year: true } } },
  })) europeComps.set(g.season.year, g.competitionId);

  const plan = { create: [], groups: [], teams: new Map(), compSeasons: new Map(), compare: [], skipped: [] };
  const diffs = [];
  for (const t of tables.values()) {
    const compId = tableCompetition(t, europeComps);
    const season = seasonOf.get(t.year);
    if (!compId || !season) { plan.skipped.push({ table: t.key, why: !compId ? 'competition' : 'season' }); continue; }
    const ours = await prisma.standing.findMany({
      where: { seasonId: season.id, competitionId: compId },
      select: { id: true, teamId: true, position: true, played: true, goalsFor: true, goalsAgainst: true, points: true, pointsAdjustment: true, groupNameEn: true, team: { select: { nameHe: true, nameEn: true } } },
    });
    const seasonTeams = teamsOf.get(t.year) || [];
    const bsGames = await prisma.game.findMany({
      where: { seasonId: season.id, competitionId: compId, OR: [{ homeTeamId: { in: [...bsIds] } }, { awayTeamId: { in: [...bsIds] } }], homeScore: { not: null }, awayScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, homeTeam: { select: { id: true, nameHe: true, nameEn: true } }, awayTeam: { select: { id: true, nameHe: true, nameEn: true } } },
    });
    // The season's teams that played Beer Sheva in this competition come first — names are matched among them.
    const opponents = new Map();
    for (const g of bsGames) for (const x of [g.homeTeam, g.awayTeam]) if (!bsIds.has(x.id)) opponents.set(x.id, x);
    const bsTeam = seasonTeams.find((x) => bsIds.has(x.id) && x.apiFootballId != null) || seasonTeams.find((x) => bsIds.has(x.id));

    const findTeam = (bookName) => {
      if (isBsName(bookName)) return bsTeam || null;
      for (const pool of [[...opponents.values()], ours.map((o) => ({ id: o.teamId, ...o.team })), seasonTeams.filter((x) => !bsIds.has(x.id))]) {
        const scored = pool.map((x) => ({ x, s: Math.max(A.teamNameScore(bookName, x.nameHe), A.teamNameScore(bookName, x.nameEn)) }));
        const best = Math.max(0, ...scored.map((y) => y.s));
        const hits = [...new Map(scored.filter((y) => y.s === best && best >= 2).map((y) => [y.x.id, y.x])).values()];
        if (hits.length === 1) return hits[0];
        if (hits.length > 1) return { ambiguous: true };
      }
      return null;
    };

    // A table we hold (as many rows as the book's, or more): compare only.
    if (ours.length >= t.rows.length) {
      const stats = { table: t.key, compId, same: 0, diff: 0, unmatched: 0 };
      for (const r of t.rows) {
        const team = findTeam(r['קבוצה']);
        const row = team && !team.ambiguous ? ours.find((o) => o.teamId === team.id) : null;
        if (!row) { stats.unmatched += 1; diffs.push({ table: t.key, team: r['קבוצה'], why: team?.ambiguous ? 'ambiguous' : 'not in our table' }); continue; }
        const g = parseGoals(r['שערים (זכות:חובה)']);
        const book = { played: r['משחקים'], goalsFor: g?.goalsFor, goalsAgainst: g?.goalsAgainst, points: r['נקודות'] };
        const mine = { played: row.played, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, points: row.points + row.pointsAdjustment };
        const fields = Object.keys(book).filter((k) => book[k] !== mine[k]);
        // The book's play-off tables can count only part of the season; a full row of ours then differs in all four.
        if (fields.length) { stats.diff += 1; diffs.push({ table: t.key, team: r['קבוצה'], mark: r.mark, book, ours: mine, ourPosition: row.position, bookPosition: r['מקום'] }); } else stats.same += 1;
      }
      plan.compare.push(stats);
      continue;
    }

    // A table we hold none (or part) of: the book's rows go in, ours stay.
    const groupHe = t.stage ? STAGES[t.stage]?.he : /^ליג|^טבלת ליג/.test(t.name) ? t.name.replace(/^טבלת\s+/, '') : t.note && /בית/.test(t.note) ? t.note : null;
    const groupEn = t.stage ? STAGES[t.stage]?.en : null;
    // A cup group is Beer Sheva and its opponents: one row and one opponent left over are the same club
    // under another name ("סטיאווה בוקרשט" / "פ.צ.ס.ב").
    const found = new Map(t.rows.map((r) => [r, findTeam(r['קבוצה'])]));
    const left = t.rows.filter((r) => !found.get(r));
    const used = new Set([...found.values()].filter((x) => x && !x.ambiguous).map((x) => x.id));
    const spare = [...opponents.values()].filter((x) => !used.has(x.id));
    if (left.length === 1 && spare.length === 1 && t.rows.length === opponents.size + 1) found.set(left[0], spare[0]);
    for (const r of t.rows) {
      const g = parseGoals(r['שערים (זכות:חובה)']);
      if (!g) { plan.skipped.push({ table: t.key, team: r['קבוצה'], why: 'goals' }); continue; }
      const team = found.get(r);
      if (team?.ambiguous) { plan.skipped.push({ table: t.key, team: r['קבוצה'], why: 'ambiguous' }); continue; }
      let teamRef;
      if (team) {
        // A row we hold stays as it is — only told which play-off group it ended in.
        const held = ours.find((o) => o.teamId === team.id);
        if (held) {
          if (groupEn && !held.groupNameEn) plan.groups.push({ id: held.id, ref: `p${t.page}-t${r.row}`, groupNameEn: groupEn, groupNameHe: groupHe });
          continue;
        }
        teamRef = { id: team.id };
      } else {
        const name = A.displayTeamName(r['קבוצה']);
        const key = `${t.year}|${A.normalizeTeamName(name)}`;
        if (!plan.teams.has(key)) plan.teams.set(key, { key, seasonId: season.id, nameHe: name, nameEn: name, isBs: isBsName(r['קבוצה']) });
        teamRef = { key };
      }
      // Beer Sheva's wins/draws/losses, from its games when we hold every one of them.
      let wdl = null;
      if (isBsName(r['קבוצה']) && bsGames.length === r['משחקים']) {
        const w = { wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
        for (const x of bsGames) {
          const home = bsIds.has(x.homeTeamId);
          const f = home ? x.homeScore : x.awayScore;
          const a = home ? x.awayScore : x.homeScore;
          w.goalsFor += f; w.goalsAgainst += a;
          w[f > a ? 'wins' : f < a ? 'losses' : 'draws'] += 1;
        }
        if (w.goalsFor === g.goalsFor && w.goalsAgainst === g.goalsAgainst) wdl = { wins: w.wins, draws: w.draws, losses: w.losses };
      }
      plan.create.push({
        ref: `p${t.page}-t${r.row}`, teamRef,
        data: {
          seasonId: season.id, competitionId: compId, position: r['מקום'], played: r['משחקים'],
          goalsFor: g.goalsFor, goalsAgainst: g.goalsAgainst, goalsDiff: g.goalsFor - g.goalsAgainst, points: r['נקודות'],
          ...(wdl || {}),
          ...(groupHe ? { groupNameHe: groupHe } : {}), ...(groupEn ? { groupNameEn: groupEn } : {}),
          ...(t.note && !/^בית/.test(t.note) ? { descriptionHe: t.note.replace(/^\(|\)$/g, '') } : {}),
          additionalInfo: { sources: [A.SOURCE], bookOrder: true, ...(wdl ? {} : { wdlUnknown: true }), eyalArchive: { ref: `p${t.page}-t${r.row}`, page: t.page, table: t.name, ...(r.mark ? { footnote: r.mark } : {}) } },
        },
      });
    }
    plan.compSeasons.set(`${compId}|${season.id}`, { competitionId: compId, seasonId: season.id });
  }

  const byComp = {};
  for (const c of plan.create) byComp[c.data.competitionId] = (byComp[c.data.competitionId] || 0) + 1;
  console.log(`\ncreate: ${plan.create.length} table rows (${plan.create.filter((c) => !c.data.additionalInfo.wdlUnknown).length} with W/D/L from our games), ${plan.teams.size} new teams; by competition`, byComp);
  console.log(`groups: ${plan.groups.length} rows of ours get their play-off group`);
  const skipWhy = {};
  for (const s of plan.skipped) skipWhy[s.why] = (skipWhy[s.why] || 0) + 1;
  console.log('skipped:', skipWhy);
  for (const s of plan.skipped.filter((x) => x.why !== 'goals').slice(0, 20)) console.log(`  ${s.table} ${s.team || ''} — ${s.why}`);
  console.log(`\ncompare (tables we hold): ${plan.compare.length} tables`);
  for (const c of plan.compare) if (c.diff || c.unmatched) console.log(`  ${c.table} → same ${c.same}, differ ${c.diff}, not found ${c.unmatched}`);
  console.log(`  all agree: ${plan.compare.filter((c) => !c.diff && !c.unmatched).map((c) => c.table.split('|')[0]).join(' ')}`);
  if (process.argv.includes('--teams')) for (const t of plan.teams.values()) console.log(`  new team ${t.key}`);
  if (REPORT) fs.writeFileSync(REPORT, JSON.stringify({ create: plan.create, teams: [...plan.teams.values()], compare: plan.compare, diffs, skipped: plan.skipped }, null, 1));

  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${A.SOURCE}-tables-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const ledger = (table, recordId, newValue, ref) => ({ source: A.SOURCE, batchId, table, recordId, field: '*created*', newValue, basis: 'book-table', ...(ref ? { sourceRef: ref } : {}) });
  const bsTemplate = await prisma.team.findFirst({ where: { apiFootballId: 563 }, orderBy: { createdAt: 'asc' } });
  const teamIds = new Map();
  for (const t of plan.teams.values()) {
    const data = t.isBs
      ? { seasonId: t.seasonId, nameHe: BS_NAME, nameEn: bsTemplate.nameEn, apiFootballId: 563, logoUrl: bsTemplate.logoUrl, cityEn: bsTemplate.cityEn, countryEn: bsTemplate.countryEn, founded: bsTemplate.founded, additionalInfo: { sources: [A.SOURCE] } }
      : { seasonId: t.seasonId, nameHe: t.nameHe, nameEn: t.nameEn, countryHe: 'ישראל', countryEn: 'Israel', additionalInfo: { sources: [A.SOURCE] } };
    const row = await prisma.team.create({ data, select: { id: true } });
    await prisma.dataImportChange.create({ data: ledger('teams', row.id, data) });
    teamIds.set(t.key, row.id);
  }
  let created = 0;
  for (const c of plan.create) {
    const data = { ...c.data, teamId: c.teamRef.id || teamIds.get(c.teamRef.key) };
    await prisma.$transaction(async (tx) => {
      const row = await tx.standing.create({ data, select: { id: true } });
      await tx.dataImportChange.create({ data: ledger('standings', row.id, data, c.ref) });
    });
    created += 1;
  }
  for (const u of plan.groups) {
    const old = await prisma.standing.findUnique({ where: { id: u.id }, select: { groupNameEn: true, groupNameHe: true } });
    await prisma.$transaction([
      prisma.standing.update({ where: { id: u.id }, data: { groupNameEn: u.groupNameEn, groupNameHe: u.groupNameHe } }),
      prisma.dataImportChange.createMany({
        data: ['groupNameEn', 'groupNameHe'].map((f) => ({ source: A.SOURCE, batchId, table: 'standings', recordId: u.id, field: f, oldValue: old[f] ?? undefined, newValue: u[f], basis: 'book-table', sourceRef: u.ref })),
      }),
    ]);
  }
  // The standings page lists a season's competitions from competition_seasons.
  let compSeasons = 0;
  for (const cs of plan.compSeasons.values()) {
    if (await prisma.competitionSeason.findFirst({ where: cs })) continue;
    const row = await prisma.competitionSeason.create({ data: cs, select: { id: true } });
    await prisma.dataImportChange.create({ data: ledger('competition_seasons', row.id, cs) });
    compSeasons += 1;
  }
  await prisma.mergeOperation.create({
    data: {
      source: A.SOURCE, mergeType: 'tables', status: 'executed', executedAt: new Date(),
      description: `${A.SOURCE_LABEL_HE} — tables (batch ${batchId})`,
      changesJson: { batchId, standings: created, teams: teamIds.size, competitionSeasons: compSeasons },
      recordsMatched: 0, recordsUpdated: 0, recordsCreated: created,
    },
  });
  console.log(`\ncreated ${created} table rows, ${teamIds.size} teams, ${compSeasons} competition seasons — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
