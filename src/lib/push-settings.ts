import prisma from '@/lib/prisma';

/**
 * Admin-level master switches for push notification categories. Stored as a
 * single SiteSetting JSON blob. A push of a given category only fires when its
 * admin flag is ON *and* the recipient's per-user toggle is ON — see
 * push-notify.ts for the combined targeting query.
 */
export const PUSH_CATEGORIES_SETTING_KEY = 'push_categories';

export type PushCategory = 'goals' | 'results' | 'reminders' | 'news' | 'onThisDay';
export type PushCategoryFlags = Record<PushCategory, boolean>;

export const PUSH_CATEGORIES: PushCategory[] = ['goals', 'results', 'reminders', 'news', 'onThisDay'];

export const PUSH_CATEGORY_LABELS_HE: Record<PushCategory, string> = {
  goals: 'גולים',
  results: 'תוצאות סיום',
  reminders: 'תזכורות משחק',
  news: 'חדשות',
  onThisDay: 'היום לפני X שנים',
};

const DEFAULT_FLAGS: PushCategoryFlags = { goals: true, results: true, reminders: true, news: true, onThisDay: true };

function coerce(value: unknown): PushCategoryFlags {
  const out: PushCategoryFlags = { ...DEFAULT_FLAGS };
  if (value && typeof value === 'object') {
    for (const k of PUSH_CATEGORIES) {
      const v = (value as Record<string, unknown>)[k];
      if (typeof v === 'boolean') out[k] = v;
    }
  }
  return out;
}

export async function getPushCategoryFlags(): Promise<PushCategoryFlags> {
  const setting = await prisma.siteSetting.findUnique({ where: { key: PUSH_CATEGORIES_SETTING_KEY } });
  return coerce(setting?.valueJson);
}

export async function setPushCategoryFlags(partial: Partial<PushCategoryFlags>): Promise<PushCategoryFlags> {
  const current = await getPushCategoryFlags();
  const next = coerce({ ...current, ...partial });
  await prisma.siteSetting.upsert({
    where: { key: PUSH_CATEGORIES_SETTING_KEY },
    update: { valueJson: next },
    create: { key: PUSH_CATEGORIES_SETTING_KEY, valueJson: next },
  });
  return next;
}
