/**
 * fetch-player-overviews.js — Wikipedia + OpenAI narrative for players in the
 * latest season. Stores under Player.aiSummary and Player.wikiInfo (canonical
 * row preferred — written there so all linked season-rows share it).
 *
 * Skips players with too little data (< 2 matches this season) — pointless and
 * the AI tends to hallucinate.
 *
 * Usage:
 *   node scripts/fetch-player-overviews.js [--player <id>] [--only wiki|ai]
 *                                          [--season 2025] [--limit N]
 */
'use strict';
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');
const OpenAI = require('openai').default || require('openai');
const prisma = new PrismaClient();

const arg = (n, d = null) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('only', null);
const PLAYER_ID = arg('player', null);
const SEASON_YEAR = arg('season', null);
const LIMIT = parseInt(arg('limit', '300'), 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getOpenAIKey() {
  const row = await prisma.siteSetting.findUnique({ where: { key: 'ai_api_key_openai' } });
  const v = row?.valueJson;
  return typeof v === 'string' ? v : null;
}

async function fetchWikiSummary(title, lang) {
  const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'HBStats/1.0 (hbs.co.il)' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.type === 'disambiguation' || !data.extract) return null;
    return {
      title: data.title, description: data.description || null,
      summary: data.extract, thumbnail: data.thumbnail?.source || null,
      sourceUrl: data.content_urls?.desktop?.page || url, lang,
    };
  } catch { return null; }
}

async function fetchWikiForPlayer(player) {
  for (const [title, lang] of [[player.nameHe, 'he'], [player.nameEn, 'en']]) {
    if (!title) continue;
    const w = await fetchWikiSummary(title.replace(/\s+/g, '_'), lang);
    if (w) return w;
  }
  return null;
}

async function buildPlayerSnapshot(player, seasonId, seasonName) {
  // Linked Player records (all seasons + canonical)
  const canonicalKey = player.canonicalPlayerId ?? player.id;
  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
    select: { id: true, apiFootballId: true },
  });
  const linkedIds = linked.map((l) => l.id);
  const linkedApiIds = linked.map((l) => l.apiFootballId).filter((v) => typeof v === 'number');

  // Season aggregate from GamePlayerStats
  const agg = await prisma.gamePlayerStats.aggregate({
    where: {
      OR: [
        ...(linkedIds.length > 0 ? [{ playerId: { in: linkedIds } }] : []),
        ...(linkedApiIds.length > 0 ? [{ apiFootballPlayerId: { in: linkedApiIds } }] : []),
      ],
      game: { seasonId },
    },
    _avg: { rating: true },
    _sum: { goals: true, assists: true, passesKey: true, duelsWon: true, dribblesSuccess: true, minutes: true },
    _count: { _all: true },
  });

  const team = player.team ? `${player.team.nameHe || player.team.nameEn}` : null;
  return {
    team,
    position: player.position,
    seasonName,
    matches: agg._count._all || 0,
    avgRating: agg._avg.rating != null ? Number(agg._avg.rating.toFixed(2)) : null,
    goals: agg._sum.goals || 0,
    assists: agg._sum.assists || 0,
    keyPasses: agg._sum.passesKey || 0,
    duelsWon: agg._sum.duelsWon || 0,
    dribbles: agg._sum.dribblesSuccess || 0,
    minutes: agg._sum.minutes || 0,
  };
}

async function generateAi(player, snap, wiki, apiKey) {
  if (!apiKey) return null;
  const client = new OpenAI({ apiKey });
  const facts = [];
  if (snap.team) facts.push(`קבוצה: ${snap.team}`);
  if (snap.position) facts.push(`עמדה: ${snap.position}`);
  facts.push(`${snap.matches} משחקים בעונת ${snap.seasonName}, ${snap.minutes} דקות סך הכל`);
  if (snap.goals > 0) facts.push(`${snap.goals} שערים`);
  if (snap.assists > 0) facts.push(`${snap.assists} בישולים`);
  if (snap.keyPasses > 0) facts.push(`${snap.keyPasses} מסירות מפתח`);
  if (snap.duelsWon > 0) facts.push(`${snap.duelsWon} דו-קרבות שזכה`);
  if (snap.dribbles > 0) facts.push(`${snap.dribbles} דריבלים מוצלחים`);
  if (snap.avgRating) facts.push(`דירוג ממוצע ${snap.avgRating}`);
  if (wiki?.summary) facts.push(`רקע: ${wiki.summary.slice(0, 250)}`);

  const prompt = `אתה מנתח כדורגל ישראלי. כתוב סקירה קצרה (2-3 משפטים, עברית) על ${player.nameHe || player.nameEn} בעונת ${snap.seasonName}.\n\nעובדות מאומתות:\n${facts.map((f) => `- ${f}`).join('\n')}\n\nכללים: ציין את שם העונה. השתמש רק בעובדות לעיל. טון עובדתי.`;

  const res = await client.chat.completions.create({
    model: 'gpt-4o-mini', max_tokens: 250,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.choices?.[0]?.message?.content?.trim() || null;
}

async function processPlayer(player, season, apiKey) {
  console.log(`• ${player.nameHe || player.nameEn} (${player.team?.nameHe || '?'})`);
  const snap = await buildPlayerSnapshot(player, season.id, season.name);
  if (snap.matches < 2) { console.log('  · skip: <2 matches'); return; }

  let wiki = player.aiSummary?.wiki || null;
  if (ONLY !== 'ai' && !wiki) {
    const w = await fetchWikiForPlayer(player);
    if (w) { wiki = w; console.log('  ✓ wiki:', w.title); }
    await sleep(400);
  }

  let aiSummary = null;
  if (ONLY !== 'wiki') {
    const text = await generateAi(player, snap, wiki, apiKey);
    if (text) {
      aiSummary = { text, generatedAt: new Date().toISOString(), locale: 'he', wiki };
      console.log('  ✓ ai:', text.slice(0, 80) + '...');
    }
    await sleep(250);
  }

  // Write the summary to the CANONICAL row so all season-records share it
  const canonicalKey = player.canonicalPlayerId ?? player.id;
  const newAdditional = {
    ...(player.additionalInfo || {}),
    aiSummary: aiSummary || player.additionalInfo?.aiSummary || null,
  };
  await prisma.player.update({
    where: { id: canonicalKey },
    data: { additionalInfo: newAdditional },
  });
}

async function main() {
  const season = SEASON_YEAR
    ? await prisma.season.findFirst({ where: { year: parseInt(SEASON_YEAR, 10) } })
    : await prisma.season.findFirst({ orderBy: { year: 'desc' } });
  if (!season) { console.error('No season'); process.exit(1); }

  const apiKey = ONLY === 'wiki' ? null : await getOpenAIKey();
  console.log(`Season: ${season.name} | AI: ${apiKey ? 'enabled' : 'disabled'}`);

  let players;
  if (PLAYER_ID) {
    players = await prisma.player.findMany({ where: { id: PLAYER_ID }, include: { team: true } });
  } else {
    // Players who have meaningful season-stats data in current season
    players = await prisma.player.findMany({
      where: {
        team: { seasonId: season.id },
        gamePlayerStats: { some: { game: { seasonId: season.id } } },
      },
      include: { team: { select: { nameHe: true, nameEn: true } } },
      take: LIMIT,
    });
  }
  console.log(`Players to process: ${players.length}`);
  for (const p of players) {
    try { await processPlayer(p, season, apiKey); } catch (e) { console.log('  ! ' + (p.nameHe || p.nameEn) + ':', e.message.slice(0, 100)); }
  }
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
