import { queryClient, persister, shouldDehydrateQuery, USER_QUERY_KEYS } from '../queryClient';

describe('queryClient persister', () => {
  test('persister is configured', () => {
    expect(persister).toBeDefined();
  });

  test('queryClient has 60s staleTime default', () => {
    const opts = queryClient.getDefaultOptions();
    expect(opts.queries?.staleTime).toBe(60_000);
  });
});

const q = (queryKey: unknown[], status = 'success') => ({ queryKey, state: { status } }) as any;

describe('shouldDehydrateQuery (persisted-cache filter, M-8)', () => {
  test('persists successful public queries', () => {
    expect(shouldDehydrateQuery(q(['standings', 2025]))).toBe(true);
    expect(shouldDehydrateQuery(q(['team', 'abc']))).toBe(true);
    expect(shouldDehydrateQuery(q(['news', 10]))).toBe(true);
  });

  test('NEVER persists per-user queries (no cross-user/guest leakage on disk)', () => {
    expect(shouldDehydrateQuery(q(['preferences']))).toBe(false);
    expect(shouldDehydrateQuery(q(['home']))).toBe(false);
  });

  test('does not persist non-successful queries', () => {
    expect(shouldDehydrateQuery(q(['standings', 2025], 'error'))).toBe(false);
    expect(shouldDehydrateQuery(q(['standings', 2025], 'pending'))).toBe(false);
  });

  test('user-key list covers preferences and home', () => {
    expect(USER_QUERY_KEYS).toEqual(expect.arrayContaining(['preferences', 'home']));
  });
});
