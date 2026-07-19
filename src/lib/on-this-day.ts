import prisma from '@/lib/prisma';

/**
 * "היום לפני X שנים" — pick the day's best anniversary match + birthdays.
 * Scoring (spec §4.2; title-decider heuristic deferred): cup final > derby >
 * goal count, with a bonus for round anniversaries (10/20/25 years).
 */

export interface OnThisDayMatch {
  gameId: string;
  yearsAgo: number;
  dateISO: string;
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  competitionName: string | null;
  headline: string;
}

export interface OnThisDayBirthday {
  playerId: string;
  nameHe: string;
  age: number;
  photoUrl: string | null;
  /** The player's current club — set only if they have a current-season roster
   * entry (i.e. still active); null for retired / departed players. */
  currentTeam: { nameHe: string; logoUrl: string | null } | null;
}

export interface OnThisDayPayload {
  match: OnThisDayMatch | null;
  birthdays: OnThisDayBirthday[];
}

// Big-club pairs whose meetings are derbies. Hebrew names as stored in Team.nameHe.
// Exported (read-only) for /history/h2h's curated rivalry index.
export const DERBY_PAIRS: ReadonlyArray<readonly [string, string]> = [
  // StatsAI is Hapoel Be'er Sheva-fans-first — HBS rivalries lead the list.
  // Order matters downstream: the /history hub teaser uses DERBY_PAIRS[0], and
  // the /history/h2h index groups HBS pairs into their own top section.
  ['הפועל באר שבע', 'מכבי תל אביב'],
  ['הפועל באר שבע', 'מכבי חיפה'],
  ['הפועל באר שבע', 'בית"ר ירושלים'],
  ['הפועל באר שבע', 'הפועל תל אביב'],
  ['הפועל באר שבע', 'מ.ס. אשדוד'], // דרבי הדרום
  ['מכבי תל אביב', 'הפועל תל אביב'],
  ['מכבי חיפה', 'הפועל חיפה'],
  ['בית"ר ירושלים', 'הפועל ירושלים'],
  ['מכבי תל אביב', 'מכבי חיפה'],
  ['בית"ר ירושלים', 'הפועל תל אביב'],
];

type CandidateGame = {
  id: string;
  dateTime: Date;
  homeScore: number | null;
  awayScore: number | null;
  roundNameEn: string | null;
  homeTeam: { id: string; nameHe: string; apiFootballId: number | null };
  awayTeam: { id: string; nameHe: string; apiFootballId: number | null };
  competition: { nameHe: string | null } | null;
};

function isDerby(a: string, b: string): boolean {
  return DERBY_PAIRS.some(
    ([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)),
  );
}

