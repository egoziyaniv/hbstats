/**
 * notify-reminders.js — Phase 3 match reminders.
 *
 * ~1 hour before kickoff, push "⏰ <team> משחקת בעוד שעה מול <opponent>" to users
 * who follow either team and opted into reminders. No API calls — pure DB read
 * over scheduled games. Deduped via game_notification_state.notifiedReminder so
 * each game reminds at most once. Obeys the admin master switch
 * (SiteSetting 'push_categories'.reminders).
 *
 * Run every ~10 min via cron. Dry-run by default; pass --execute to send.
 *
 *   node scripts/notify-reminders.js            # dry-run
 *   node scripts/notify-reminders.js --execute  # send
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
const EXECUTE = process.argv.includes('--execute');
const label = (t) => (t && (t.nameHe || t.nameEn)) || '?';
function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

async function remindersEnabled() {
  const s = await prisma.siteSetting.findUnique({ where: { key: 'push_categories' } }).catch(() => null);
  const v = (s && s.valueJson && typeof s.valueJson === 'object') ? s.valueJson : {};
  return v.reminders !== false; // default ON
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

async function targetTokens(apiIds) {
  const ids = apiIds.filter((x) => x != null);
  if (!ids.length) return [];
  const users = await prisma.user.findMany({
    where: { favoriteTeamApiIds: { hasSome: ids }, isActive: true, notifyReminders: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}

async function main() {
  console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);
  if (!(await remindersEnabled())) { console.log('Reminders disabled by admin. Skipping.'); await prisma.$disconnect(); return; }

  // Games kicking off in the next 50–70 minutes that we haven't reminded yet.
  const now = Date.now();
  const from = new Date(now + 50 * 60 * 1000);
  const to = new Date(now + 70 * 60 * 1000);
  const games = await prisma.game.findMany({
    where: { dateTime: { gte: from, lte: to }, status: 'SCHEDULED' },
    include: {
      homeTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
      awayTeam: { select: { apiFootballId: true, nameHe: true, nameEn: true } },
    },
  });
  console.log(`${games.length} game(s) kicking off in ~1h.`);

  let reminders = 0, pushes = 0;
  for (const g of games) {
    const state = await prisma.gameNotificationState.findUnique({ where: { gameId: g.id } });
    if (state?.notifiedReminder) continue;

    const tokens = await targetTokens([g.homeTeam?.apiFootballId, g.awayTeam?.apiFootballId]);
    const home = label(g.homeTeam), away = label(g.awayTeam);
    const title = '⏰ משחק מתקרב';
    const body = `${home} נגד ${away} — בעוד כשעה`;
    console.log(`  [reminder] ${home} vs ${away} → ${tokens.length} device(s)`);
    reminders++;
    if (EXECUTE && tokens.length) {
      const r = await sendExpoPush(tokens, title, body, { gameId: g.id, type: 'match' });
      pushes += r.sent;
    }
    // Mark reminded regardless of token count so we don't recheck this game.
    await prisma.gameNotificationState.upsert({
      where: { gameId: g.id },
      update: { notifiedReminder: true },
      create: { gameId: g.id, notifiedReminder: true },
    });
  }
  console.log(`\nReminders: ${reminders}. Pushes sent: ${pushes}.`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
