import { resolveSocialUser, SocialAuthError, RegistrationDisabledError } from '@/lib/social-auth';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

const uniq = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

describe('resolveSocialUser', () => {
  it('creates a new USER when no match exists', async () => {
    const email = `new-${uniq()}@test.local`;
    const sub = `g-${uniq()}`;
    const user = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: true, name: 'New Person' });
    expect(user.email).toBe(email.toLowerCase());
    expect(user.role).toBe('USER');
    expect(user.googleSub).toBe(sub);
    expect(user.password).toBeNull();
    await prisma.user.delete({ where: { id: user.id } });
  });

  it('links to an existing account when the verified email matches', async () => {
    const email = `link-${uniq()}@test.local`;
    const existing = await prisma.user.create({
      data: { email: email.toLowerCase(), name: 'Existing', password: await hashPassword('Password123'), isActive: true },
    });
    const sub = `g-${uniq()}`;
    const resolved = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: true });
    expect(resolved.id).toBe(existing.id);
    expect(resolved.googleSub).toBe(sub);
    await prisma.user.delete({ where: { id: existing.id } });
  });

  it('returns the same user when the provider sub already exists', async () => {
    const email = `sub-${uniq()}@test.local`;
    const sub = `a-${uniq()}`;
    const first = await resolveSocialUser({ provider: 'apple', sub, email, emailVerified: true });
    const second = await resolveSocialUser({ provider: 'apple', sub, email, emailVerified: true });
    expect(second.id).toBe(first.id);
    await prisma.user.delete({ where: { id: first.id } });
  });

  it('does NOT link to an existing email when the email is unverified', async () => {
    const email = `unverified-${uniq()}@test.local`;
    const existing = await prisma.user.create({
      data: { email: email.toLowerCase(), name: 'Existing', password: await hashPassword('Password123'), isActive: true },
    });
    const sub = `g-${uniq()}`;
    const resolved = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: false });
    expect(resolved.id).not.toBe(existing.id);
    expect(resolved.googleSub).toBe(sub);
    await prisma.user.delete({ where: { id: resolved.id } });
    await prisma.user.delete({ where: { id: existing.id } });
  });

  describe('with REGISTRATION_DISABLED=true', () => {
    const prev = process.env.REGISTRATION_DISABLED;
    beforeAll(() => { process.env.REGISTRATION_DISABLED = 'true'; });
    afterAll(() => { process.env.REGISTRATION_DISABLED = prev; });

    it('blocks creating a brand-new account', async () => {
      const email = `blocked-${uniq()}@test.local`;
      await expect(
        resolveSocialUser({ provider: 'google', sub: `g-${uniq()}`, email, emailVerified: true, name: 'Nope' })
      ).rejects.toBeInstanceOf(RegistrationDisabledError);
      // RegistrationDisabledError is a SocialAuthError, so routes reject it cleanly.
      expect(new RegistrationDisabledError()).toBeInstanceOf(SocialAuthError);
      expect(await prisma.user.findUnique({ where: { email: email.toLowerCase() } })).toBeNull();
    });

    it('still lets an existing account log in (linking is not registration)', async () => {
      const email = `existing-${uniq()}@test.local`;
      const existing = await prisma.user.create({
        data: { email: email.toLowerCase(), name: 'Existing', password: await hashPassword('Password123'), isActive: true },
      });
      const sub = `g-${uniq()}`;
      const resolved = await resolveSocialUser({ provider: 'google', sub, email, emailVerified: true });
      expect(resolved.id).toBe(existing.id);
      expect(resolved.googleSub).toBe(sub);
      await prisma.user.delete({ where: { id: existing.id } });
    });
  });
});