export function pickAnniversaryMatch(
  games: CandidateGame[],
  now: Date,
  favoriteTeamApiIds: number[] = [],
): CandidateGame | null {
  const favSet = new Set(favoriteTeamApiIds);
  let best: CandidateGame | null = null;
  let bestScore = -1;
  for (const g of games) {
    if (g.homeScore === null || g.awayScore === null) continue;
    const goals = g.homeScore + g.awayScore;
    const yearsAgo = now.getFullYear() - g.dateTime.getFullYear();
    if (yearsAgo < 1) continue;
    let score = goals * 5;
    // Strict match — "Final"/"Finals" only. A bare /final/i would also hit
    // "Quarter-finals", "Semi-finals", "8th Finals", "5th Place Final" etc.
    if (/^finals?$/i.test((g.roundNameEn || '').trim())) score += 100;
    if (isDerby(g.homeTeam.nameHe, g.awayTeam.nameHe)) score += 50;
    if (yearsAgo % 10 === 0 || yearsAgo === 25) score += 20;
    // Personalisation: a game involving the viewer's favourite team wins over a
    // generic higher-scoring one, but not over a genuine final.
    if ((g.homeTeam.apiFootballId != null && favSet.has(g.homeTeam.apiFootballId)) ||
        (g.awayTeam.apiFootballId != null && favSet.has(g.awayTeam.apiFootballId))) {
      score += 60;
    }
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

let memo: { key: string; value: OnThisDayPayload } | null = null;
export function _clearOnThisDayMemoForTests() { memo = null; }

export async function getOnThisDay(now = new Date(), favoriteTeamApiIds: number[] = []): Promise<OnThisDayPayload> {
  const favKey = [...favoriteTeamApiIds].sort((a, b) => a - b).join(',');
  const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}|${favKey}`;
  if (memo && memo.key === key) return memo.value;

  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Games played on this calendar day in past years (raw SQL: Prisma cannot
  // filter by month/day). Table/column names per @@map: games."dateTime".
  const idRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM games
    WHERE status = 'COMPLETED'
      AND "homeScore" IS NOT NULL
      AND EXTRACT(MONTH FROM "dateTime") = ${month}
      AND EXTRACT(DAY FROM "dateTime") = ${day}
      AND EXTRACT(YEAR FROM "dateTime") < ${now.getFullYear()}
  `;
  let match: OnThisDayMatch | null = null;
  if (idRows.length) {
    const candidates: CandidateGame[] = await prisma.game.findMany({
      where: { id: { in: idRows.map((r) => r.id) } },
      select: {
        id: true, dateTime: true, homeScore: true, awayScore: true, roundNameEn: true,
        homeTeam: { select: { id: true, nameHe: true, apiFootballId: true } },
        awayTeam: { select: { id: true, nameHe: true, apiFootballId: true } },
        competition: { select: { nameHe: true } },
      },
    });
    const picked = pickAnniversaryMatch(candidates, now, favoriteTeamApiIds);
    if (picked) {
      const yearsAgo = now.getFullYear() - picked.dateTime.getFullYear();
      match = {
        gameId: picked.id,
        yearsAgo,
        dateISO: picked.dateTime.toISOString(),
        homeName: picked.homeTeam.nameHe,
        awayName: picked.awayTeam.nameHe,
        homeScore: picked.homeScore!,
        awayScore: picked.awayScore!,
        competitionName: picked.competition?.nameHe ?? null,
        headline: `היום לפני ${yearsAgo} שנים: ${picked.homeTeam.nameHe} ${picked.homeScore}–${picked.awayScore} ${picked.awayTeam.nameHe}`,
      };
    }
  }

  // Birthdays: players born on this day, most-capped first, deduped by canonical
  // id. Favourite-team players are ordered first; each shows its current club if
  // the player still has a current-season roster entry.
  const bdayIdRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM players
    WHERE "birthDate" IS NOT NULL
      AND EXTRACT(MONTH FROM "birthDate") = ${month}
      AND EXTRACT(DAY FROM "birthDate") = ${day}
  `;
  let birthdays: OnThisDayBirthday[] = [];
  if (bdayIdRows.length) {
    const players = await prisma.player.findMany({
      where: { id: { in: bdayIdRows.map((r) => r.id) } },
      select: {
        id: true, canonicalPlayerId: true, nameHe: true, birthDate: true, photoUrl: true,
        _count: { select: { lineupEntries: true } },
      },
    });
    const seen = new Set<string>();
    const deduped = players
      .sort((a, b) => b._count.lineupEntries - a._count.lineupEntries)
      .filter((pl) => {
        const canonId = pl.canonicalPlayerId || pl.id;
        if (seen.has(canonId)) return false;
        seen.add(canonId);
        return true;
      })
      .map((pl) => ({
        canonId: pl.canonicalPlayerId || pl.id,
        nameHe: pl.nameHe,
        age: now.getFullYear() - pl.birthDate!.getFullYear(),
        photoUrl: pl.photoUrl,
      }));

    // Prioritise players linked to a favourite team (stable → keeps caps order within groups).
    if (favoriteTeamApiIds.length && deduped.length) {
      const canonIds = deduped.map((d) => d.canonId);
      const favRows = await prisma.player.findMany({
        where: {
          OR: [{ id: { in: canonIds } }, { canonicalPlayerId: { in: canonIds } }],
          team: { apiFootballId: { in: favoriteTeamApiIds } },
        },
        select: { id: true, canonicalPlayerId: true },
      });
      const favSet = new Set(favRows.map((r) => r.canonicalPlayerId || r.id));
      deduped.sort((a, b) => (favSet.has(b.canonId) ? 1 : 0) - (favSet.has(a.canonId) ? 1 : 0));
    }

    const display = deduped.slice(0, 3);

    // Current club: a display player is "still active" if any row in their
    // canonical group has a team in the latest season.
    const teamByCanon = new Map<string, { nameHe: string; logoUrl: string | null }>();
    if (display.length) {
      const currentSeason = await prisma.season.findFirst({ orderBy: { year: 'desc' }, select: { id: true } });
      if (currentSeason) {
        const ids = display.map((d) => d.canonId);
        const rows = await prisma.player.findMany({
          where: {
            OR: [{ id: { in: ids } }, { canonicalPlayerId: { in: ids } }],
            team: { seasonId: currentSeason.id },
          },
          select: { id: true, canonicalPlayerId: true, team: { select: { nameHe: true, logoUrl: true } } },
        });
        for (const r of rows) {
          if (r.team) teamByCanon.set(r.canonicalPlayerId || r.id, { nameHe: r.team.nameHe, logoUrl: r.team.logoUrl });
        }
      }
    }

    birthdays = display.map((d) => ({
      playerId: d.canonId,
      nameHe: d.nameHe,
      age: d.age,
      photoUrl: d.photoUrl,
      currentTeam: teamByCanon.get(d.canonId) ?? null,
    }));
  }

  const value = { match, birthdays };
  memo = { key, value };
  return value;
}
