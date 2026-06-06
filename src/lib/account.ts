import prisma from '@/lib/prisma';
import type { UserRole } from '@prisma/client';

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'last_admin' };

/** Pure guard: would deleting a user of this role remove the final active admin? */
export function wouldOrphanLastAdmin(role: UserRole, activeAdminCount: number): boolean {
  return role === 'ADMIN' && activeAdminCount <= 1;
}

/**
 * Hard-deletes a user. Sessions cascade; operational rows (activity logs, fetch
 * jobs, merge operations) are detached via Prisma's default SetNull. Refuses to
 * delete the last active admin so the owner cannot lock themselves out.
 */
export async function deleteUserAccount(userId: string): Promise<DeleteAccountResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!user) return { ok: false, reason: 'not_found' };

  if (user.role === 'ADMIN') {
    const activeAdminCount = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (wouldOrphanLastAdmin(user.role, activeAdminCount)) {
      return { ok: false, reason: 'last_admin' };
    }
  }

  await prisma.user.delete({ where: { id: userId } });
  return { ok: true };
}
