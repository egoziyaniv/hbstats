import { wouldOrphanLastAdmin, deleteUserAccount } from '@/lib/account';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

describe('wouldOrphanLastAdmin (pure)', () => {
  it('allows deleting a regular USER regardless of admin count', () => {
    expect(wouldOrphanLastAdmin('USER', 1)).toBe(false);
    expect(wouldOrphanLastAdmin('USER', 0)).toBe(false);
  });
  it('blocks deleting an ADMIN when they are the only active admin', () => {
    expect(wouldOrphanLastAdmin('ADMIN', 1)).toBe(true);
  });
  it('allows deleting an ADMIN when other admins remain', () => {
    expect(wouldOrphanLastAdmin('ADMIN', 2)).toBe(false);
  });
});

describe('deleteUserAccount (real DB)', () => {
  it('deletes a USER and their sessions', async () => {
    const user = await prisma.user.create({
      data: {
        email: `del-test-${Date.now()}@test.local`,
        name: 'Delete Me',
        password: await hashPassword('Password123'),
        isActive: true,
      },
    });
    await prisma.session.create({
      data: { userId: user.id, tokenHash: `hash-${Date.now()}`, familyId: 'fam', expiresAt: new Date(Date.now() + 1000) },
    });

    const result = await deleteUserAccount(user.id);

    expect(result).toEqual({ ok: true });
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it('returns not_found for a missing user', async () => {
    expect(await deleteUserAccount('nonexistent-id')).toEqual({ ok: false, reason: 'not_found' });
  });
});
