/**
 * all-time-stats.ts — cross-season leaderboards unified across data sources.
 *
 * Two underlying sources are merged transparently for the user:
 *   - PlayerStatistics (rich, 2016+) — joined to Player → canonical so we get
 *     the proper canonical id + Hebrew name + photo.
 *   - scraped_leaderboards (Walla, top-5 per season, 2000-2026) — text-only
 *     names; we best-effort match to canonical Players by Hebrew/English name
 *     so the link works when possible, and silently fall back to text rows.
 *
 * Within one (player, season) we pick MAX per metric to avoid double-counting
 * league + cup entries.
 */
import prisma from '@/lib/prisma';

export interface AllTimeEntry {
  rank: number;
  canonicalId: string;
  displayName: string;
  photoUrl: string | null;
  total: number;
  seasons: number;
  bestSeason: { seasonName: string; value: number } | null;
  teams: string[];
}

const METRIC_MAP = {
  TOP_SCORERS: 'goals',
  TOP_ASSISTS: 'assists',
  TOP_YELLOW_CARDS: 'yellowCards',
  TOP_RED_CARDS: 'redCards',
} as const;

export type AllTimeCategory = keyof typeof METRIC_MAP;

export async function buildAllTimeLeaderboard(category: AllTimeCategory, limit = 50, sinceYear?: number): Promise<AllTimeEntry[]> {
  const column = METRIC_MAP[category];
  const sinceFilter = sinceYear ? ` AND s.year >= ${sinceYear}` : '';
  const sinceJoin = sinceYear ? ` JOIN "seasons" s ON s.id = ps."seasonId"` : '';

  // Pick MAX per (canonical, season) to avoid double-counting across competitions,
  // then SUM per canonical player. Names/photos/teams come from subqueries on
  // the canonical id so we get the most recently updated info per player.
  const rows = await prisma.$queryRawUnsafe<Array<{
    canonical: string;
    name: string | null;
    photo: string | null;
    total: number;
    seasons: number;
    best_value: number;
    best_season_name: string | null;
    teams: string[];
  }>>(`
    WITH per_season AS (
      SELECT
        COALESCE(p."canonicalPlayerId", p.id) AS canonical,
        ps."seasonId",
        MAX(ps."${column}") AS value
      FROM "player_statistics" ps
      JOIN "players" p ON p.id = ps."playerId"
      ${sinceJoin}
      WHERE ps."${column}" IS NOT NULL AND ps."${column}" > 0${sinceFilter}
      GROUP BY canonical, ps."seasonId"
    )
    SELECT
      ps.canonical,
      (SELECT COALESCE(p2."nameHe", p2."nameEn") FROM "players" p2
       WHERE COALESCE(p2."canonicalPlayerId", p2.id) = ps.canonical
       ORDER BY p2."updatedAt" DESC LIMIT 1) AS name,
      (SELECT p3."photoUrl" FROM "players" p3
       WHERE COALESCE(p3."canonicalPlayerId", p3.id) = ps.canonical AND p3."photoUrl" IS NOT NULL
       ORDER BY p3."updatedAt" DESC LIMIT 1) AS photo,
      SUM(ps.value)::int AS total,
      COUNT(*)::int AS seasons,
      MAX(ps.value)::int AS best_value,
      (SELECT s.name FROM "seasons" s
       JOIN per_season ps2 ON ps2."seasonId" = s.id
       WHERE ps2.canonical = ps.canonical AND ps2.value = MAX(ps.value)
       LIMIT 1) AS best_season_name,
      (SELECT ARRAY_AGG(DISTINCT COALESCE(t."nameHe", t."nameEn"))
       FROM "players" p4 JOIN "teams" t ON t.id = p4."teamId"
       WHERE COALESCE(p4."canonicalPlayerId", p4.id) = ps.canonical) AS teams
    FROM per_season ps
    GROUP BY ps.canonical
    ORDER BY total DESC
    LIMIT $1
  `, limit);

  return rows.map((r, i) => ({
    rank: i + 1,
    canonicalId: r.canonical,
    displayName: r.name || '—',
    photoUrl: r.photo,
    total: r.total,
    seasons: r.seasons,
    bestSeason: r.best_value > 0 && r.best_season_name ? { seasonName: r.best_season_name, value: r.best_value } : null,
    teams: (r.teams || []).slice(0, 4),
  }));
}

// ── Walla historical (pre-2016) ─────────────────────────────────────────────
const WALLA_CATEGORY: Record<AllTimeCategory, string> = {
  TOP_SCORERS: 'goals',
  TOP_ASSISTS: 'assists',
  TOP_YELLOW_CARDS: 'yellowCards',
  TOP_RED_CARDS: 'redCards',
};

export interface WallaHistoricalEntry {
  rank: number;
  season: string;
  playerName: string;
  teamName: string;
  value: number;
}

export async function buildWallaHistorical(category: AllTimeCategory): Promise<WallaHistoricalEntry[]> {
  const wallaCat = WALLA_CATEGORY[category];
  const rows = await prisma.scrapedLeaderboard.findMany({
    where: { source: 'walla', category: wallaCat },
    orderBy: [{ season: 'desc' }, { rank: 'asc' }],
    select: { season: true, playerName: true, teamName: true, value: true, rank: true },
  });
  return rows.map((r) => ({
    rank: r.rank,
    season: r.season,
    playerName: r.playerName,
    teamName: r.teamName,
    value: Math.round(r.value),
  }));
}

