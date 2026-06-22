/**
 * notify-matches.js — Phase 2 push triggers.
 *
 * For today's (and last 24h) games that involve teams users follow, refresh the
 * live score from API-Football, then push:
 *   - ⚽ a goal alert whenever the score increases, and
 *   - 🏁 a final-result alert when the game finishes.
 * Targets logged-in users whose favoriteTeamApiIds include either team and who
 * have an enabled push token. Dedupes via game_notification_state so a goal /
 * final is sent at most once.
 *
 * Dry-run by default (prints what it WOULD send); pass --execute to send.
 * Self-loads .env. Safe to run every few minutes via cron — it makes 0 API
 * calls when there are no games in the window.
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

async function targetTokens(homeApiId, awayApiId) {
  const apiIds = [homeApiId, awayApiId].filter((x) => x != null);
  if (!apiIds.length) return [];
  const users = await prisma.user.findMany({
    where: { favoriteTeamApiIds: { hasSome: apiIds }, isActive: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
  const now = Date.now();
  const since = new Date(now - 24 * 3600 * 1000);
  const until = new Date(now + 3 * 3600 * 1000);

  const games = await prisma.game.findMany({
    where: { apiFootballId: { not: null }, dateTime: { gte: since, lte: until }, status: { in: ['SCHEDULED', 'ONGOING', 'COMPLETED'] } },
    include: {
      homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
      awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
    },
  });
  console.log(`${games.length} game(s) in window.`);
  if (!games.length) { await prisma.$disconnect(); return; }

  // Refresh current scores/status from API-Football (batched ids).
  const fresh = new Map(); // apiFootballId -> { home, away, status }
  for (const batch of chunk(games.map((g) => g.apiFootballId), 20)) {
    const d = await af(`/fixtures?ids=${batch.join('-')}`).catch(() => null);
    for (const f of d?.response || []) {
      fresh.set(f.fixture.id, { home: f.goals.home ?? 0, away: f.goals.away ?? 0, status: mapStatus(f.fixture.status.short) });
    }
  }

  let goals = 0, finals = 0, pushes = 0;
  for (const g of games) {
    const cur = fresh.get(g.apiFootballId);
    if (!cur) continue;
    const state = await prisma.gameNotificationState.findUnique({ where: { gameId: g.id } });
    const firstSight = !state;
    const prevHome = state?.lastHomeScore ?? 0, prevAway = state?.lastAwayScore ?? 0;

    const events = [];
    // Only alert on goals once we have a baseline (avoid backfilling old goals).
    if (!firstSight) {
      if (cur.home > prevHome) events.push({ kind: 'goal', team: label(g.homeTeam) });
      if (cur.away > prevAway) events.push({ kind: 'goal', team: label(g.awayTeam) });
    }
    if (cur.status === 'COMPLETED' && !(state?.notifiedFinal)) events.push({ kind: 'final' });

    if (events.length) {
      const tokens = await targetTokens(g.homeTeam?.apiFootballId, g.awayTeam?.apiFootballId);
      const scoreLine = `${label(g.homeTeam)} ${cur.home} – ${cur.away} ${label(g.awayTeam)}`;
      for (const ev of events) {
        const title = ev.kind === 'goal' ? `⚽ גול ל${ev.team}` : '🏁 סיום';
        console.log(`  [${ev.kind}] ${scoreLine} → ${tokens.length} device(s)`);
        if (ev.kind === 'goal') goals++; else finals++;
        if (EXECUTE && tokens.length) {
          const r = await sendExpoPush(tokens, title, scoreLine, { gameId: g.id, type: 'match' });
          pushes += r.sent;
        }
      }
    }

    // Persist baseline + refreshed score (so the app shows the live score too).
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
