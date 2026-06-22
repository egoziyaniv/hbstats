/**
 * Send a test push to registered devices via the Expo Push service.
 *
 *   node scripts/send-test-push.js                       # all enabled tokens
 *   node scripts/send-test-push.js --token 'ExpoPushToken[xxx]'
 *   node scripts/send-test-push.js --title "..." --body "..."
 *
 * Self-loads .env. Disables tokens that come back DeviceNotRegistered.
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

const arg = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const one = arg('--token');
  const title = arg('--title') || 'StatsAI';
  const body = arg('--body') || 'בדיקת התראות — אם אתם רואים את זה, הכל עובד! ⚽';

  let tokens;
  if (one) tokens = [one];
  else {
    const rows = await prisma.pushToken.findMany({ where: { enabled: true }, select: { token: true } });
    tokens = rows.map((r) => r.token);
  }
  tokens = tokens.filter((t) => t.startsWith('ExpoPushToken[') || t.startsWith('ExponentPushToken['));
  console.log(`Sending to ${tokens.length} device(s)...`);
  if (!tokens.length) { console.log('No registered devices.'); await prisma.$disconnect(); return; }

  const payload = tokens.map((to) => ({ to, sound: 'default', title, body, data: { type: 'test' } }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json().catch(() => null);
  console.log(JSON.stringify(json, null, 2));

  const dead = [];
  (json?.data || []).forEach((t, i) => { if (t?.details?.error === 'DeviceNotRegistered') dead.push(tokens[i]); });
  if (dead.length) {
    await prisma.pushToken.updateMany({ where: { token: { in: dead } }, data: { enabled: false } });
    console.log(`Disabled ${dead.length} dead token(s).`);
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
