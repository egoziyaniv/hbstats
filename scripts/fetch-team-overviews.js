/**
 * fetch-team-overviews.js — pull Wikipedia infoboxes + generate Claude AI
 * narratives for every team in the latest season. Stores under
 * Team.wikiInfo and Team.aiSummary.
 *
 * Usage:
 *   node scripts/fetch-team-overviews.js                # all latest-season teams
 *   node scripts/fetch-team-overviews.js --team <id>    # single team
 *   node scripts/fetch-team-overviews.js --only wiki    # skip AI
 *   node scripts/fetch-team-overviews.js --only ai      # skip Wikipedia
 */
'use strict';
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai').default || require('openai');
const prisma = new PrismaClient();

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', null);
const TEAM_ID = arg('team', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWikiSummary(title, lang) {
  // REST API summary endpoint
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'HBStats/1.0 (hbs.co.il)' } });
  if (!res.ok) return null;
  const data = await res.json();
  if (data.type === 'disambiguation' || !data.extract) return null;
  return {
    title: data.title,
    description: data.description || null,
    summary: data.extract,
    thumbnail: data.thumbnail?.source || null,
    sourceUrl: data.content_urls?.desktop?.page || url,
    lang,
  };
}

async function fetchWiki(team) {
  // Try Hebrew first (most accurate for Israeli teams), fall back to English.
  for (const [title, lang] of [[team.nameHe, 'he'], [team.nameEn, 'en']]) {
    if (!title) continue;
    const w = await fetchWikiSummary(title.replace(/\s+/g, '_'), lang);
    if (w) return w;
  }
  return null;
}

async function buildStatsSnapshot(team) {
  const [allStandings, games, leagueGames, topScorer, topAssist, coachLatest, cupGames, superCupGame] = await Promise.all([
    prisma.standing.findMany({
      where: { teamId: team.id, seasonId: team.seasonId },
      include: { competition: { select: { nameHe: true, nameEn: true } } },
      orderBy: { position: 'asc' },
    }),
    prisma.game.findMany({
      where: {
        seasonId: team.seasonId, status: 'COMPLETED',
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, dateTime: true },
      orderBy: { dateTime: 'desc' }, take: 5,
    }),
    // Full league season including playoff — used to compute true W/D/L/goals.
    // Excludes cup competitions, so works for both Ligat HaAl and National League teams.
    prisma.game.findMany({
      where: {
        seasonId: team.seasonId, status: 'COMPLETED',
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        competition: {
          NOT: {
            OR: [
              { nameEn: { contains: 'Cup' } },
              { nameEn: { contains: 'Toto' } },
              { nameHe: { contains: 'גביע' } },
            ],
          },
        },
      },
      select: { homeTeamId: true, homeScore: true, awayScore: true },
    }),
    prisma.competitionLeaderboardEntry.findFirst({
      where: { seasonId: team.seasonId, category: 'TOP_SCORERS', teamNameEn: team.nameEn },
      orderBy: { value: 'desc' },
    }),
    prisma.competitionLeaderboardEntry.findFirst({
      where: { seasonId: team.seasonId, category: 'TOP_ASSISTS', teamNameEn: team.nameEn },
      orderBy: { value: 'desc' },
    }),
    prisma.teamCoachAssignment.findFirst({
      where: { teamId: team.id }, orderBy: { startDate: 'desc' },
    }),
    // State Cup: pull final round if team participated
    prisma.game.findFirst({
      where: {
        seasonId: team.seasonId,
        competition: { nameEn: { contains: 'State Cup' } },
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        roundNameEn: { contains: 'Final' },
        status: 'COMPLETED',
      },
      include: { homeTeam: { select: { nameHe: true, nameEn: true } }, awayTeam: { select: { nameHe: true, nameEn: true } } },
      orderBy: { dateTime: 'desc' },
    }),
    // Super Cup
    prisma.game.findFirst({
      where: {
        seasonId: team.seasonId,
        competition: { nameEn: { contains: 'Super Cup' } },
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
        status: 'COMPLETED',
      },
      include: { homeTeam: { select: { nameHe: true } }, awayTeam: { select: { nameHe: true } } },
      orderBy: { dateTime: 'desc' },
    }),
  ]);

  // Determine league finish — prefer Championship Group position, else regular table
  const champGroup = allStandings.find((s) => /championship/i.test(s.groupNameEn || ''));
  const regular = allStandings.find((s) => !s.groupNameEn);
  const finalStanding = champGroup || regular;

  // True season totals from completed Ligat HaAl games — includes playoff.
  const seasonAggregate = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0 };
  for (const g of leagueGames) {
    if (g.homeScore == null || g.awayScore == null) continue;
    const isHome = g.homeTeamId === team.id;
    const our = isHome ? g.homeScore : g.awayScore;
    const their = isHome ? g.awayScore : g.homeScore;
    seasonAggregate.played++;
    seasonAggregate.goalsFor += our;
    seasonAggregate.goalsAgainst += their;
    if (our > their) seasonAggregate.wins++;
    else if (our < their) seasonAggregate.losses++;
    else seasonAggregate.draws++;
  }

  function whoWon(g, isCup = true) {
    if (!g || g.homeScore == null || g.awayScore == null) return null;
    const teamIsHome = g.homeTeamId === team.id;
    const our = teamIsHome ? g.homeScore : g.awayScore;
    const their = teamIsHome ? g.awayScore : g.homeScore;
    if (our > their) return 'won';
    if (our < their) return 'lost';
    // Tie in cup → check penalties via gameStats not loaded here; report tie + opponent
    return 'tied';
  }

  const cupResult = cupGames ? {
    round: cupGames.roundNameHe || cupGames.roundNameEn,
    result: whoWon(cupGames),
    opponent: cupGames.homeTeamId === team.id ? (cupGames.awayTeam.nameHe || cupGames.awayTeam.nameEn) : (cupGames.homeTeam.nameHe || cupGames.homeTeam.nameEn),
    score: `${cupGames.homeScore}-${cupGames.awayScore}`,
  } : null;

  const superCupResult = superCupGame ? {
    result: whoWon(superCupGame),
    opponent: superCupGame.homeTeamId === team.id ? (superCupGame.awayTeam.nameHe) : (superCupGame.homeTeam.nameHe),
    score: `${superCupGame.homeScore}-${superCupGame.awayScore}`,
  } : null;

  const last5 = games.map((g) => {
    const isHome = g.homeTeamId === team.id;
    const our = isHome ? g.homeScore : g.awayScore;
    const their = isHome ? g.awayScore : g.homeScore;
    if (our == null || their == null) return '?';
    if (our > their) return 'W';
    if (our < their) return 'L';
    return 'D';
  }).join('');

  return { finalStanding, regular, champGroup, seasonAggregate, last5, topScorer, topAssist, coachLatest, cupResult, superCupResult };
}

