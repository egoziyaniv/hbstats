import { getSeasonsSpine } from '@/lib/history/seasons-spine';
import { getClubFamily, getClubFamilies, getClubTeamIndex } from '@/lib/history/club-identity';
import { getCupFinals, clearCupFinalsCache, type CupFinalRow } from '@/lib/history/cup-finals';

/**
 * Club honors — "ארון הגביעים": league titles + cup wins per club family,
 * back to 1945 (cup finals) / the spine's earliest complete season (league).
 *
 * League titles come from getSeasonsSpine()'s champions (playoff-aware,
 * honors pre-2000 positions — do NOT re-derive champions here).
 *
 * Toto Cup note: totoCup counts ONLY comp_toto_cup_al (top-flight). The
 * second-tier comp_toto_cup_leumit is a Liga Leumit competition, not a
 * ligat-ha'al honor, so its finals are excluded from every club's tally here
 * (they still appear in getCupFinals()'s full list for the /history/cups
 * transparency table).
 */

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface ClubHonors {
  clubKey: string;
  nameHe: string;
  logoUrl: string | null;
  /** Current team row id for this club family — for linking to /teams/[id] (not in the original plan sketch, added for page linkability, mirrors AllTimeRow.latestTeamId). */
  latestTeamId: string;
  leagueTitles: { count: number; years: number[] };
  stateCup: { count: number; years: number[] };
  totoCup: { count: number; years: number[] };
  superCup: { count: number; years: number[] };
}

export type { CupFinalRow };
export { getCupFinals };

let cache: { at: number; honors: ClubHonors[] } | null = null;
/** Invalidate the honors cache (and the cup-finals cache it builds on) — call after merges/rollbacks. */
export function clearHonorsCache() {
  cache = null;
  clearCupFinalsCache();
}
export const _clearHonorsCacheForTests = clearHonorsCache;

function blankHonors(fam: { clubKey: string; nameHe: string; logoUrl: string | null; latestTeamId: string }): ClubHonors {
  return {
    clubKey: fam.clubKey,
    nameHe: fam.nameHe,
    logoUrl: fam.logoUrl,
    latestTeamId: fam.latestTeamId,
    leagueTitles: { count: 0, years: [] },
    stateCup: { count: 0, years: [] },
    totoCup: { count: 0, years: [] },
    superCup: { count: 0, years: [] },
  };
}

async function buildAllHonors(): Promise<ClubHonors[]> {
  const [spine, families, teamIndex, finals] = await Promise.all([
    getSeasonsSpine(),
    getClubFamilies(),
    getClubTeamIndex(),
    getCupFinals(),
  ]);

  const familyByKey = new Map(families.map((f) => [f.clubKey, f] as const));
  const byClub = new Map<string, ClubHonors>();
  const ensure = (fam: { clubKey: string; nameHe: string; logoUrl: string | null; latestTeamId: string }): ClubHonors => {
    let h = byClub.get(fam.clubKey);
    if (!h) { h = blankHonors(fam); byClub.set(fam.clubKey, h); }
    return h;
  };

  for (const row of spine) {
    if (!row.champion) continue;
    const fam = teamIndex.get(row.champion.teamId);
    if (!fam) continue;
    const h = ensure(fam);
    h.leagueTitles.count += 1;
    h.leagueTitles.years.push(row.year);
  }

  // A club can win each cup at most once per season — dedupe on
  // (competition, seasonYear, winner). Guards against duplicate final imports
  // (observed: the 2020 Super Cup stored twice with mirrored home/away) while
  // keeping drawn-final replays correct (the draw has winner:null and is
  // skipped; only the decisive replay counts).
  const counted = new Set<string>();
  for (const final of finals) {
    if (!final.winner) continue; // undecidable draw — excluded from every tally
    const fam = familyByKey.get(final.winner.clubKey);
    if (!fam) continue; // family index disagrees with the finals loader — skip rather than guess a teamId
    const dedupeKey = `${final.competitionId}::${final.seasonYear}::${fam.clubKey}`;
    if (counted.has(dedupeKey)) continue;
    counted.add(dedupeKey);
    const h = ensure(fam);
    if (final.competitionId === 'comp_state_cup') {
      h.stateCup.count += 1;
      h.stateCup.years.push(final.seasonYear);
    } else if (final.competitionId === 'comp_toto_cup_al') {
      h.totoCup.count += 1;
      h.totoCup.years.push(final.seasonYear);
    } else if (final.competitionId === 'comp_super_cup') {
      h.superCup.count += 1;
      h.superCup.years.push(final.seasonYear);
    }
    // comp_toto_cup_leumit: intentionally not counted — see file header.
  }

  const honors = [...byClub.values()];
  for (const h of honors) {
    h.leagueTitles.years.sort((a, b) => a - b);
    h.stateCup.years.sort((a, b) => a - b);
    h.totoCup.years.sort((a, b) => a - b);
    h.superCup.years.sort((a, b) => a - b);
  }
  // Honor-roll default order: most decorated first (sum of all four tallies).
  honors.sort((a, b) => {
    const totalA = a.leagueTitles.count + a.stateCup.count + a.totoCup.count + a.superCup.count;
    const totalB = b.leagueTitles.count + b.stateCup.count + b.totoCup.count + b.superCup.count;
    return totalB - totalA;
  });
  return honors;
}

export async function getAllHonors(): Promise<ClubHonors[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.honors;
  const honors = await buildAllHonors();
  cache = { at: Date.now(), honors };
  return honors;
}

export async function getClubHonors(clubKey: string): Promise<ClubHonors | null> {
  const all = await getAllHonors();
  const found = all.find((h) => h.clubKey === clubKey);
  if (found) return found;
  // No titles/cups at all — still return a zeroed shell for a real club, so
  // "no honors yet" reads differently from "unknown clubKey" (404-worthy).
  const fam = await getClubFamily(clubKey);
  if (!fam) return null;
  return blankHonors(fam);
}
