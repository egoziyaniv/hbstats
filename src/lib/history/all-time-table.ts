import prisma from '@/lib/prisma';
import { getClubFamilies, getClubTeamIndex, type ClubFamily } from '@/lib/history/club-identity';

/**
 * All-time club table ("טבלת כל הזמנים"), Transfermarkt-style.
 *
 * scope='all'  → aggregates STORED Standing rows (covers every season with a
 *                table, 1949+; W/D/L/GF/GA/Pts summed per club family).
 * scope='home'/'away' → aggregates completed GAMES one leg per club (game rows
 *                exist 2000+ only — callers should show a coverage note).
 * Filters: fromYear/toYear (season start year), scope. League (comp_liga_haal) only.
 * Points are as stored (3-pt era throughout the games range).
 */

const LIGAT_HAAL_ID = 'comp_liga_haal';
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface AllTimeRow {
  clubKey: string;
  nameHe: string;
  logoUrl: string | null;
  latestTeamId: string;
  seasons: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
}

export interface AllTimeFilters {
  fromYear?: number;
  toYear?: number;
  scope?: 'all' | 'home' | 'away';
}

const cache = new Map<string, { at: number; rows: AllTimeRow[] }>();
export function clearAllTimeCache() { cache.clear(); }
export const _clearAllTimeCacheForTests = clearAllTimeCache;

function blank(f: ClubFamily): AllTimeRow {
  return {
    clubKey: f.clubKey, nameHe: f.nameHe, logoUrl: f.logoUrl, latestTeamId: f.latestTeamId,
    seasons: 0, played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalsDiff: 0, points: 0,
  };
}

export async function buildAllTimeTable(filters: AllTimeFilters): Promise<AllTimeRow[]> {
  const scope = filters.scope ?? 'all';
  const key = `${filters.fromYear ?? ''}|${filters.toYear ?? ''}|${scope}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.rows;

  const [families, familyByTeamId] = await Promise.all([getClubFamilies(), getClubTeamIndex()]);
  const rowByClub = new Map<string, AllTimeRow>();
  const seasonSets = new Map<string, Set<number>>();
  const rowFor = (teamId: string): { row: AllTimeRow; fam: ClubFamily } | null => {
    const fam = familyByTeamId.get(teamId);
    if (!fam) return null;
    let row = rowByClub.get(fam.clubKey);
    if (!row) { row = blank(fam); rowByClub.set(fam.clubKey, row); seasonSets.set(fam.clubKey, new Set()); }
    return { row, fam };
  };
  const inRange = (year: number) =>
    (filters.fromYear == null || year >= filters.fromYear) && (filters.toYear == null || year <= filters.toYear);

  if (scope === 'all') {
    const standings = await prisma.standing.findMany({
      where: { competitionId: LIGAT_HAAL_ID },
      select: {
        teamId: true, seasonId: true, played: true, wins: true, draws: true, losses: true,
        goalsFor: true, goalsAgainst: true, points: true,
      },
    });
    // season years come from the family season list (avoids a join per row)
    const yearBySeason = new Map<string, number>();
    for (const f of families) for (const s of f.seasons) yearBySeason.set(s.seasonId, s.year);
    for (const s of standings) {
      const year = yearBySeason.get(s.seasonId);
      if (year == null || !inRange(year)) continue;
      const r = rowFor(s.teamId);
      if (!r) continue;
      r.row.played += s.played; r.row.wins += s.wins; r.row.draws += s.draws; r.row.losses += s.losses;
      r.row.goalsFor += s.goalsFor; r.row.goalsAgainst += s.goalsAgainst; r.row.points += s.points;
      seasonSets.get(r.fam.clubKey)!.add(year);
    }
  } else {
    const games = await prisma.game.findMany({
      where: { competitionId: LIGAT_HAAL_ID, status: 'COMPLETED', homeScore: { not: null }, awayScore: { not: null } },
      select: { homeTeamId: true, awayTeamId: true, homeScore: true, awayScore: true, season: { select: { year: true } } },
    });
    for (const g of games) {
      if (!inRange(g.season.year)) continue;
      const teamId = scope === 'home' ? g.homeTeamId : g.awayTeamId;
      const r = rowFor(teamId);
      if (!r) continue;
      const gf = scope === 'home' ? g.homeScore! : g.awayScore!;
      const ga = scope === 'home' ? g.awayScore! : g.homeScore!;
      r.row.played += 1; r.row.goalsFor += gf; r.row.goalsAgainst += ga;
      if (gf > ga) { r.row.wins += 1; r.row.points += 3; }
      else if (gf < ga) { r.row.losses += 1; }
      else { r.row.draws += 1; r.row.points += 1; }
      seasonSets.get(r.fam.clubKey)!.add(g.season.year);
    }
  }

  const rows = [...rowByClub.values()]
    .map((r) => ({ ...r, seasons: seasonSets.get(r.clubKey)!.size, goalsDiff: r.goalsFor - r.goalsAgainst }))
    .filter((r) => r.played > 0)
    .sort((a, b) => b.points - a.points || b.goalsDiff - a.goalsDiff || b.goalsFor - a.goalsFor);

  cache.set(key, { at: Date.now(), rows });
  return rows;
}
