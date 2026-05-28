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
  // Gather the facts the AI narrative will use.
  const [standing, games, topScorer, topAssist, coachLatest] = await Promise.all([
    prisma.standing.findFirst({
      where: { teamId: team.id, competition: { is: { id: 'comp_liga_haal' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.game.findMany({
      where: {
        seasonId: team.seasonId,
        status: 'COMPLETED',
        OR: [{ homeTeamId: team.id }, { awayTeamId: team.id }],
      },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, dateTime: true },
      orderBy: { dateTime: 'desc' },
      take: 5,
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
      where: { teamId: team.id },
      orderBy: { startDate: 'desc' },
    }),
  ]);

  const last5 = games.map((g) => {
    const isHome = g.homeTeamId === team.id;
    const our = isHome ? g.homeScore : g.awayScore;
    const their = isHome ? g.awayScore : g.homeScore;
    if (our == null || their == null) return '?';
    if (our > their) return 'W';
    if (our < their) return 'L';
    return 'D';
  }).join('');

  return { standing, last5, topScorer, topAssist, coachLatest };
}

async function generateAiNarrative(team, snapshot, wiki, apiKey) {
  if (!apiKey) {
    console.log('  no OpenAI API key, skipping AI');
    return null;
  }
  const client = new OpenAI({ apiKey });

  const facts = [];
  if (snapshot.standing) facts.push(`מקום ${snapshot.standing.position} בליגה (${snapshot.standing.points} נק', ${snapshot.standing.wins}נ' ${snapshot.standing.draws}ת' ${snapshot.standing.losses}ה')`);
  if (snapshot.last5) facts.push(`5 משחקים אחרונים: ${snapshot.last5}`);
  if (snapshot.topScorer) facts.push(`כובש מוביל: ${snapshot.topScorer.playerNameHe || snapshot.topScorer.playerNameEn} עם ${snapshot.topScorer.value} שערים`);
  if (snapshot.topAssist) facts.push(`מבשל מוביל: ${snapshot.topAssist.playerNameHe || snapshot.topAssist.playerNameEn} עם ${snapshot.topAssist.value} בישולים`);
  if (snapshot.coachLatest) facts.push(`מאמן: ${snapshot.coachLatest.coachNameHe || snapshot.coachLatest.coachNameEn}`);
  if (wiki?.summary) facts.push(`רקע: ${wiki.summary.slice(0, 300)}`);

  const prompt = `אתה מנתח כדורגל ישראלי. כתוב סקירה קצרה (3-4 משפטים, עברית) על ${team.nameHe} בעונה הנוכחית.\n\nעובדות לעיון:\n${facts.map((f) => `- ${f}`).join('\n')}\n\nהסקירה צריכה להיות נטרלית, עובדתית, ועם משפט סיום שמסכם את מצב הקבוצה. אל תמציא פרטים שלא נכללו בעובדות.`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
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
