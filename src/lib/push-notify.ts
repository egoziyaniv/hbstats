import prisma from '@/lib/prisma';
import { sendExpoPush, type PushMessage } from '@/lib/push';
import { getPushCategoryFlags, type PushCategory } from '@/lib/push-settings';

/** Per-user opt-in column backing each push category. */
const USER_PREF_COLUMN: Record<PushCategory, 'notifyGoals' | 'notifyResults' | 'notifyReminders' | 'notifyNews' | 'notifyOnThisDay'> = {
  goals: 'notifyGoals',
  results: 'notifyResults',
  reminders: 'notifyReminders',
  news: 'notifyNews',
  onThisDay: 'notifyOnThisDay',
};

/** True if the admin master switch for this category is on. */
export async function isCategoryEnabled(category: PushCategory): Promise<boolean> {
  const flags = await getPushCategoryFlags();
  return flags[category];
}

/**
 * Tokens for users who follow at least one of the given API-Football team ids,
 * opted into this category, are active, and have an enabled device. Returns []
 * (and sends nothing) when the admin master switch for the category is off.
 */
export async function tokensForTeamCategory(
  teamApiIds: Array<number | null | undefined>,
  category: Exclude<PushCategory, 'news' | 'onThisDay'>,
): Promise<string[]> {
  if (!(await isCategoryEnabled(category))) return [];
  const apiIds = teamApiIds.filter((x): x is number => typeof x === 'number');
  if (!apiIds.length) return [];
  const users = await prisma.user.findMany({
    where: {
      favoriteTeamApiIds: { hasSome: apiIds },
      isActive: true,
      [USER_PREF_COLUMN[category]]: true,
      pushTokens: { some: { enabled: true } },
    },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}

/** Tokens for all users opted into news (no team filter). */
export async function tokensForNews(): Promise<string[]> {
  if (!(await isCategoryEnabled('news'))) return [];
  const users = await prisma.user.findMany({
    where: { isActive: true, notifyNews: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}

/** Tokens for all users opted into the daily on-this-day push (no team filter). */
export async function tokensForOnThisDay(): Promise<string[]> {
  if (!(await isCategoryEnabled('onThisDay'))) return [];
  const users = await prisma.user.findMany({
    where: { isActive: true, notifyOnThisDay: true, pushTokens: { some: { enabled: true } } },
    select: { pushTokens: { where: { enabled: true }, select: { token: true } } },
  });
  return users.flatMap((u) => u.pushTokens.map((t) => t.token));
}

/** Convenience: send a message to a token list (no-op on empty). */
export async function sendIfAny(tokens: string[], message: PushMessage) {
  if (!tokens.length) return { sent: 0, failed: 0, invalidTokens: [] as string[] };
  return sendExpoPush(tokens, message);
}
