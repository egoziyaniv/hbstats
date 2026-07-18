import { REGISTRY, getQuestion } from '@/lib/stats-qa/registry';

it('has unique ids and valid cardTypes', () => {
  const ids = REGISTRY.map((q) => q.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const q of REGISTRY) expect(['hero', 'bar', 'leaderboard']).toContain(q.cardType);
});
it('club questions set needsClub=true', () => {
  for (const q of REGISTRY.filter((x) => x.scope === 'club')) expect(q.needsClub).toBe(true);
});
it('getQuestion returns by id', () => {
  expect(getQuestion('league_most_titles')?.scope).toBe('league');
});
