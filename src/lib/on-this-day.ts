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
}

export interface OnThisDayPayload {
  match: OnThisDayMatch | null;
  birthdays: OnThisDayBirthday[];
}

// Big-club pairs whose meetings are derbies. Hebrew names as stored in Team.nameHe.
const DERBY_PAIRS: Array<[string, string]> = [
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
  homeTeam: { id: string; nameHe: string };
  awayTeam: { id: string; nameHe: string };
  competition: { nameHe: string | null } | null;
};

function isDerby(a: string, b: string): boolean {
  return DERBY_PAIRS.some(
    ([x, y]) => (a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x)),
  );
}

export function pickAnniversaryMatch(games: CandidateGame[], now: Date): CandidateGame | null {
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
    if (score > bestScore) { bestScore = score; best = g; }
  }
  return best;
}

let memo: { key: string; value: OnThisDayPayload } | null = null;
export function _clearOnThisDayMemoForTests() { memo = null; }

export async function getOnThisDay(now = new Date()): Promise<OnThisDayPayload> {
  const key = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
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
        homeTeam: { select: { id: true, nameHe: true } },
        awayTeam: { select: { id: true, nameHe: true } },
        competition: { select: { nameHe: true } },
      },
    });
    const picked = pickAnniversaryMatch(candidates, now);
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

  // Birthdays: players born on this day, most-capped first, deduped by canonical id.
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
    birthdays = players
      .sort((a, b) => b._count.lineupEntries - a._count.lineupEntries)
      .filter((pl) => {
        const key = pl.canonicalPlayerId || pl.id;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 3)
      .map((pl) => ({
        playerId: pl.canonicalPlayerId || pl.id,
        nameHe: pl.nameHe,
        age: now.getFullYear() - pl.birthDate!.getFullYear(),
        photoUrl: pl.photoUrl,
      }));
  }

  const value = { match, birthdays };
  memo = { key, value };
  return value;
}
