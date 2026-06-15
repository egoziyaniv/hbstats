import prisma from '@/lib/prisma';
import type { UserRole } from '@prisma/client';
import { logActivity } from '@/lib/activity';

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
  // Run the admin-count check and delete in one serializable transaction so two
  // concurrent deletions can't both pass the guard and orphan the last admin
  // (the count→delete window is a TOCTOU race under read-committed).
  const result = await prisma.$transaction(
    async (tx): Promise<DeleteAccountResult & { email?: string }> => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
      if (!user) return { ok: false, reason: 'not_found' };

      if (user.role === 'ADMIN') {
        const activeAdminCount = await tx.user.count({ where: { role: 'ADMIN', isActive: true } });
        if (wouldOrphanLastAdmin(user.role, activeAdminCount)) {
          return { ok: false, reason: 'last_admin' };
        }
      }

      await tx.user.delete({ where: { id: userId } });
      return { ok: true, email: user.email };
    },
    { isolationLevel: 'Serializable' },
  );

  if (result.ok) {
    // Audit after commit; the user row is gone so no userId FK, entityId keeps it.
    await logActivity({ entityType: 'USER', entityId: userId, actionHe: 'מחיקת חשבון', details: { email: result.email } });
    return { ok: true };
  }
  return result;
}
