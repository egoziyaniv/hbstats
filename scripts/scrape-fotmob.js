'use strict';
/**
 * scrape-fotmob.js — pull rich match data from fotmob.com for a game or a
 * team's season. FotMob's `/api/matchDetails` needs a signed token (404 without
 * it), BUT the match PAGE is plain-curl accessible from our server (HTTP 200,
 * no Cloudflare, no token) and embeds the whole match object in the Next.js
 * `__NEXT_DATA__` script — including the data no other source gives us for
 * these ties: per-shot xG/xGOT, per-player FotMob rating + xG + xA, minute-by-
 * minute momentum, attendance + weather. No Firecrawl credits needed.
 *
 * Stores FotmobMatchData (shotmap / momentum / playerStats / matchInfo, all
 * oriented to OUR home/away) and fills GameStatistics.homeXg/awayXg (team xG =
 * sum of shot xG) so the game page's xG row finally populates.
 *
 * Usage:
 *   node scripts/scrape-fotmob.js --game <gameId> --match <fotmobMatchId> [--dry]
 *   node scripts/scrape-fotmob.js --game <gameId> --url <fotmob-match-url> [--dry]
 *   node scripts/scrape-fotmob.js --team 563 --season 2026 [--limit N] [--dry]
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const GAME_ID = arg('game', null);
const MATCH_ID = arg('match', null);
const URL_ARG = arg('url', null);
const TEAM_AF = parseInt(arg('team', '0'), 10) || null;
const SEASON = parseInt(arg('season', '0'), 10) || null;
const LIMIT = parseInt(arg('limit', '0'), 10) || null;
const DRY = process.argv.includes('--dry');

// our Team.apiFootballId → FotMob team id (Ligat Ha'al clubs; resolved from
// FotMob league 127). Keep in sync with FM_TEAMS in matchday-live.js.
const AF_TO_FM = {
  657: 8173, 4481: 8718, 563: 9754, 2253: 8301, 4486: 459591, 4488: 9755,
  4489: 89753, 4501: 10181, 4510: 2095, 4195: 10185, 4505: 1832, 4495: 7929,
  604: 7855, 6181: 543580,
};
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchNextData(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (res.status !== 200) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('no __NEXT_DATA__');
  return JSON.parse(m[1]);
}

const OUTCOME = (eventType, isBlocked) => {
  const t = String(eventType || '').toLowerCase();
  if (t === 'goal') return 'goal';
  if (t.includes('save') || t === 'attemptsaved') return 'save';
  if (t === 'post' || t.includes('woodwork')) return 'post';
  if (isBlocked || t.includes('block')) return 'block';
  return 'miss';
};
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v !== '' && !isNaN(+v) ? +v : null));
const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.'`-]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);

function extract(nd) {
  const pp = nd.props.pageProps;
  const c = pp.content || {};
  const g = pp.general || {};
  const mf = c.matchFacts || {};
  const fmHomeId = g.homeTeam?.id;
  return { c, g, mf, fmHomeId };
}

// Normalize + store one match. `flip` = FotMob home is OUR away.
async function importMatch(gameId, fotmobId, nd, flip, fmHomeId) {
  const { c, mf } = extract(nd);

  // Map FotMob's English player names to our Hebrew names (surname token +
  // first initial, diacritic-insensitive) using the two clubs' rosters. Foreign
  // opponents we don't have stay in English.
  const gm = await prisma.game.findUnique({ where: { id: gameId }, select: { homeTeamId: true, awayTeamId: true } });
  const roster = gm ? await prisma.player.findMany({ where: { teamId: { in: [gm.homeTeamId, gm.awayTeamId] } }, select: { nameEn: true, nameHe: true } }) : [];
  const nameIdx = new Map();
  for (const p of roster) {
    if (!p.nameEn || !p.nameHe) continue;
    const tk = tokens(p.nameEn);
    if (!tk.length || !tk[0]) continue;
    const key = `${tk[tk.length - 1]}|${tk[0][0]}`;
    if (!nameIdx.has(key)) nameIdx.set(key, new Set());
    nameIdx.get(key).add(p.nameHe);
  }
  const toHe = (en) => {
    const tk = tokens(en);
    if (!tk.length || !tk[0]) return en;
    const cands = nameIdx.get(`${tk[tk.length - 1]}|${tk[0][0]}`);
    return cands && cands.size === 1 ? [...cands][0] : en;
  };

  // ── shotmap (px/py: OUR home attacks right) ──
  const rawShots = c.shotmap?.shots || (Array.isArray(c.shotmap) ? c.shotmap : []) || [];
  const shotmap = rawShots.map((s) => {
    const ourHome = (s.teamId === fmHomeId) !== flip;
    const fx = num(s.x); const fy = num(s.y);
    return {
      isHome: ourHome,
      player: s.playerName || '',
      min: s.min ?? null,
      outcome: OUTCOME(s.eventType, s.isBlocked),
      xg: num(s.expectedGoals),
      xgot: num(s.expectedGoalsOnTarget),
      situation: s.situation || null,
      shotType: s.shotType || null,
      // FotMob normalises every shot to attack x≈100. Put OUR home on the right
      // (px=fx) and OUR away on the left (mirror both axes).
      px: fx == null ? null : (ourHome ? fx : 100 - fx),
      py: fy == null ? null : (ourHome ? fy : 100 - fy),
    };
  }).filter((s) => s.px != null && s.py != null);

  // ── momentum (positive = OUR home) + goal markers ──
  const rawMom = c.momentum?.main?.data || c.momentum?.data || [];
  const momData = rawMom.map((d) => ({ minute: d.minute, value: flip ? -(d.value || 0) : (d.value || 0) }));
  const goalEvents = ((mf.events?.events || (Array.isArray(mf.events) ? mf.events : [])) || [])
    .filter((e) => String(e.type).toLowerCase() === 'goal')
    .map((e) => ({ minute: e.time ?? e.timeStr ?? null, isHome: (!!e.isHome) !== flip, player: e.player?.name || '' }));

  // ── player stats ──
  const st = (key, group) => group?.[key]?.stat?.value ?? null;
  const playerStats = Object.values(c.playerStats || {}).map((p) => {
    const top = (p.stats || []).find((x) => x.key === 'top_stats')?.stats || {};
    return {
      isHome: (p.teamId === fmHomeId) !== flip,
      name: toHe(p.name || ''),
      isGK: !!p.isGoalkeeper,
      rating: st('FotMob rating', top),
      minutes: st('Minutes played', top),
      goals: st('Goals', top),
      assists: st('Assists', top),
      xg: st('Expected goals (xG)', top),
      xgot: st('Expected goals on target (xGOT)', top),
      xa: st('Expected assists (xA)', top),
      xgxa: st('xG + xA', top),
      shots: st('Total shots', top),
      chancesCreated: st('Chances created', top),
      defActions: st('Defensive actions', top),
    };
  }).filter((p) => p.rating != null || p.minutes != null);

  // ── team stats (full panel + mapped into GameStatistics) ──
  const numify = (v) => { if (v == null) return null; if (typeof v === 'number') return v; const m = String(v).match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
  const statGroups = c.stats?.Periods?.All?.stats || [];
  const teamStats = [];
  const gsMap = {};
  const GS_KEY = { BallPossesion: 'Possession', total_shots: 'ShotsTotal', ShotsOnTarget: 'ShotsOnTarget', corners: 'Corners', fouls: 'Fouls', Offsides: 'Offsides', yellow_cards: 'YellowCards', red_cards: 'RedCards' };
  for (const grp of statGroups) {
    for (const it of (grp.stats || [])) {
      let hv = it.stats && it.stats[0], av = it.stats && it.stats[1];
      if (hv == null && av == null) continue; // group header row
      if (flip) { const t = hv; hv = av; av = t; }
      teamStats.push({ section: grp.title || 'Other', label: it.title || it.key, home: String(hv ?? ''), away: String(av ?? '') });
      const gk = GS_KEY[it.key];
      if (gk && gsMap[`home${gk}`] === undefined) { gsMap[`home${gk}`] = numify(hv); gsMap[`away${gk}`] = numify(av); }
    }
  }

  // ── match info ──
  const ib = mf.infoBox || {};
  const w = c.weather || {};
  const matchInfo = {
    attendance: num(ib.Attendance),
    stadium: ib.Stadium ? { name: ib.Stadium.name, city: ib.Stadium.city, country: ib.Stadium.country, capacity: ib.Stadium.capacity, surface: ib.Stadium.surface } : null,
    referee: ib.Referee ? { name: ib.Referee.text, country: ib.Referee.country } : null,
    weather: (w.temperature != null || w.description) ? { temperature: w.temperature ?? null, description: w.description || w.defaultTitle || null, iconCode: w.iconCode ?? null, windSpeed: w.windSpeed ?? null, humidity: w.relativeHumidity ?? null } : null,
  };

  // ── team xG (sum of shot xG per side) ──
  const sumXg = (home) => {
    const v = shotmap.filter((s) => s.isHome === home && s.xg != null).reduce((a, s) => a + s.xg, 0);
    return shotmap.some((s) => s.isHome === home && s.xg != null) ? Math.round(v * 100) / 100 : null;
  };
  const homeXg = sumXg(true); const awayXg = sumXg(false);

  console.log(`  game ${gameId} ← fotmob ${fotmobId} | shots=${shotmap.length} momentum=${momData.length} players=${playerStats.length} teamStats=${teamStats.length} xG ${homeXg ?? '-'}/${awayXg ?? '-'} att=${matchInfo.attendance ?? '-'} flip=${flip}`);
  if (DRY) return;

  await prisma.fotmobMatchData.upsert({
    where: { gameId },
    create: { gameId, fotmobId: String(fotmobId), shotmap, momentum: { data: momData, goals: goalEvents }, playerStats, teamStats, matchInfo },
    update: { fotmobId: String(fotmobId), shotmap, momentum: { data: momData, goals: goalEvents }, playerStats, teamStats, matchInfo, scrapedAt: new Date() },
  });
  const statsData = { ...gsMap };
  if (homeXg != null) statsData.homeXg = homeXg;
  if (awayXg != null) statsData.awayXg = awayXg;
  if (Object.keys(statsData).length) {
    await prisma.gameStatistics.upsert({ where: { gameId }, create: { gameId, ...statsData }, update: statsData });
  }
}

async function resolveFlip(game, fmHomeId, trackedAf) {
  const fmTracked = AF_TO_FM[trackedAf];
  const ourHomeTracked = game.homeTeam.apiFootballId === trackedAf;
  const fmHomeTracked = fmHomeId === fmTracked;
  return ourHomeTracked !== fmHomeTracked;
}

// Collect {id, date} fixtures from a FotMob team OVERVIEW page. The fixtures
// live in the Next.js SWR `fallback` (key team-<id>), each shaped
// {id, status:{utcTime}, opponent:{name}}.
function collectFixtures(nd) {
  const out = new Map();
  const visit = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 8) return;
    if (Array.isArray(o)) { for (const x of o) visit(x, depth + 1); return; }
    const id = o.id;
    const t = o.status?.utcTime;
    if (id && t && (o.opponent || o.home || o.away)) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (!out.has(d)) out.set(d, { id: String(id), date: d });
    }
    for (const k of Object.keys(o)) visit(o[k], depth + 1);
  };
  visit(nd.props.pageProps.fallback || nd.props.pageProps, 0);
  return [...out.values()];
}

async function main() {
  console.log(`=== scrape-fotmob ${DRY ? '(DRY)' : ''} ===`);

  if (GAME_ID) {
    const game = await prisma.game.findUnique({ where: { id: GAME_ID }, select: { id: true, dateTime: true, homeTeam: { select: { apiFootballId: true } }, awayTeam: { select: { apiFootballId: true } } } });
    if (!game) { console.error('game not found'); process.exit(1); }
    const trackedAf = AF_TO_FM[game.homeTeam.apiFootballId] ? game.homeTeam.apiFootballId : game.awayTeam.apiFootballId;
    let matchId = MATCH_ID;
    if (!matchId && !URL_ARG) {
      // auto-resolve the FotMob match id from the tracked team's overview, by date
      const trackedFm = AF_TO_FM[trackedAf];
      if (!trackedFm) { console.error('no FotMob team id for this game — pass --match'); process.exit(1); }
      const target = game.dateTime ? new Date(game.dateTime).toISOString().slice(0, 10) : null;
      const teamNd = await fetchNextData(`https://www.fotmob.com/teams/${trackedFm}/overview`).catch(() => null);
      const fx = teamNd ? collectFixtures(teamNd).find((f) => f.date === target) : null;
      if (!fx) { console.error('could not resolve FotMob match by date — pass --match'); process.exit(1); }
      matchId = fx.id;
    }
    const nd = matchId ? await fetchNextData(`https://www.fotmob.com/match/${matchId}`) : await fetchNextData(URL_ARG);
    const { fmHomeId } = extract(nd);
    const fotmobId = matchId || nd.props.pageProps.general?.matchId;
    const flip = await resolveFlip(game, fmHomeId, trackedAf);
    await importMatch(GAME_ID, fotmobId, nd, flip, fmHomeId);
    await prisma.$disconnect();
    return;
  }

  if (TEAM_AF && SEASON) {
    const fmTeam = AF_TO_FM[TEAM_AF];
    if (!fmTeam) { console.error(`no FotMob id for af=${TEAM_AF}`); process.exit(1); }
    const s = await prisma.season.findFirst({ where: { year: SEASON }, select: { id: true } });
    const teams = await prisma.team.findMany({ where: { apiFootballId: TEAM_AF, seasonId: s.id }, select: { id: true } });
    const teamIds = teams.map((t) => t.id);
    let games = await prisma.game.findMany({
      where: { seasonId: s.id, status: 'COMPLETED', OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }] },
      select: { id: true, dateTime: true, homeTeam: { select: { apiFootballId: true, nameHe: true } }, awayTeam: { select: { apiFootballId: true, nameHe: true } } },
      orderBy: { dateTime: 'desc' },
    });
    if (LIMIT) games = games.slice(0, LIMIT);
    console.log(`  ${games.length} completed games; resolving FotMob fixtures for team ${fmTeam}...`);
    const teamNd = await fetchNextData(`https://www.fotmob.com/teams/${fmTeam}/overview`).catch(() => null);
    const fixtures = teamNd ? collectFixtures(teamNd) : [];
    const byDate = new Map(fixtures.map((f) => [f.date, f]));
    console.log(`  found ${fixtures.length} FotMob fixtures`);
    let ok = 0, miss = 0;
    for (const gm of games) {
      const target = gm.dateTime ? new Date(gm.dateTime).toISOString().slice(0, 10) : null;
      const fx = target ? byDate.get(target) : null;
      const label = `${gm.homeTeam.nameHe} vs ${gm.awayTeam.nameHe} (${target})`;
      if (!fx) { console.log(`  · SKIP ${label} — no FotMob fixture on that date`); miss++; continue; }
      try {
        const nd = await fetchNextData(`https://www.fotmob.com/match/${fx.id}`);
        const { fmHomeId } = extract(nd);
        const trackedAf = TEAM_AF;
        const flip = await resolveFlip(gm, fmHomeId, trackedAf);
        await importMatch(gm.id, fx.id, nd, flip, fmHomeId);
        ok++;
      } catch (e) { console.log(`  ✗ ${label}: ${e.message}`); }
      await sleep(600);
    }
    console.log(`Done. imported=${ok} skipped=${miss}`);
    await prisma.$disconnect();
    return;
  }

  console.error('Pass --game <id> --match <fotmobId>, or --team <af> --season <year>.');
  process.exit(1);
}

main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
