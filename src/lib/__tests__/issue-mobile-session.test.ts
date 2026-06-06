import { issueMobileSession } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

beforeAll(() => { process.env.JWT_SECRET = 'test-secret-at-least-32-bytes-long-xx'; });

it('issues an access token + persisted refresh session for a user', async () => {
  const user = await prisma.user.create({
    data: { email: `issue-${Date.now()}@test.local`, name: 'Issue', password: await hashPassword('Password123'), isActive: true },
  });

  const result = await issueMobileSession(user);

  expect(typeof result.accessToken).toBe('string');
  expect(typeof result.refreshToken).toBe('string');
  expect(result.user.id).toBe(user.id);

  const sessions = await prisma.session.findMany({ where: { userId: user.id } });
  expect(sessions.length).toBe(1);
  expect(sessions[0].familyId).toBe(sessions[0].id);

  await prisma.user.delete({ where: { id: user.id } });
});
