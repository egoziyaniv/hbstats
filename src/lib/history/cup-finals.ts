import prisma from '@/lib/prisma';
import { getClubTeamIndex } from '@/lib/history/club-identity';

/**
 * Cup finals loader — the shared base both `club-honors.ts` (title tallies)
 * and `seasons-spine.ts` (cupWinner column) build on. Extracted into its own
 * module so neither of those two has to import the other: club-honors already
 * imports seasons-spine (for league-title champions), so seasons-spine
 * importing club-honors back for cup data would be a cycle. Both import THIS
 * module instead.
 *
 * Finals detection: strict `^[Ff]inals?$` on TRIM(roundNameEn) via raw SQL —
 * mirrors on-this-day.ts's approach. A loose `contains 'Final'` also matches
 * "Semi-finals" / "8th Finals" / "5th Place Final" (~124 false positives,
 * verified during recon).
 *
 * Cup competitions covered (stable ids from scripts/rebuild/11-competitions.js):
 * State Cup, Toto Cup (top flight + Leumit), Super Cup. Toto Leumit finals ARE
 * included here (for the honor-roll transparency table) even though
 * club-honors.ts's `totoCup` tally counts ONLY the top-flight Toto Cup — see
 * the comment there.
 */

const CACHE_TTL_MS = 60 * 60 * 1000;

export interface CupFinalRow {
  seasonYear: number;
  competitionId: string;
  competitionNameHe: string;
  gameId: string;
  winner: { clubKey: string; nameHe: string } | null; // null = undecidable draw (no penalty data)
  loser: { clubKey: string; nameHe: string } | null;
  /** Participants — always populated, so undecided draws can still name both finalists. */
  home: { clubKey: string; nameHe: string };
  away: { clubKey: string; nameHe: string };
  scoreLabel: string; // winner-first when decided: "2–1" or "1–1 (5–4 בפנדלים)"
}

let cache: { at: number; rows: CupFinalRow[] } | null = null;
/** Invalidate the cup-finals cache — call after admin edits/merges that touch cup games. */
export function clearCupFinalsCache() { cache = null; }
export const _clearCupFinalsCacheForTests = clearCupFinalsCache;

async function build(): Promise<CupFinalRow[]> {
  // Fixed, non-user-controlled ids — safe to inline in the raw query.
  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM games
    WHERE "competitionId" IN ('comp_state_cup', 'comp_toto_cup_al', 'comp_toto_cup_leumit', 'comp_super_cup')
      AND status = 'COMPLETED'
      AND "homeScore" IS NOT NULL
      AND "awayScore" IS NOT NULL
      AND TRIM("roundNameEn") ~* '^finals?$'
  `;
  if (!idRows.length) return [];

  const games = await prisma.game.findMany({
    where: { id: { in: idRows.map((r) => r.id) } },
    select: {
      id: true,
      homeScore: true,
      awayScore: true,
      homePenalty: true,
      awayPenalty: true,
      homeTeamId: true,
      awayTeamId: true,
      competitionId: true,
      dateTime: true,
      season: { select: { year: true } },
      competition: { select: { nameHe: true } },
    },
    orderBy: { dateTime: 'desc' },
  });

  const clubIndex = await getClubTeamIndex();
  const rows: CupFinalRow[] = [];
  const emitted = new Set<string>();
  let skippedDraws = 0;
  let skippedUnresolved = 0;
  let skippedGhosts = 0;

  for (const g of games) {
    const homeFam = clubIndex.get(g.homeTeamId);
    const awayFam = clubIndex.get(g.awayTeamId);
    if (!homeFam || !awayFam) { skippedUnresolved += 1; continue; }

    const hs = g.homeScore as number;
    const as = g.awayScore as number;
    let winnerFam: typeof homeFam | null = null;
    let loserFam: typeof homeFam | null = null;
    let scoreLabel = `${hs}–${as}`;

    if (hs !== as) {
      // Decided in regulation — scoreLabel winner-first (loser side second).
      winnerFam = hs > as ? homeFam : awayFam;
      loserFam = hs > as ? awayFam : homeFam;
      scoreLabel = `${Math.max(hs, as)}–${Math.min(hs, as)}`;
    } else if (g.homePenalty != null && g.awayPenalty != null && g.homePenalty !== g.awayPenalty) {
      // Drawn at full time, resolved by a penalty shootout — pens winner-first.
      const homeWonShootout = g.homePenalty > g.awayPenalty;
      winnerFam = homeWonShootout ? homeFam : awayFam;
      loserFam = homeWonShootout ? awayFam : homeFam;
      const [winPens, losePens] = homeWonShootout
        ? [g.homePenalty, g.awayPenalty]
        : [g.awayPenalty, g.homePenalty];
      scoreLabel = `${hs}–${as} (${winPens}–${losePens} בפנדלים)`;
    } else {
      // Drawn with no (or equal — data error) penalty data — never guess a winner.
      skippedDraws += 1;
    }

    // Ghost-final defense: API-Football sometimes ships a postponed slot AND
    // the rescheduled match, both as FT (observed: 2020 Super Cup, apiIds
    // 591796 ghost / 591797 real). One final per (cup, season, winner, loser):
    // rows arrive dateTime-DESC, so the later — real — match is emitted first
    // and the earlier ghost is dropped here.
    const ghostKey = [
      g.competitionId,
      g.season.year,
      winnerFam?.clubKey ?? 'draw',
      loserFam?.clubKey ?? 'draw',
    ].join('::');
    if (emitted.has(ghostKey)) {
      skippedGhosts += 1;
      if (!winnerFam) skippedDraws -= 1; // don't double-report a skipped ghost draw
      continue;
    }
    emitted.add(ghostKey);

    rows.push({
      seasonYear: g.season.year,
      competitionId: g.competitionId as string,
      competitionNameHe: g.competition?.nameHe ?? '',
      gameId: g.id,
      winner: winnerFam ? { clubKey: winnerFam.clubKey, nameHe: winnerFam.nameHe } : null,
      loser: loserFam ? { clubKey: loserFam.clubKey, nameHe: loserFam.nameHe } : null,
      home: { clubKey: homeFam.clubKey, nameHe: homeFam.nameHe },
      away: { clubKey: awayFam.clubKey, nameHe: awayFam.nameHe },
      scoreLabel,
    });
  }

  if (skippedDraws > 0) {
    console.warn(`[cup-finals] ${skippedDraws} final(s) drawn with no resolvable penalty data — winner left null`);
  }
  if (skippedUnresolved > 0) {
    console.warn(`[cup-finals] skipped ${skippedUnresolved} final(s) with unresolvable club identity`);
  }
  if (skippedGhosts > 0) {
    console.warn(`[cup-finals] dropped ${skippedGhosts} duplicate (ghost) final import(s)`);
  }

  return rows;
}

/** Cup finals, newest first, across all four cup competitions. */
export async function getCupFinals(): Promise<CupFinalRow[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.rows;
  const rows = await build();
  cache = { at: Date.now(), rows };
  return rows;
}
