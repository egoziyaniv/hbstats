/**
 * Push notifications via the Expo Push service.
 *
 * We store ExpoPushTokens (per device) and POST messages to Expo, which relays
 * to APNs/FCM. No raw Apple/Google keys live here — Expo holds the APNs key
 * (uploaded via `eas credentials`). Dead tokens (DeviceNotRegistered) are
 * disabled automatically so the table self-prunes.
 */
import prisma from '@/lib/prisma';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isExpoToken(t: string): boolean {
  return t.startsWith('ExpoPushToken[') || t.startsWith('ExponentPushToken[');
}

/** Send a message to a raw list of Expo push tokens. Returns counts + dead tokens. */
export async function sendExpoPush(tokens: string[], message: PushMessage) {
  const valid = Array.from(new Set(tokens.filter(isExpoToken)));
  if (!valid.length) return { sent: 0, failed: 0, invalidTokens: [] as string[] };

  const invalidTokens: string[] = [];
  let sent = 0;
  let failed = 0;

  for (const batch of chunk(valid, 100)) {
    const payload = batch.map((to) => ({
      to,
      sound: message.sound === undefined ? 'default' : message.sound,
      title: message.title,
      body: message.body,
      data: message.data ?? {},
      ...(message.badge !== undefined ? { badge: message.badge } : {}),
    }));
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      const tickets: Array<{ status?: string; details?: { error?: string } }> = json?.data ?? [];
      tickets.forEach((t, i) => {
        if (t?.status === 'ok') sent++;
        else {
          failed++;
          if (t?.details?.error === 'DeviceNotRegistered') invalidTokens.push(batch[i]);
        }
      });
    } catch {
      failed += batch.length;
    }
  }

  if (invalidTokens.length) {
    await prisma.pushToken
      .updateMany({ where: { token: { in: invalidTokens } }, data: { enabled: false } })
      .catch(() => null);
  }
  return { sent, failed, invalidTokens };
}

/**
 * Send to stored devices. Pass userIds to target specific users, or null for
 * every enabled device (use sparingly — broadcast).
 */
export async function pushToUsers(userIds: string[] | null, message: PushMessage) {
  const rows = await prisma.pushToken.findMany({
    where: { enabled: true, ...(userIds ? { userId: { in: userIds } } : {}) },
    select: { token: true },
  });
  return sendExpoPush(rows.map((r) => r.token), message);
}
