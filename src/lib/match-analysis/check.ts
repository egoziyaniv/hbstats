import type { Fact } from './types';

const NUM = /\d+(?:[.,]\d+)?/g;

/**
 * Numbers in the written text that no fact backs — the editor sees them as a warning.
 * Single digits 1-9 pass: they are list numbering and small counts.
 */
export function unknownNumbers(text: string, facts: Fact[], extra: string[] = []): string[] {
  const allowed = new Set<string>();
  const sources = [...facts.filter((f) => !f.removed).flatMap((f) => [f.textHe, f.coverageHe, ...Object.values(f.numbers).map(String)]), ...extra];
  for (const s of sources) for (const n of s.match(NUM) || []) allowed.add(n);
  return Array.from(new Set((text.match(NUM) || []).filter((n) => !allowed.has(n) && !/^[1-9]$/.test(n))));
}
