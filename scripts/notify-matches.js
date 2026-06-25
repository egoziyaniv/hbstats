/**
 * notify-matches.js — Phase 3 score push, driven by the LIVE games feed.
 *
 * Goals + ongoing scores come from API-Football `/fixtures?live=all` (ONE call —
 * the exact same live feed that powers the site's live page), so a goal push
 * always matches what the app shows live. Finals are confirmed with a small
 * targeted `/fixtures?ids=` call for games that just dropped off the live feed.
 *
 * Targets logged-in users whose favoriteTeamApiIds include either team, who have
 * an enabled push token, AND who are opted into the category (goals / results).
 * Each category also obeys the admin master switch (SiteSetting 'push_categories').
 * Dedupes via game_notification_state so a goal / final is sent at most once.
 *
 * Dry-run by default; pass --execute to send. Self-loads .env. Safe every few
 * minutes — 0 API calls beyond the single live-feed poll.
 *
 *   node scripts/notify-matches.js            # dry-run
 *   node scripts/notify-matches.js --execute  # send
 */
const fs = require('fs');
const path = require('path');
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
})();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const AF_BASE = (process.env.API_FOOTBALL_BASE_URL || 'https://v3.football.api-sports.io').replace(/\/$/, '');
const EXECUTE = process.argv.includes('--execute');

const label = (t) => (t && (t.nameHe || t.nameEn)) || '?';
function mapStatus(s) {
  if (['FT', 'AET', 'PEN'].includes(s)) return 'COMPLETED';
  if (['1H', '2H', 'HT', 'ET', 'BT', 'LIVE', 'P'].includes(s)) return 'ONGOING';
  if (['CANC', 'ABD', 'AWD', 'WO'].includes(s)) return 'CANCELLED';
  return 'SCHEDULED';
}
async function af(p) {
  const r = await fetch(AF_BASE + p, { headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY } });
  if (!r.ok) throw new Error(`API ${p} → ${r.status}`);
  return r.json();
}
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

async function getFlags() {
  const s = await prisma.siteSetting.findUnique({ where: { key: 'push_categories' } }).catch(() => null);
  const v = (s && s.valueJson && typeof s.valueJson === 'object') ? s.valueJson : {};
  return { goals: v.goals !== false, results: v.results !== false }; // default ON
}

async function sendExpoPush(tokens, title, body, data) {
  const valid = Array.from(new Set(tokens.filter((t) => t.startsWith('ExpoPushToken[') || t.startsWith('ExponentPushToken['))));
  if (!valid.length) return { sent: 0 };
  let sent = 0; const dead = [];
  for (const batch of chunk(valid, 100)) {
    const payload = batch.map((to) => ({ to, sound: 'default', title, body, data: data || {} }));
    const res = await fetch(EXPO_PUSH_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(payload) });
    const json = await res.json().catch(() => null);
    (json?.data || []).forEach((t, i) => { if (t?.status === 'ok') sent++; else if (t?.details?.error === 'DeviceNotRegistered') dead.push(batch[i]); });
  }
  if (dead.length) await prisma.pushToken.updateMany({ where: { token: { in: dead } }, data: { enabled: false } }).catch(() => null);
  return { sent };
}

