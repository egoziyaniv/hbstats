import prisma from '@/lib/prisma';
import { reserveChatRequest } from '@/lib/ai-chat-quota';

const keys = ['ai_chat_daily:global', 'ai_chat_daily:user:quota-test'];
beforeEach(async () => {
  await prisma.siteSetting.deleteMany({ where: { key: { in: keys } } });
  process.env.AI_CHAT_DAILY_USER_LIMIT = '2';
  process.env.AI_CHAT_DAILY_GLOBAL_LIMIT = '3';
});
afterAll(async () => {
  await prisma.siteSetting.deleteMany({ where: { key: { in: keys } } });
  delete process.env.AI_CHAT_DAILY_USER_LIMIT;
  delete process.env.AI_CHAT_DAILY_GLOBAL_LIMIT;
});
test('concurrent requests cannot exceed the per-user quota', async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => reserveChatRequest('quota-test')));
  expect(results.filter(Boolean)).toHaveLength(2);
});
test('enforces the global quota even for a user with no requests', async () => {
  await prisma.siteSetting.create({ data: { key: keys[0], valueJson: { day: new Date().toISOString().slice(0, 10), count: 3 } } });
  expect(await reserveChatRequest('quota-test')).toBe(false);
});
test('resets a prior day without accumulating unbounded daily rows', async () => {
  await prisma.siteSetting.create({ data: { key: keys[0], valueJson: { day: '2000-01-01', count: 3000 } } });
  expect(await reserveChatRequest('quota-test')).toBe(true);
  expect((await prisma.siteSetting.findUnique({ where: { key: keys[0] } }))?.valueJson).toMatchObject({ count: 1 });
});
