import prisma from '@/lib/prisma';
import { sortStandings } from '@/lib/standings';
import { getCupFinals } from '@/lib/history/cup-finals';
import { getClubFamilies } from '@/lib/history/club-identity';

/**
 * "כל העונות" — one row per season: champion, runner-up, top scorer, relegated,
 * state-cup winner. The FBref-style spine that makes 26 seasons browsable.
 * Premier league only (comp_liga_haal). Cached in-memory for 1h — history
 * changes once a season.
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
  /** State Cup winner that season, from cup-finals.ts (null: no final that year, or an undecidable draw). */
  cupWinner: SpineTeamRef | null;
}

let cache: { at: number; rows: SeasonSpineRow[] } | null = null;
/** Invalidate the spine cache — call after admin edits that change standings. */
export function clearSpineCache() { cache = null; }
export const _clearSpineCacheForTests = clearSpineCache;

export async function getSeasonsSpine(): Promise<SeasonSpineRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;

  const [seasons, standings, scorers, unfinishedGames, cupFinals, clubFamilies] = await Promise.all([
    prisma.season.findMany({ orderBy: { year: 'desc' }, select: { id: true, year: true, name: true } }),
    prisma.standing.findMany({
      where: { competitionId: LIGAT_HAAL_ID },
      select: {
        id: true, seasonId: true, position: true, teamId: true, statusHe: true, descriptionHe: true,
        played: true, points: true, goalsFor: true, goalsAgainst: true, wins: true, draws: true, losses: true,
        pointsAdjustment: true, pointsAdjustmentNoteHe: true, groupNameEn: true,
        team: { select: { id: true, nameHe: true, logoUrl: true } },
      },
    }),
    prisma.competitionLeaderboardEntry.findMany({
      where: { competitionId: LIGAT_HAAL_ID, category: 'TOP_SCORERS', rank: 1 },
      select: { seasonId: true, rank: true, playerId: true, playerNameHe: true, playerNameEn: true, value: true },
    }),
    prisma.game.findMany({
      where: { competitionId: LIGAT_HAAL_ID, status: { in: ['SCHEDULED', 'ONGOING'] } },
      select: { seasonId: true },
      distinct: ['seasonId'],
    }),
    getCupFinals(),
    getClubFamilies(),
  ]);

  // a season with unplayed league games isn't history yet — no false champions
  const unfinishedSeasonIds = new Set(unfinishedGames.map((g) => g.seasonId));

  const standingsBySeason = new Map<string, typeof standings>();
  for (const s of standings) {
    const arr = standingsBySeason.get(s.seasonId) || [];
    arr.push(s);
    standingsBySeason.set(s.seasonId, arr);
  }
  const scorerBySeason = new Map(scorers.map((s) => [s.seasonId, s]));

  // State Cup winner per season year — only the top-flight State Cup counts
  // toward this column (mirrors club-honors.ts's stateCup tally).
  const cupWinnerByYear = new Map(
    cupFinals
      .filter((f) => f.competitionId === 'comp_state_cup' && f.winner)
      .map((f) => [f.seasonYear, f.winner!] as const),
  );
  const familyByKey = new Map(clubFamilies.map((f) => [f.clubKey, f] as const));

  const ref = (s: (typeof standings)[number]): SpineTeamRef =>
    ({ teamId: s.team.id, nameHe: s.team.nameHe, logoUrl: s.team.logoUrl });

  const rows: SeasonSpineRow[] = [];
  for (const season of seasons) {
    const rowsForSeason = standingsBySeason.get(season.id) || [];
    if (!rowsForSeason.length) continue; // pre-import or empty upcoming season
    if (unfinishedSeasonIds.has(season.id)) continue; // still being played — not history yet

    // Playoff-era seasons (2019/20+) store TWO rows per position — one per
    // playoff group (groupNameEn "…Championship…" / "…Relegation…"). The
    // championship group fills the top of the overall table and the relegation
    // group its bottom (same convention as buildStandingsFromGames), so the
    // champion must come from the championship group and the relegated teams
    // from the relegation group — raw `position` is ambiguous across groups.
    const champGroup = rowsForSeason.filter((r) => /championship/i.test(r.groupNameEn || ''));
    const relGroup = rowsForSeason.filter((r) => /relegation/i.test(r.groupNameEn || ''));

    // Relegated: rows explicitly marked ירידה override positional inference
    // when present (current data has no markers, kept defensively).
    const marked = rowsForSeason.filter(
      (r) => (r.statusHe || '').includes('ירידה') || (r.descriptionHe || '').includes('ירידה'),
    );

    let champion: SpineTeamRef | null;
    let runnerUp: SpineTeamRef | null;
    let relegated: SpineTeamRef[];

    if (champGroup.length && relGroup.length) {
      const champOrdered = sortStandings(champGroup);
      const relOrdered = sortStandings(relGroup);
      champion = champOrdered[0] ? ref(champOrdered[0]) : null;
      runnerUp = champOrdered[1] ? ref(champOrdered[1]) : null;
      relegated = (marked.length ? marked : relOrdered.slice(-2)).map(ref);
    } else {
      // Single-table season: the stored `position` IS the official final
      // ranking, and history has seasons where it deliberately disagrees with
      // points order (1973/74 withdrawn teams ranked 5-6 with 1-4 points;
      // 1989/90 top/bottom split where positions 7-12 out-point position 6).
      // Honor it. Fall back to standing rules only when positions are
      // duplicated without group labels (ambiguous data).
      const uniquePositions = new Set(rowsForSeason.map((r) => r.position));
      const ordered = uniquePositions.size === rowsForSeason.length
        ? [...rowsForSeason].sort((a, b) => a.position - b.position)
        : sortStandings(rowsForSeason);
      champion = ordered[0] ? ref(ordered[0]) : null;
      runnerUp = ordered[1] ? ref(ordered[1]) : null;
      relegated = (marked.length ? marked : ordered.slice(-2)).map(ref);
    }

    const scorer = scorerBySeason.get(season.id);
    const cupWinnerRef = cupWinnerByYear.get(season.year);
    const cupWinnerFamily = cupWinnerRef ? familyByKey.get(cupWinnerRef.clubKey) : undefined;
    rows.push({
      seasonId: season.id,
      year: season.year,
      name: season.name,
      champion,
      runnerUp,
      topScorer: scorer
        ? { playerId: scorer.playerId, nameHe: scorer.playerNameHe || scorer.playerNameEn || '', goals: scorer.value }
        : null,
      relegated,
      cupWinner: cupWinnerFamily
        ? { teamId: cupWinnerFamily.latestTeamId, nameHe: cupWinnerFamily.nameHe, logoUrl: cupWinnerFamily.logoUrl }
        : null,
    });
  }

  cache = { at: Date.now(), rows };
  return rows;
}