// Tokens for users who follow either team, are active, opted into `prefColumn`,
// and have an enabled device.
async function targetTokens(apiIds, prefColumn) {
  const ids = apiIds.filter((x) => x != null);
  if (!ids.length) return [];
  const users = await prisma.user.findMany({
    where: { favoriteTeamApiIds: { hasSome: ids }, isActive: true, [prefColumn]: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
  const now = Date.now();
  const since = new Date(now - 24 * 3600 * 1000);
  const until = new Date(now + 3 * 3600 * 1000);
  const flags = await getFlags();

  const games = await prisma.game.findMany({
    where: { apiFootballId: { not: null }, dateTime: { gte: since, lte: until }, status: { in: ['SCHEDULED', 'ONGOING', 'COMPLETED'] } },
    include: {
      homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
      awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
    },
  });
  console.log(`${games.length} game(s) in window. Admin flags: goals=${flags.goals} results=${flags.results}`);
  if (!games.length) { await prisma.$disconnect(); return; }

  // --- Live feed: the SAME /fixtures?live=all the live page uses (one call). ---
  const live = new Map(); // apiFootballId -> { home, away, status }
  const liveRows = await af('/fixtures?live=all').catch(() => null);
  for (const f of liveRows?.response || []) {
    live.set(f.fixture.id, { home: f.goals.home ?? 0, away: f.goals.away ?? 0, status: mapStatus(f.fixture.status.short) });
  }

  // Games we've seen before but that are NO LONGER live → likely finished.
  // Confirm their final score with one small targeted call.
  const finalize = new Map(); // apiFootballId -> { home, away, status }
  const states = new Map();
  for (const g of games) states.set(g.id, await prisma.gameNotificationState.findUnique({ where: { gameId: g.id } }));
  const droppedIds = games
    .filter((g) => !live.has(g.apiFootballId) && states.get(g.id) && !states.get(g.id).notifiedFinal && g.status !== 'COMPLETED')
    .map((g) => g.apiFootballId);
  for (const batch of chunk(droppedIds, 20)) {
    const d = await af(`/fixtures?ids=${batch.join('-')}`).catch(() => null);
    for (const f of d?.response || []) {
      finalize.set(f.fixture.id, { home: f.goals.home ?? 0, away: f.goals.away ?? 0, status: mapStatus(f.fixture.status.short) });
    }
  }

  let goals = 0, finals = 0, pushes = 0;
  for (const g of games) {
    const cur = live.get(g.apiFootballId) || finalize.get(g.apiFootballId);
    if (!cur) continue;
    const state = states.get(g.id);
    const firstSight = !state;
    const prevHome = state?.lastHomeScore ?? 0, prevAway = state?.lastAwayScore ?? 0;

    const events = [];
    // Goals: only once we have a baseline (don't backfill the score we joined at).
    if (!firstSight && flags.goals) {
      if (cur.home > prevHome) events.push({ kind: 'goal', team: label(g.homeTeam), col: 'notifyGoals' });
      if (cur.away > prevAway) events.push({ kind: 'goal', team: label(g.awayTeam), col: 'notifyGoals' });
    }
    if (cur.status === 'COMPLETED' && !(state?.notifiedFinal) && flags.results) {
      events.push({ kind: 'final', col: 'notifyResults' });
    }

    for (const ev of events) {
      const tokens = await targetTokens([g.homeTeam?.apiFootballId, g.awayTeam?.apiFootballId], ev.col);
      const scoreLine = `${label(g.homeTeam)} ${cur.home} – ${cur.away} ${label(g.awayTeam)}`;
      const title = ev.kind === 'goal' ? `⚽ גול ל${ev.team}` : '🏁 סיום';
      console.log(`  [${ev.kind}] ${scoreLine} → ${tokens.length} device(s)`);
      if (ev.kind === 'goal') goals++; else finals++;
      if (EXECUTE && tokens.length) {
        const r = await sendExpoPush(tokens, title, scoreLine, { gameId: g.id, type: 'match' });
        pushes += r.sent;
      }
    }

    // Persist baseline + refreshed score so the app shows the live score too.
    await prisma.gameNotificationState.upsert({
      where: { gameId: g.id },
      update: { lastHomeScore: cur.home, lastAwayScore: cur.away, notifiedFinal: cur.status === 'COMPLETED' },
      create: { gameId: g.id, lastHomeScore: cur.home, lastAwayScore: cur.away, notifiedFinal: cur.status === 'COMPLETED' },
    });
    if (g.homeScore !== cur.home || g.awayScore !== cur.away || g.status !== cur.status) {
      await prisma.game.update({ where: { id: g.id }, data: { homeScore: cur.home, awayScore: cur.away, status: cur.status } }).catch(() => null);
    }
  }
  console.log(`\nDetected: ${goals} goal event(s), ${finals} final(s). Pushes sent: ${pushes}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