// ── Unified leaderboard combining all sources ───────────────────────────────
export interface UnifiedEntry {
  rank: number;
  canonicalId: string | null;
  displayName: string;
  photoUrl: string | null;
  total: number;
  seasons: number;
  bestSeason: { seasonName: string; value: number } | null;
  teams: string[];
}

function normalizeName(name: string): string {
  return name.replace(/[.,'"]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Build a unified leaderboard combining PlayerStatistics (rich data) with the
 * Walla scrape (historical seasons). Walla entries are matched to canonical
 * players when the (Hebrew or English) name resolves; otherwise they appear
 * as text-only rows. The display table shows one unified ranking.
 */
export async function buildUnifiedLeaderboard(category: AllTimeCategory, limit = 100, sinceYear?: number): Promise<UnifiedEntry[]> {
  const psRows = await buildAllTimeLeaderboard(category, 500, sinceYear);

  const wallaCat = WALLA_CATEGORY[category];
  const wallaRows = await prisma.scrapedLeaderboard.findMany({
    where: {
      source: 'walla',
      category: wallaCat,
      ...(sinceYear ? { season: { gte: `${sinceYear}/` } } : {}),
    },
    orderBy: { season: 'desc' },
    select: { season: true, playerName: true, teamName: true, value: true },
  });

  // For Walla entries: try to match each playerName to a canonical Player so
  // we can merge into an existing PlayerStatistics entry rather than create a
  // duplicate text-only row.
  const allPlayers = await prisma.player.findMany({
    select: { id: true, nameHe: true, nameEn: true, canonicalPlayerId: true },
  });
  const byName = new Map<string, string>(); // normalized name → canonical id
  for (const p of allPlayers) {
    const canon = p.canonicalPlayerId ?? p.id;
    if (p.nameHe) byName.set(normalizeName(p.nameHe), canon);
    if (p.nameEn) byName.set(normalizeName(p.nameEn), canon);
  }

  // Index PlayerStatistics rows by canonical id for quick merge.
  const byCanonical = new Map<string, UnifiedEntry>();
  for (const r of psRows) {
    byCanonical.set(r.canonicalId, {
      rank: 0,
      canonicalId: r.canonicalId,
      displayName: r.displayName,
      photoUrl: r.photoUrl,
      total: r.total,
      seasons: r.seasons,
      bestSeason: r.bestSeason,
      teams: r.teams,
    });
  }

  // Index Walla entries — also handle text-only rows that don't resolve.
  type TextOnly = { displayName: string; total: number; seasons: Set<string>; best: { seasonName: string; value: number } | null; teams: Set<string> };
  const textOnly = new Map<string, TextOnly>();

  for (const w of wallaRows) {
    const value = Math.round(w.value);
    const canon = byName.get(normalizeName(w.playerName));
    if (canon && byCanonical.has(canon)) {
      // Already accounted for in PlayerStatistics era — skip (avoid double).
      continue;
    }
    if (canon) {
      // Player exists but had no PlayerStatistics row (pre-2016) — create unified entry.
      const existing = byCanonical.get(canon);
      const p = allPlayers.find((pp) => (pp.canonicalPlayerId ?? pp.id) === canon)!;
      const name = p.nameHe || p.nameEn;
      if (!existing) {
        byCanonical.set(canon, {
          rank: 0,
          canonicalId: canon,
          displayName: name,
          photoUrl: null,
          total: value,
          seasons: 1,
          bestSeason: { seasonName: w.season, value },
          teams: [w.teamName],
        });
      } else {
        existing.total += value;
        existing.seasons += 1;
        if (!existing.bestSeason || value > existing.bestSeason.value) existing.bestSeason = { seasonName: w.season, value };
        if (!existing.teams.includes(w.teamName)) existing.teams.push(w.teamName);
      }
    } else {
      // Text-only row.
      const key = normalizeName(w.playerName);
      let t = textOnly.get(key);
      if (!t) { t = { displayName: w.playerName, total: 0, seasons: new Set(), best: null, teams: new Set() }; textOnly.set(key, t); }
      t.total += value;
      t.seasons.add(w.season);
      if (!t.best || value > t.best.value) t.best = { seasonName: w.season, value };
      if (w.teamName) t.teams.add(w.teamName);
    }
  }

  const merged: UnifiedEntry[] = [
    ...byCanonical.values(),
    ...Array.from(textOnly.values()).map<UnifiedEntry>((t) => ({
      rank: 0,
      canonicalId: null,
      displayName: t.displayName,
      photoUrl: null,
      total: t.total,
      seasons: t.seasons.size,
      bestSeason: t.best,
      teams: Array.from(t.teams).slice(0, 4),
    })),
  ];

  merged.sort((a, b) => b.total - a.total);
  merged.forEach((e, i) => { e.rank = i + 1; });
  return merged.slice(0, limit);
}
