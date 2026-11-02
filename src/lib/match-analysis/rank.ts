import type { Fact } from './types';

/** The facts an analysis is written from: rarest first, a small bonus for league-wide claims. */
export function rankFacts(facts: Fact[], max = 6, min = 0.3): Fact[] {
  const score = (f: Fact) => f.rarity + (f.scope === 'league' ? 0.05 : 0);
  return facts.filter((f) => !f.removed && f.rarity >= min).sort((a, b) => score(b) - score(a)).slice(0, max);
}
