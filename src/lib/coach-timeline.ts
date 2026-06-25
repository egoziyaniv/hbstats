/**
 * coach-timeline.ts — per-team coach history grouped by season.
 *
 * Source: GameLineupEntry rows with role=COACH (one per match, from IFA).
 * Coverage: every Israeli league/cup match 2016-present.
 *
 * We:
 *   1. Normalize coach names (collapse "R. Kozuch" + "Ran Kozuch" to a single
 *      canonical entity by lastname + first-initial).
 *   2. Group by (seasonId, normalizedCoachName) so each season's row lists all
 *      coaches who managed at least one match that season.
 *   3. Attach photo URLs from API-Football via apiFootballCoachId on
 *      TeamCoachAssignment.
 */
import prisma from '@/lib/prisma';

export interface CoachTenure {
  name: string;
  photoUrl: string | null;
  firstMatch: string;
  lastMatch: string;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
}

export interface SeasonCoachGroup {
  seasonId: string;
  seasonName: string;
  year: number;
  coaches: CoachTenure[];
}

function normalizeKey(rawName: string): string {
  // "R. Kozuch" / "Ran Kozuch" → "r kozuch" so they collapse.
  // Take last whitespace-separated token (lastname) + the FIRST LETTER of the
  // first token (first initial). Strip punctuation and lowercase.
  const parts = rawName.replace(/[.,]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return rawName.toLowerCase();
  const lastName = parts[parts.length - 1].toLowerCase();
  const firstInitial = parts[0][0]?.toLowerCase() || '';
  return `${firstInitial} ${lastName}`;
}

function preferLongerName(a: string, b: string): string {
  // Display the longest name we've seen (Ran Kozuch beats R. Kozuch).
  return b.length > a.length ? b : a;
}

export async function buildCoachTimelineBySeason(teamId: string): Promise<SeasonCoachGroup[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { nameEn: true, nameHe: true },
  });
  if (!team) return [];

  // Map normalized-key → apiFootballCoachId (for photos). Use the most-frequent
  // assignment for that key. Many keys won't have an API id; their photo stays null.
  const assignments = await prisma.teamCoachAssignment.findMany({
    where: { team: { nameEn: team.nameEn } },
    select: { coachNameEn: true, apiFootballCoachId: true },
  });
  const photoByKey = new Map<string, string>();
  for (const a of assignments) {
    if (!a.apiFootballCoachId) continue;
    const k = normalizeKey(a.coachNameEn);
    if (!photoByKey.has(k)) {
      photoByKey.set(k, `https://media.api-sports.io/football/coachs/${a.apiFootballCoachId}.png`);
    }
  }

  // Pull every match-level coach entry alongside game info + season.
  const rows = await prisma.$queryRaw<Array<{
    season_id: string;
    season_name: string;
    season_year: number;
    coach_raw: string;
    game_date: Date;
    home_score: number;
    away_score: number;
    home_team_id: string;
    away_team_id: string;
    team_id: string;
  }>>`
    SELECT
      g."seasonId" AS season_id,
      s.name AS season_name,
      s.year AS season_year,
      gle."participantName" AS coach_raw,
      g."dateTime" AS game_date,
      g."homeScore" AS home_score,
      g."awayScore" AS away_score,
      g."homeTeamId" AS home_team_id,
      g."awayTeamId" AS away_team_id,
      gle."teamId" AS team_id
    FROM "game_lineup_entries" gle
    JOIN "games" g ON g.id = gle."gameId"
    JOIN "seasons" s ON s.id = g."seasonId"
    JOIN "teams" t ON t.id = gle."teamId" AND t."nameEn" = ${team.nameEn}
    WHERE gle.role = 'COACH'
      AND gle."participantName" IS NOT NULL
      AND g."homeScore" IS NOT NULL
      AND g."awayScore" IS NOT NULL
  `;

  // Resolve the admin-merged canonical coach for each raw name via CoachAlias,
  // so merged variants (e.g. "R. Kozuch" + "R. Kojok") collapse to ONE coach and
  // display the Hebrew name + curated photo instead of the raw English variant.
  const rawNames = Array.from(new Set(rows.map((r) => r.coach_raw).filter(Boolean)));
  const canonicalByRaw = new Map<string, { id: string; name: string; photo: string | null }>();
  if (rawNames.length > 0) {
    const aliasRows = await prisma.coachAlias.findMany({
      where: { alias: { in: rawNames } },
      select: { alias: true, coach: { select: { id: true, nameEn: true, nameHe: true, photoUrl: true } } },
    });
    for (const ar of aliasRows) {
      canonicalByRaw.set(ar.alias, {
        id: ar.coach.id,
        name: ar.coach.nameHe || ar.coach.nameEn,
        photo: ar.coach.photoUrl ?? null,
      });
    }
  }

  // Group: seasonId → coachKey → tenure. Canonical coaches key by coach id (so
  // their variants merge); unmatched names fall back to the normalized name key.
  type Bucket = {
    name: string;
    canonical: boolean;
    photoUrl: string | null;
    matches: number;
    wins: number;
    draws: number;
    losses: number;
    firstMatch: Date;
    lastMatch: Date;
  };
  const seasonMap = new Map<string, {
    seasonName: string;
    year: number;
    coaches: Map<string, Bucket>;
  }>();

  for (const r of rows) {
    let bySeason = seasonMap.get(r.season_id);
    if (!bySeason) {
      bySeason = { seasonName: r.season_name, year: r.season_year, coaches: new Map() };
      seasonMap.set(r.season_id, bySeason);
    }
    const can = canonicalByRaw.get(r.coach_raw);
    const normKey = normalizeKey(r.coach_raw);
    const groupKey = can ? `c:${can.id}` : `k:${normKey}`;
    let bucket = bySeason.coaches.get(groupKey);
    if (!bucket) {
      bucket = {
        name: can ? can.name : r.coach_raw,
        canonical: !!can,
        photoUrl: can ? can.photo : (photoByKey.get(normKey) || null),
        matches: 0, wins: 0, draws: 0, losses: 0,
        firstMatch: r.game_date, lastMatch: r.game_date,
      };
      bySeason.coaches.set(groupKey, bucket);
    } else if (!bucket.canonical) {
      // Only refine the display name/photo for non-canonical buckets; canonical
      // ones keep their Hebrew name.
      bucket.name = preferLongerName(bucket.name, r.coach_raw);
      if (!bucket.photoUrl) bucket.photoUrl = photoByKey.get(normKey) || null;
    }
    bucket.matches++;
    if (r.game_date < bucket.firstMatch) bucket.firstMatch = r.game_date;
    if (r.game_date > bucket.lastMatch) bucket.lastMatch = r.game_date;
    const isHome = r.home_team_id === r.team_id;
    const teamScore = isHome ? r.home_score : r.away_score;
    const oppScore = isHome ? r.away_score : r.home_score;
    if (teamScore > oppScore) bucket.wins++;
    else if (teamScore < oppScore) bucket.losses++;
    else bucket.draws++;
  }

  // Project to result, sorted newest-first
  const result: SeasonCoachGroup[] = Array.from(seasonMap.entries()).map(([seasonId, { seasonName, year, coaches }]) => ({
    seasonId,
    seasonName,
    year,
    coaches: Array.from(coaches.values())
      .map((b) => ({
        name: b.name,
        photoUrl: b.photoUrl,
        firstMatch: b.firstMatch.toISOString().slice(0, 10),
        lastMatch: b.lastMatch.toISOString().slice(0, 10),
        matches: b.matches,
        wins: b.wins,
        draws: b.draws,
        losses: b.losses,
        winPct: b.matches > 0 ? Math.round((b.wins / b.matches) * 100) : 0,
      }))
      .sort((a, b) => a.firstMatch.localeCompare(b.firstMatch)),
  }));
  result.sort((a, b) => b.year - a.year);
  return result;
}

