export const LIGAT_HAAL_API_ID = 383;

export type HomeLeagueScope = 'FAVORITES' | 'LIGAT_HAAL' | 'ALL';
export const HOME_LEAGUE_SCOPES: HomeLeagueScope[] = ['FAVORITES', 'LIGAT_HAAL', 'ALL'];

export function normalizeHomeLeagueScope(v: unknown): HomeLeagueScope | null {
  return v === 'FAVORITES' || v === 'LIGAT_HAAL' || v === 'ALL' ? v : null;
}

/**
 * Competition-api-id filter for the home page's league-scoped blocks (next
 * game, last game, predictions, h2h), from a user's homeLeagueScope preference:
 *   LIGAT_HAAL → [383]
 *   ALL        → [] (no filter)
 *   FAVORITES  → the user's favorite leagues, or [383] if they picked none
 * Anonymous / unset scope behaves as FAVORITES. An explicit ?league= URL filter
 * overrides this upstream (handled by the caller).
 */
export function resolveHomeLeagueScope(
  scope: string | null | undefined,
  favoriteCompetitionApiIds: number[],
): number[] {
  if (scope === 'ALL') return [];
  if (scope === 'LIGAT_HAAL') return [LIGAT_HAAL_API_ID];
  return favoriteCompetitionApiIds.length ? favoriteCompetitionApiIds : [LIGAT_HAAL_API_ID];
}
