import prisma from '@/lib/prisma';

/**
 * "כל העונות" — one row per season: champion, runner-up, top scorer, relegated.
 * The FBref-style spine that makes 26 seasons browsable. Premier league only
 * (comp_liga_haal). Cached in-memory for 1h — history changes once a season.
 */

const LIGAT_HAAL_ID = 'comp_liga_haal';
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface SpineTeamRef { teamId: string; nameHe: string; logoUrl: string | null }
export interface SeasonSpineRow {
  seasonId: string;
  year: number;
  name: string;
  champion: SpineTeamRef | null;
  runnerUp: SpineTeamRef | null;
  topScorer: { playerId: string | null; nameHe: string; goals: number } | null;
  relegated: SpineTeamRef[];
}

let cache: { at: number; rows: SeasonSpineRow[] } | null = null;
export function _clearSpineCacheForTests() { cache = null; }

export async function getSeasonsSpine(): Promise<SeasonSpineRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const [seasons, standings, scorers] = await Promise.all([
    prisma.season.findMany({ orderBy: { year: 'desc' }, select: { id: true, year: true, name: true } }),
    prisma.standing.findMany({
      where: { competitionId: LIGAT_HAAL_ID },
      select: {
        seasonId: true, position: true, teamId: true, statusHe: true, descriptionHe: true,
        team: { select: { id: true, nameHe: true, logoUrl: true } },
      },
    }),
    prisma.competitionLeaderboardEntry.findMany({
      where: { competitionId: LIGAT_HAAL_ID, category: 'TOP_SCORERS', rank: 1 },
      select: { seasonId: true, rank: true, playerId: true, playerNameHe: true, value: true },
    }),
  ]);

  const standingsBySeason = new Map<string, typeof standings>();
  for (const s of standings) {
    const arr = standingsBySeason.get(s.seasonId) || [];
    arr.push(s);
    standingsBySeason.set(s.seasonId, arr);
  }
  const scorerBySeason = new Map(scorers.map((s) => [s.seasonId, s]));

  const ref = (s: (typeof standings)[number] | undefined): SpineTeamRef | null =>
    s ? { teamId: s.team.id, nameHe: s.team.nameHe, logoUrl: s.team.logoUrl } : null;

  const rows: SeasonSpineRow[] = [];
  for (const season of seasons) {
    const rowsForSeason = (standingsBySeason.get(season.id) || []).sort((a, b) => a.position - b.position);
    if (!rowsForSeason.length) continue; // pre-import or empty upcoming season

    // Relegated: rows explicitly marked ירידה; fallback bottom-2 by position.
    const marked = rowsForSeason.filter(
      (r) => (r.statusHe || '').includes('ירידה') || (r.descriptionHe || '').includes('ירידה'),
    );
    const relegated = (marked.length ? marked : rowsForSeason.slice(-2)).map((r) => ref(r)!) as SpineTeamRef[];

    const scorer = scorerBySeason.get(season.id);
    rows.push({
      seasonId: season.id,
      year: season.year,
      name: season.name,
      champion: ref(rowsForSeason.find((r) => r.position === 1)),
      runnerUp: ref(rowsForSeason.find((r) => r.position === 2)),
      topScorer: scorer ? { playerId: scorer.playerId, nameHe: scorer.playerNameHe || '', goals: scorer.value } : null,
      relegated,
    });
  }

  cache = { at: Date.now(), rows };
  return rows;
}
