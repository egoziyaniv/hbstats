import { resolveHomeLeagueScope, normalizeHomeLeagueScope, LIGAT_HAAL_API_ID } from '@/lib/home-league-scope';

describe('resolveHomeLeagueScope', () => {
  it('LIGAT_HAAL → [383] regardless of favourites', () => {
    expect(resolveHomeLeagueScope('LIGAT_HAAL', [999, 888])).toEqual([LIGAT_HAAL_API_ID]);
  });
  it('ALL → [] (no filter)', () => {
    expect(resolveHomeLeagueScope('ALL', [999])).toEqual([]);
  });
  it('FAVORITES → the favourite leagues when present', () => {
    expect(resolveHomeLeagueScope('FAVORITES', [999, 888])).toEqual([999, 888]);
  });
  it('FAVORITES with no favourites → [383]', () => {
    expect(resolveHomeLeagueScope('FAVORITES', [])).toEqual([LIGAT_HAAL_API_ID]);
  });
  it('unset/unknown scope behaves as FAVORITES (default)', () => {
    expect(resolveHomeLeagueScope(undefined, [])).toEqual([LIGAT_HAAL_API_ID]);
    expect(resolveHomeLeagueScope(null, [777])).toEqual([777]);
    expect(resolveHomeLeagueScope('garbage', [])).toEqual([LIGAT_HAAL_API_ID]);
  });
});

describe('normalizeHomeLeagueScope', () => {
  it('accepts the three valid values, rejects others', () => {
    expect(normalizeHomeLeagueScope('ALL')).toBe('ALL');
    expect(normalizeHomeLeagueScope('LIGAT_HAAL')).toBe('LIGAT_HAAL');
    expect(normalizeHomeLeagueScope('FAVORITES')).toBe('FAVORITES');
    expect(normalizeHomeLeagueScope('nope')).toBeNull();
    expect(normalizeHomeLeagueScope(undefined)).toBeNull();
  });
});
