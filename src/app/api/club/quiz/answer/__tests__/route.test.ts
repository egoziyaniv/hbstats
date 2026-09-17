jest.mock('@/lib/fan-discovery-data', () => ({ weeklyQuiz: jest.fn() }));
import { weeklyQuiz } from '@/lib/fan-discovery-data';
import { POST } from '../route';
const quiz = weeklyQuiz as jest.Mock;
const request = (value: unknown) => new Request('https://statsai.co.il/api/club/quiz/answer', { method: 'POST', body: JSON.stringify(value) });
beforeEach(() => { jest.clearAllMocks(); quiz.mockResolvedValue({ id: 'g', result: 'ניצחון', source: 'https://statsai.co.il/games/g' }); });
it('checks submitted answers against server evidence', async () => {
 const result = await POST(request({ id: 'g', choice: 'הפסד', result: 'הפסד' }));
 expect(await result.json()).toMatchObject({ correct: false, fact: { result: 'ניצחון' } });
 expect(result.headers.get('Cache-Control')).toBe('no-store');
});
it('does not reveal evidence for arbitrary game IDs or stale questions', async () => {
 const result = await POST(request({ id: 'other', choice: 'ניצחון' }));
 expect(result.status).toBe(409);
 expect(await result.text()).not.toContain('source');
});
it.each([null, {}, { id: 'g', choice: 'injected' }])('rejects invalid answer %j before database access', async value => {
 expect((await POST(request(value))).status).toBe(400);
 expect(quiz).not.toHaveBeenCalled();
});
it('does not leak database errors', async () => {
 quiz.mockRejectedValue(new Error('private details'));
 const result = await POST(request({ id: 'g', choice: 'ניצחון' }));
 expect(result.status).toBe(503);
 expect(await result.text()).not.toContain('private details');
});
