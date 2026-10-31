#!/usr/bin/env node
'use strict';
/**
 * League games IFA (football.org.il) was scraped for before it went behind Cloudflare
 * (scraped_matches, source 'footballOrgIl', framework 'league') but that never reached the games
 * table. Per season:
 *  - IFA's short club names ("הפועל ק\"ש", "הפ' בני לוד רכבת") are learned from the games both
 *    sides hold — same day and same score, one candidate only; a club we hold no games of is
 *    found by its name written out ("הפ' נוף הגליל" → "הפועל נוף הגליל");
 *  - a scraped game whose two clubs are both in that season's Ligat Ha'Al or Leumit table, and
 *    which we don't hold (same clubs, same day or same round), is created in that league with its
 *    venue and referees; a game we hold with no referee gets IFA's.
 * Anything unclear (a name not learned, clubs of two leagues, a different score) is reported, not written.
 *
 * Ledger: data_import_changes, source 'ifa-scraped-league'; undo with
 *   node scripts/eyal-archive/rollback.js --source ifa-scraped-league --all --apply
 *
 * Usage: node scripts/import-ifa-scraped-league.js --season 2009 [--apply]
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
loadEnv(path.resolve(__dirname, '..', '.env'));

const { PrismaClient } = require('@prisma/client');

const SOURCE = 'ifa-scraped-league';
const LEAGUES = ['comp_liga_haal', 'comp_liga_leumit'];
const arg = (name) => { const i = process.argv.indexOf(name); return i === -1 ? null : process.argv[i + 1]; };
const YEAR = Number(arg('--season'));
const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const day = (d) => d.toISOString().slice(0, 10);
const roundOf = (g) => Number(String(g.roundNameHe || g.roundNameEn || '').replace(/\D/g, '')) || null;

(async () => {
  if (!YEAR) { console.error('--season <year>'); process.exit(1); }
  const scraped = (await prisma.scrapedMatch.findMany({
    where: { source: 'footballOrgIl', season: `${YEAR}/${YEAR + 1}`, framework: 'league', leagueNameHe: null, homeScore: { not: null }, dateTime: { not: null } },
  }));
  const tables = await prisma.standing.findMany({ where: { season: { year: YEAR }, competitionId: { in: LEAGUES } }, select: { teamId: true, seasonId: true, competitionId: true, team: { select: { nameHe: true } } } });
  const leagueOf = new Map(tables.map((t) => [t.teamId, t.competitionId]));
  const seasonId = tables[0]?.seasonId;
  const ours = await prisma.game.findMany({
    where: { season: { year: YEAR } },
    select: { id: true, homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, dateTime: true, roundNameHe: true, roundNameEn: true, refereeHe: true, competitionId: true },
  });

  // IFA name → our team, from games both hold (same day, same score, a single candidate).
  const byKey = new Map();
  for (const g of ours) {
    const k = `${day(g.dateTime)}|${g.homeScore}|${g.awayScore}`;
    byKey.set(k, [...(byKey.get(k) || []), g]);
  }
  const votes = new Map();
  const vote = (name, teamId) => { const m = votes.get(name) || new Map(); m.set(teamId, (m.get(teamId) || 0) + 1); votes.set(name, m); };
  for (const s of scraped) {
    const c = byKey.get(`${day(s.dateTime)}|${s.homeScore}|${s.awayScore}`) || [];
    if (c.length === 1) { vote(s.homeTeamName, c[0].homeTeamId); vote(s.awayTeamName, c[0].awayTeamId); }
  }
  const teamOf = new Map();
  const unclearNames = [];
  for (const [name, m] of votes) {
    const ranked = [...m.entries()].sort((a, b) => b[1] - a[1]);
    // A clear majority of the agreeing games, and a team of a league table.
    if (ranked[0][1] >= 3 && ranked[0][1] >= 3 * (ranked[1]?.[1] || 0) && leagueOf.has(ranked[0][0])) teamOf.set(name, ranked[0][0]);
    else unclearNames.push(name);
  }
  // A club with (almost) no games of ours can't be learned that way: its IFA name, written out,
  // is then the name of exactly one team of the tables ("הפ' נוף הגליל" → "הפועל נוף הגליל").
  const spelled = (n) => String(n).replace(/^הפ' /, 'הפועל ').replace(/\s*\/\s*לא פעיל$/, '').replace(/ ע\. /, ' ').replace(/ עירוני$/, '').replace(/\s+/g, ' ').trim();
  for (const name of [...unclearNames]) {
    const hits = tables.filter((t) => t.team.nameHe === spelled(name));
    if (hits.length === 1) { teamOf.set(name, hits[0].teamId); unclearNames.splice(unclearNames.indexOf(name), 1); }
  }

  const create = [];
  const referee = [];
  const report = { 'name-not-learned': 0, 'two-leagues': 0, 'score-differs': 0, held: 0 };
  const differs = [];
  for (const s of scraped) {
    const home = teamOf.get(s.homeTeamName);
    const away = teamOf.get(s.awayTeamName);
    if (!home || !away) { report['name-not-learned'] += 1; continue; }
    const comp = leagueOf.get(home);
    if (comp !== leagueOf.get(away)) { report['two-leagues'] += 1; continue; }
    const round = Number(String(s.round).replace(/\D/g, '')) || null;
    const g = ours.find((o) => o.homeTeamId === home && o.awayTeamId === away && (day(o.dateTime) === day(s.dateTime) || (round && roundOf(o) === round)));
    if (g) {
      if (g.homeScore !== s.homeScore || g.awayScore !== s.awayScore) { report['score-differs'] += 1; differs.push(`${g.id} ours ${g.homeScore}:${g.awayScore} ifa ${s.homeScore}:${s.awayScore} (${s.sourceId})`); continue; }
      report.held += 1;
      if (!g.refereeHe && s.referee) referee.push({ id: g.id, referee: s.referee, ref: `ifa:${s.sourceId}` });
      continue;
    }
    create.push({
      ref: `ifa:${s.sourceId}`,
      data: {
        seasonId, competitionId: comp, homeTeamId: home, awayTeamId: away, dateTime: s.dateTime,
        homeScore: s.homeScore, awayScore: s.awayScore, status: 'COMPLETED', statusShort: 'FT',
        ...(round ? { roundNameHe: `מחזור ${round}` } : {}),
        ...(s.venue ? { venueNameHe: s.venue } : {}), ...(s.referee ? { refereeHe: s.referee } : {}),
        additionalInfo: { sources: ['footballOrgIl'], ifaRef: s.sourceId, ...(s.homeHalfScore != null ? { halfTime: { home: s.homeHalfScore, away: s.awayHalfScore } } : {}) },
      },
    });
  }
  const per = {};
  for (const c of create) per[c.data.competitionId] = (per[c.data.competitionId] || 0) + 1;
  const total = {};
  for (const g of ours) if (LEAGUES.includes(g.competitionId)) total[g.competitionId] = (total[g.competitionId] || 0) + 1;
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} ${YEAR}/${YEAR + 1} — scraped ${scraped.length}, names learned ${teamOf.size}; create`, per, `referees ${referee.length};`, report, '; league games now', total);
  for (const n of unclearNames) console.log('  unclear name', n);
  for (const d of differs.slice(0, 15)) console.log('  differs', d);
  if (!APPLY) { console.log('\nDry run — re-run with --apply.'); await prisma.$disconnect(); return; }

  const batchId = `${SOURCE}-${YEAR}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  for (const c of create) {
    await prisma.$transaction(async (tx) => {
      const g = await tx.game.create({ data: c.data, select: { id: true } });
      await tx.dataImportChange.create({ data: { source: SOURCE, batchId, table: 'games', recordId: g.id, field: '*created*', newValue: { ...c.data, dateTime: c.data.dateTime.toISOString() }, basis: 'created', sourceRef: c.ref } });
    });
  }
  for (const r of referee) {
    await prisma.$transaction([
      prisma.game.update({ where: { id: r.id }, data: { refereeHe: r.referee } }),
      prisma.dataImportChange.create({ data: { source: SOURCE, batchId, table: 'games', recordId: r.id, field: 'refereeHe', newValue: r.referee, basis: 'fill-empty', sourceRef: r.ref } }),
    ]);
  }
  await prisma.mergeOperation.create({
    data: {
      source: SOURCE, mergeType: 'games', status: 'executed', executedAt: new Date(),
      description: `IFA league games ${YEAR}/${YEAR + 1} from scraped_matches (batch ${batchId})`,
      changesJson: { batchId, created: create.length, referees: referee.length, report }, recordsMatched: report.held, recordsUpdated: referee.length, recordsCreated: create.length,
    },
  });
  console.log(`\ncreated ${create.length} games, ${referee.length} referees — batch ${batchId}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); prisma.$disconnect(); process.exit(1); });
