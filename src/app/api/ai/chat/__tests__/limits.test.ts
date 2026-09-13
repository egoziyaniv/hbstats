jest.mock('@/lib/auth', () => ({ getRequestUser: jest.fn() }));
jest.mock('@/lib/ai-settings', () => ({ getAiSettings: jest.fn(), getActiveApiKey: jest.fn() }));
jest.mock('@/lib/ai-providers', () => ({ chatWithOpenAI: jest.fn(), chatWithClaude: jest.fn() }));
jest.mock('@/lib/ai-chat-quota', () => ({ reserveChatRequest: jest.fn() }), { virtual: true });
import { NextRequest } from 'next/server';
import { getRequestUser } from '@/lib/auth';
import { getAiSettings, getActiveApiKey } from '@/lib/ai-settings';
import { chatWithOpenAI } from '@/lib/ai-providers';
import { POST } from '../route';
const reserveChatRequest = jest.requireMock('@/lib/ai-chat-quota').reserveChatRequest;

const request = (messages: unknown[]) => new NextRequest('http://localhost/api/ai/chat', {
  method: 'POST', body: JSON.stringify({ messages }),
});
let userIndex = 0;
beforeEach(() => {
  jest.clearAllMocks();
  (getRequestUser as jest.Mock).mockResolvedValue({ id: `synthetic-${++userIndex}` });
  (getAiSettings as jest.Mock).mockResolvedValue({ provider: 'openai' });
  (getActiveApiKey as jest.Mock).mockResolvedValue('synthetic-test-key');
  (chatWithOpenAI as jest.Mock).mockResolvedValue('answer');
  reserveChatRequest.mockResolvedValue(true);
});

test('rejects a large earlier user message before contacting a provider', async () => {
  const response = await POST(request([{ role: 'user', content: 'x'.repeat(501) }, { role: 'user', content: 'hi' }]));
  expect(response.status).toBe(400);
  expect(chatWithOpenAI).not.toHaveBeenCalled();
});
test('rejects oversized total history even when each reply is bounded', async () => {
  const messages = Array.from({ length: 19 }, () => ({ role: 'assistant', content: 'x'.repeat(2000) }));
  const response = await POST(request([...messages, { role: 'user', content: 'hi' }]));
  expect(response.status).toBe(400);
  expect(chatWithOpenAI).not.toHaveBeenCalled();
});
test('rejects a streamed body exceeding the byte limit', async () => {
  const response = await POST(request([{ role: 'assistant', content: 'x'.repeat(100000) }, { role: 'user', content: 'hi' }]));
  expect(response.status).toBe(413);
  expect(chatWithOpenAI).not.toHaveBeenCalled();
});
test('returns 400 for null messages rather than throwing', async () => {
  const response = await POST(request([null, { role: 'user', content: 'hi' }]));
  expect(response.status).toBe(400);
  expect(chatWithOpenAI).not.toHaveBeenCalled();
});
test('allows normal history with an assistant reply longer than the user limit', async () => {
  const response = await POST(request([{ role: 'assistant', content: 'x'.repeat(1000) }, { role: 'user', content: 'hi' }]));
  expect(response.status).toBe(200);
  expect(chatWithOpenAI).toHaveBeenCalledTimes(1);
});
test('does not contact the paid provider when daily quota is exhausted', async () => {
  reserveChatRequest.mockResolvedValue(false);
  const response = await POST(request([{ role: 'user', content: 'hi' }]));
  expect(response.status).toBe(429);
  expect(chatWithOpenAI).not.toHaveBeenCalled();
});
test('fails closed when the quota store is unavailable', async () => {
  reserveChatRequest.mockRejectedValue(new Error('database unavailable'));
  const response = await POST(request([{ role: 'user', content: 'hi' }]));
  expect(response.status).toBe(503);
  expect(chatWithOpenAI).not.toHaveBeenCalled();
});