async function generateAiNarrative(team, snapshot, wiki, apiKey) {
  if (!apiKey) {
    console.log('  no OpenAI API key, skipping AI');
    return null;
  }
  const client = new OpenAI({ apiKey });

  const facts = [];
  // Trophies first — most important for narrative impact.
  const agg = snapshot.seasonAggregate;
  const aggText = agg && agg.played > 0
    ? ` (${agg.played} משחקים בליגה כולל פלייאוף: ${agg.wins}נ' ${agg.draws}ת' ${agg.losses}ה', שערים ${agg.goalsFor}-${agg.goalsAgainst})`
    : '';
  const leagueName = snapshot.finalStanding?.competition?.nameHe || snapshot.finalStanding?.competition?.nameEn || 'הליגה';
  if (snapshot.finalStanding?.position === 1) facts.push(`🏆 אלופת ${leagueName} בעונה ${team.season.name}${aggText}`);
  else if (snapshot.finalStanding) facts.push(`מקום ${snapshot.finalStanding.position} ב${leagueName}${snapshot.finalStanding.groupNameEn ? ` (${snapshot.finalStanding.groupNameEn})` : ''}${aggText}`);
  else if (agg && agg.played > 0) facts.push(`עונת ${team.season.name}${aggText}`);
  if (snapshot.cupResult) {
    if (snapshot.cupResult.result === 'won') facts.push(`🏆 זוכת גביע המדינה — ניצחה את ${snapshot.cupResult.opponent} ${snapshot.cupResult.score} בגמר`);
    else if (snapshot.cupResult.result === 'lost') facts.push(`סגנית בגמר גביע המדינה — הפסידה ל${snapshot.cupResult.opponent} ${snapshot.cupResult.score}`);
    else facts.push(`הגיעה לגמר גביע המדינה מול ${snapshot.cupResult.opponent}`);
  }
  if (snapshot.superCupResult) {
    if (snapshot.superCupResult.result === 'won') facts.push(`🏆 זוכת אלוף האלופים — ניצחה את ${snapshot.superCupResult.opponent} ${snapshot.superCupResult.score}`);
    else if (snapshot.superCupResult.result === 'lost') facts.push(`הפסידה באלוף האלופים ל${snapshot.superCupResult.opponent} ${snapshot.superCupResult.score}`);
  }
  if (snapshot.last5) facts.push(`5 משחקים אחרונים: ${snapshot.last5}`);
  if (snapshot.topScorer) facts.push(`כובש מוביל: ${snapshot.topScorer.playerNameHe || snapshot.topScorer.playerNameEn} עם ${snapshot.topScorer.value} שערים`);
  if (snapshot.topAssist) facts.push(`מבשל מוביל: ${snapshot.topAssist.playerNameHe || snapshot.topAssist.playerNameEn} עם ${snapshot.topAssist.value} בישולים`);
  if (snapshot.coachLatest) facts.push(`מאמן: ${snapshot.coachLatest.coachNameHe || snapshot.coachLatest.coachNameEn}`);
  if (wiki?.summary) facts.push(`רקע: ${wiki.summary.slice(0, 300)}`);

  // The model occasionally hallucinated the season year (e.g. wrote
  // "2023-2024" for a 2025/26 team with sparse data). Lock it down: explicit
  // SEASON variable + a system message that bans any deviation.
  const seasonName = team.season.name;
  const systemMessage =
    `אתה כותב סקירה תמציתית בעברית על קבוצת כדורגל ישראלית בעונה ספציפית. ` +
    `אסור להזכיר שום עונה אחרת חוץ מ-${seasonName}. ` +
    `אסור להמציא נתון שלא מופיע בעובדות שיינתנו. ` +
    `אסור להזכיר את ${seasonName === '2025/26' ? '2024/25, 2023/24 או שנים אחרות' : 'שנים אחרות'}. ` +
    `כתוב 3-5 משפטים, טון עובדתי. במשפט הראשון חייב להופיע "${seasonName}" כשם העונה.`;

  const prompt =
    `קבוצה: ${team.nameHe}\n` +
    `עונה: ${seasonName}\n\n` +
    `עובדות מאומתות (השתמש אך ורק בהן, אסור להמציא, אסור להוסיף שנים אחרות):\n` +
    `${facts.map((f) => `- ${f}`).join('\n')}\n\n` +
    `הנחיות נוספות:\n` +
    `- אם יש תארים (🏆), פתח איתם.\n` +
    `- אל תכתוב על קבוצות אחרות מלבד ${team.nameHe}.\n` +
    `- אם אין נתונים מספיקים — כתוב משפט אחד בלבד שמציין את שם הקבוצה ועונה ${seasonName}.\n`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 400,
    temperature: 0.3, // less hallucination
    messages: [
      { role: 'system', content: systemMessage },
      { role: 'user', content: prompt },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() || null;
}

async function getOpenAIKey() {
  const row = await prisma.siteSetting.findUnique({ where: { key: 'ai_api_key_openai' } });
  const v = row?.valueJson;
  return typeof v === 'string' ? v : null;
}

async function processTeam(team, apiKey) {
  console.log(`\n• ${team.nameHe} / ${team.nameEn} (${team.season.name})`);
  let wiki = team.wikiInfo;
  if (ONLY !== 'ai' && (!wiki || (Date.now() - new Date(wiki.fetchedAt).getTime()) > 7 * 24 * 3600 * 1000)) {
    const w = await fetchWiki(team);
    if (w) {
      wiki = { ...w, fetchedAt: new Date().toISOString() };
      console.log('  ✓ wiki:', w.title, '(' + w.lang + ')');
    } else {
      console.log('  · wiki not found');
    }
    await sleep(500); // be polite to Wikipedia
  }

  let aiSummary = team.aiSummary;
  if (ONLY !== 'wiki') {
    const snapshot = await buildStatsSnapshot(team);
    const text = await generateAiNarrative(team, snapshot, wiki, apiKey);
    if (text) {
      aiSummary = { text, generatedAt: new Date().toISOString(), locale: 'he' };
      console.log('  ✓ ai: ' + text.slice(0, 80) + '...');
    }
    await sleep(300);
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { wikiInfo: wiki || undefined, aiSummary: aiSummary || undefined },
  });
}

async function main() {
  let teams;
  if (TEAM_ID) {
    teams = await prisma.team.findMany({ where: { id: TEAM_ID }, include: { season: true } });
  } else {
    const latestSeason = await prisma.season.findFirst({ orderBy: { year: 'desc' } });
    teams = await prisma.team.findMany({
      where: { seasonId: latestSeason.id },
      include: { season: true },
      orderBy: { nameHe: 'asc' },
    });
  }
  const apiKey = ONLY === 'wiki' ? null : await getOpenAIKey();
  console.log(`Teams to process: ${teams.length} (AI: ${apiKey ? 'enabled' : 'disabled'})`);
  for (const t of teams) {
    try { await processTeam(t, apiKey); } catch (e) { console.log('  ! ' + t.nameHe + ':', e.message.slice(0, 100)); }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
