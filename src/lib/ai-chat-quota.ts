import prisma from '@/lib/prisma';

function limit(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

/** Reserve before contacting the provider. Failed provider calls still count.
 * Fixed keys roll over daily rather than adding a row per day. The transaction
 * lock coordinates all app workers; no process-local counter can bypass it.
 */
export async function reserveChatRequest(userId: string): Promise<boolean> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(72100481)`;
    const day = new Date().toISOString().slice(0, 10);
    const quotas = [
      { key: 'ai_chat_daily:global', max: limit('AI_CHAT_DAILY_GLOBAL_LIMIT', 1000) },
      { key: `ai_chat_daily:user:${userId}`, max: limit('AI_CHAT_DAILY_USER_LIMIT', 100) },
    ];
    const counts: number[] = [];
    for (const quota of quotas) {
      const row = await tx.siteSetting.findUnique({ where: { key: quota.key } });
      const stored = row?.valueJson as { day?: string; count?: number } | null;
      const count = stored?.day === day && Number.isSafeInteger(stored.count) && stored.count >= 0 ? stored.count : 0;
      if (count >= quota.max) return false;
      counts.push(count);
    }
    for (let i = 0; i < quotas.length; i++) {
      const valueJson = { day, count: counts[i] + 1 };
      await tx.siteSetting.upsert({ where: { key: quotas[i].key }, create: { key: quotas[i].key, valueJson }, update: { valueJson } });
    }
    return true;
  });
}
