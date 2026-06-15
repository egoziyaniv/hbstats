import { ActivityEntityType } from '@prisma/client';
import prisma from '@/lib/prisma';

export async function logActivity(input: {
  entityType: ActivityEntityType;
  entityId: string;
  actionHe: string;
  userId?: string | null;
  gameId?: string | null;
  details?: unknown;
}) {
  // Audit logging must never break the action it records — swallow write errors.
  try {
    await prisma.activityLog.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        actionHe: input.actionHe,
        userId: input.userId || null,
        gameId: input.gameId || null,
        details: input.details as any,
      },
    });
  } catch (e: any) {
    console.error('[activity] failed to write audit log:', e?.message || e);
  }
}

/**
 * Audit a security-relevant authentication event (login success/failure, logout,
 * account deletion). entityId is the user id when known, else the attempted
 * email, so failed logins for non-existent / wrong accounts stay traceable.
 */
export async function logAuthEvent(input: {
  actionHe: string;
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  channel?: 'web' | 'mobile';
}) {
  await logActivity({
    entityType: 'USER',
    entityId: input.userId || input.email || 'unknown',
    actionHe: input.actionHe,
    userId: input.userId || null,
    details: { email: input.email || null, ip: input.ip || null, channel: input.channel },
  });
}