// Legacy single-list export kept so existing callers keep compiling. Flatten the
// season-grouped result into a single newest-first array.
export interface CoachTenureFlat extends CoachTenure {
  exactStart: string | null;
  exactEnd: string | null;
}
export async function buildCoachTimeline(teamId: string): Promise<CoachTenureFlat[]> {
  const groups = await buildCoachTimelineBySeason(teamId);
  return groups.flatMap((g) =>
    g.coaches.map((c) => ({ ...c, exactStart: null, exactEnd: null })),
  );
}

/**
 * Coach Win Chart — one entry per (coach, season) tenure with a CROSS-SEASON
 * canonical display name and photo, so "R. Kozuch (24/25)" and "Ran Kozuch
 * (25/26)" render identically. Sorted chronologically (oldest → newest).
 */
export interface CoachChartEntry {
  coachKey: string;
  displayName: string;
  photoUrl: string | null;
  seasonName: string;
  year: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  winPct: number;
  pointsPerGame: number;
}

export async function buildCoachWinChart(teamId: string): Promise<CoachChartEntry[]> {
  const groups = await buildCoachTimelineBySeason(teamId);

  // First pass: pick the canonical (longest) display name + first photo we see
  // for each normalized key across ALL seasons.
  const canonicalName = new Map<string, string>();
  const canonicalPhoto = new Map<string, string | null>();
  for (const g of groups) {
    for (const c of g.coaches) {
      const key = normalizeKey(c.name);
      const existing = canonicalName.get(key);
      canonicalName.set(key, existing ? preferLongerName(existing, c.name) : c.name);
      if (c.photoUrl && !canonicalPhoto.get(key)) canonicalPhoto.set(key, c.photoUrl);
    }
  }

  // Overlay admin-curated Coach data (Hebrew name + manual photo) — when a
  // CoachAlias matches one of our variants, prefer the canonical Coach.nameHe
  // and photoUrl for display.
  const allRawNames = new Set<string>();
  for (const g of groups) for (const c of g.coaches) allRawNames.add(c.name);
  if (allRawNames.size > 0) {
    const aliasRows = await prisma.coachAlias.findMany({
      where: { alias: { in: Array.from(allRawNames) } },
      select: { alias: true, coach: { select: { nameEn: true, nameHe: true, photoUrl: true } } },
    });
    for (const ar of aliasRows) {
      const key = normalizeKey(ar.alias);
      const displayName = ar.coach.nameHe || ar.coach.nameEn;
      canonicalName.set(key, displayName);
      if (ar.coach.photoUrl) canonicalPhoto.set(key, ar.coach.photoUrl);
    }
  }

  // Second pass: flatten to (coach, season) rows using the canonical display name.
  const rows: CoachChartEntry[] = [];
  for (const g of groups) {
    for (const c of g.coaches) {
      const key = normalizeKey(c.name);
      const points = c.wins * 3 + c.draws;
      rows.push({
        coachKey: key,
        displayName: canonicalName.get(key) || c.name,
        photoUrl: canonicalPhoto.get(key) || c.photoUrl,
        seasonName: g.seasonName,
        year: g.year,
        matches: c.matches,
        wins: c.wins,
        draws: c.draws,
        losses: c.losses,
        winPct: c.winPct,
        pointsPerGame: c.matches > 0 ? Math.round((points / c.matches) * 10) / 10 : 0,
      });
    }
  }
  // Sort chronologically: older seasons first, within a season older tenures first.
  rows.sort((a, b) => a.year - b.year);
  return rows;
}
