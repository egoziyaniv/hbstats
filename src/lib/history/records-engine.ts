import prisma from '@/lib/prisma';
import { getClubTeamIndex } from '@/lib/history/club-identity';

/**
 * Records engine — "ספר השיאים". Computation is split from I/O so the
 * interesting logic (margins, streaks, fastest goals, ages) is unit-testable
 * as pure functions over plain rows; loading (prisma) and writing
 * (RecordEntry upserts) live in the orchestrator below.
 */

const LIGAT_HAAL_ID = 'comp_liga_haal';
const LEAGUE_TOP = 10;
const CLUB_TOP = 5;
/** Minimum goals in one game to count as a "most goals in a game" record (hat-trick+). */
const HAT_TRICK_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EngineGame {
  id: string; homeClubKey: string; awayClubKey: string;
  homeScore: number; awayScore: number; dateTime: Date;
  homeName: string; awayName: string; competitionNameHe: string;
  /** Display override for the date part of detailHe — set when the stored
   *  dateTime is a placeholder (e.g. "עונת 1992/93" for Sep-1-dated 90s imports). */
  dateLabelHe?: string;
}
export interface EngineGoalEvent {
  eventId: string; gameId: string; minute: number; extraMinute: number | null;
  playerId: string; playerNameHe: string; playerBirthDate: Date | null;
  gameDateISO: string; homeName: string; awayName: string; competitionNameHe: string;
}
export interface ComputedRecord {
  valueNum: number; labelHe: string; detailHe: string | null;
  clubKey?: string | null; winnerClubKey?: string | null; playerId?: string | null;
  gameId?: string | null; seasonYear?: number | null; startISO?: string;
}

// ---------------------------------------------------------------------------
// Date helpers — UTC-based string splitting, never local Date getters
// (dateTime values are UTC midnight; local getters would shift the day in
// timezones behind UTC).
// ---------------------------------------------------------------------------

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** "D.M.YYYY" (no leading zeros) — the Hebrew display convention used across history pages. */
function formatHeDateFromISO(iso: string): string {
  const [y, m, day] = iso.slice(0, 10).split('-');
  return `${Number(day)}.${Number(m)}.${y}`;
}

function formatHeDate(d: Date): string {
  return formatHeDateFromISO(toIsoDate(d));
}

function daysBetweenUTC(from: Date, to: Date): number {
  const fromUTC = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toUTC = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((toUTC - fromUTC) / 86400000);
}

/** Full years + remaining days between two dates (both UTC-normalized). */
function ageYearsAndDays(birth: Date, at: Date): { years: number; days: number } {
  const by = birth.getUTCFullYear(), bm = birth.getUTCMonth(), bd = birth.getUTCDate();
  const ay = at.getUTCFullYear(), am = at.getUTCMonth(), ad = at.getUTCDate();
  let years = ay - by;
  let lastBirthday = Date.UTC(ay, bm, bd);
  if (lastBirthday > Date.UTC(ay, am, ad)) {
    years -= 1;
    lastBirthday = Date.UTC(ay - 1, bm, bd);
  }
  const days = Math.round((Date.UTC(ay, am, ad) - lastBirthday) / 86400000);
  return { years, days };
}

/** Date part of a game's detailHe — season label when the stored date is a placeholder. */
function gameDateLabel(game: EngineGame): string {
  return game.dateLabelHe ?? formatHeDate(game.dateTime);
}

const HEBREW_RE = /[֐-׿]/;

/** Strip import-disambiguation suffixes like "Beitar Jerusalem(1)" / "Hapoel Ramla(x)". */
function stripDisambiguationSuffix(name: string): string {
  return name.replace(/\s*\((?:\d+|[A-Za-z])\)\s*$/, '');
}

/** "עונת 1992/93" — display label for a season year. */
function seasonLabelHe(year: number): string {
  return `עונת ${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

/**
 * Seasons whose game dates can be trusted for ordering. A season is UNRELIABLE
 * when more than half of its games share one exact dateTime — the hallmark of
 * placeholder-dated imports (the 1991-1999 seasons are 100% Sep-1). Streaks
 * are only computed over reliable seasons: within an unreliable season the
 * "chronological" order is random, so any streak found there is an artifact.
 */
export function findReliableSeasonYears(games: Array<{ seasonYear: number; dateTime: Date }>): Set<number> {
  const dateCounts = new Map<number, Map<number, number>>(); // year → timestamp → count
  const totals = new Map<number, number>();
  for (const game of games) {
    const ts = game.dateTime.getTime();
    let counts = dateCounts.get(game.seasonYear);
    if (!counts) { counts = new Map(); dateCounts.set(game.seasonYear, counts); }
    counts.set(ts, (counts.get(ts) ?? 0) + 1);
    totals.set(game.seasonYear, (totals.get(game.seasonYear) ?? 0) + 1);
  }
  const reliable = new Set<number>();
  for (const [year, counts] of dateCounts) {
    const total = totals.get(year)!;
    const maxShared = Math.max(...counts.values());
    if (maxShared / total <= 0.5) reliable.add(year);
  }
  return reliable;
}

// ---------------------------------------------------------------------------
// Pure computations (unit-tested)
// ---------------------------------------------------------------------------

/** Biggest wins by margin; ties broken by more total goals, then earlier date. */
export function computeBiggestWins(games: EngineGame[], top: number): ComputedRecord[] {
  const decisive = games.filter((g) => g.homeScore !== g.awayScore);
  const sorted = [...decisive].sort((a, b) => {
    const marginA = Math.abs(a.homeScore - a.awayScore);
    const marginB = Math.abs(b.homeScore - b.awayScore);
    if (marginB !== marginA) return marginB - marginA;
    const totalA = a.homeScore + a.awayScore;
    const totalB = b.homeScore + b.awayScore;
    if (totalB !== totalA) return totalB - totalA;
    return a.dateTime.getTime() - b.dateTime.getTime();
  });
  return sorted.slice(0, top).map((game) => {
    const margin = Math.abs(game.homeScore - game.awayScore);
    const winnerClubKey = game.homeScore > game.awayScore ? game.homeClubKey : game.awayClubKey;
    return {
      valueNum: margin,
      labelHe: `${game.homeName} ${game.homeScore}–${game.awayScore} ${game.awayName}`,
      detailHe: `${game.competitionNameHe} · ${gameDateLabel(game)}`,
      winnerClubKey,
      gameId: game.id,
    };
  });
}

/** Highest-scoring games by total goals; ties broken by margin, then earlier date. */
export function computeHighestScoringGames(games: EngineGame[], top: number): ComputedRecord[] {
  const sorted = [...games].sort((a, b) => {
    const totalA = a.homeScore + a.awayScore;
    const totalB = b.homeScore + b.awayScore;
    if (totalB !== totalA) return totalB - totalA;
    const marginA = Math.abs(a.homeScore - a.awayScore);
    const marginB = Math.abs(b.homeScore - b.awayScore);
    if (marginB !== marginA) return marginB - marginA;
    return a.dateTime.getTime() - b.dateTime.getTime();
  });
  return sorted.slice(0, top).map((game) => ({
    valueNum: game.homeScore + game.awayScore,
    labelHe: `${game.homeName} ${game.homeScore}–${game.awayScore} ${game.awayName}`,
    detailHe: `${game.competitionNameHe} · ${gameDateLabel(game)}`,
    gameId: game.id,
  }));
}

interface StreakRun { clubKey: string; length: number; startISO: string; endISO: string }

/** Per-club chronological walk collecting every completed run of the given kind (one pass per club). */
function collectStreakRuns(games: EngineGame[], kind: 'win' | 'unbeaten' | 'scoring'): StreakRun[] {
  const byClub = new Map<string, EngineGame[]>();
  for (const game of games) {
    for (const clubKey of [game.homeClubKey, game.awayClubKey]) {
      if (!byClub.has(clubKey)) byClub.set(clubKey, []);
      byClub.get(clubKey)!.push(game);
    }
  }

  const runs: StreakRun[] = [];
  for (const [clubKey, clubGames] of byClub) {
    const sorted = [...clubGames].sort((a, b) => a.dateTime.getTime() - b.dateTime.getTime());
    let runLength = 0;
    let runStart = '';
    let lastDate = '';
    const flush = () => {
      if (runLength > 0) runs.push({ clubKey, length: runLength, startISO: runStart, endISO: lastDate });
      runLength = 0;
    };
    for (const game of sorted) {
      const isHome = game.homeClubKey === clubKey;
      const gf = isHome ? game.homeScore : game.awayScore;
      const ga = isHome ? game.awayScore : game.homeScore;
      const dateISO = toIsoDate(game.dateTime);
      const continues = kind === 'win' ? gf > ga : kind === 'unbeaten' ? gf >= ga : gf > 0;
      if (continues) {
        if (runLength === 0) runStart = dateISO;
        runLength += 1;
        lastDate = dateISO;
      } else {
        flush();
      }
    }
    flush();
  }
  return runs;
}

const STREAK_LABEL_HE: Record<'win' | 'unbeaten' | 'scoring', string> = {
  win: 'נצחונות רצופים',
  unbeaten: 'משחקים ללא הפסד ברצף',
  scoring: 'משחקים רצופים עם הבקעה',
};

/** Longest streaks (win / unbeaten / scoring) — every completed run across all clubs, ranked. */
export function computeStreaks(games: EngineGame[], kind: 'win' | 'unbeaten' | 'scoring', top: number): ComputedRecord[] {
  const runs = collectStreakRuns(games, kind);
  runs.sort((a, b) => b.length - a.length || a.startISO.localeCompare(b.startISO));
  return runs.slice(0, top).map((run) => ({
    valueNum: run.length,
    clubKey: run.clubKey,
    labelHe: `${run.length} ${STREAK_LABEL_HE[kind]}`,
    detailHe: `מ-${formatHeDateFromISO(run.startISO)} עד ${formatHeDateFromISO(run.endISO)}`,
    startISO: run.startISO,
  }));
}

/** Fastest goals — ascending by raw match-clock minute (extra-time markers don't affect ranking).
 *  Minute-0 rows are dropped — legitimate goals are recorded as minute 1+; 0 is feed noise. */
export function computeFastestGoals(events: EngineGoalEvent[], top: number): ComputedRecord[] {
  const sorted = events
    .filter((e) => e.minute >= 1)
    .sort((a, b) => a.minute - b.minute || a.gameDateISO.localeCompare(b.gameDateISO));
  return sorted.slice(0, top).map((ev) => {
    const minuteLabel = ev.extraMinute ? `${ev.minute}+${ev.extraMinute}` : `${ev.minute}`;
    return {
      valueNum: ev.minute,
      playerId: ev.playerId,
      gameId: ev.gameId,
      labelHe: `${ev.playerNameHe} — שער בדקה ${minuteLabel}׳`,
      detailHe: `${ev.competitionNameHe} · ${ev.homeName} נגד ${ev.awayName} · ${formatHeDateFromISO(ev.gameDateISO)}`,
    };
  });
}

/** Most goals by one player in one game — hat-trick (3+) threshold. */
export function computePlayerGameGoals(events: EngineGoalEvent[], top: number): ComputedRecord[] {
  const byKey = new Map<string, EngineGoalEvent[]>();
  for (const ev of events) {
    const key = `${ev.playerId}::${ev.gameId}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(ev);
  }

  const groups = [...byKey.values()].filter((group) => group.length >= HAT_TRICK_THRESHOLD);
  groups.sort((a, b) => b.length - a.length || a[0].gameDateISO.localeCompare(b[0].gameDateISO));

  return groups.slice(0, top).map((group) => {
    const first = group[0];
    return {
      valueNum: group.length,
      playerId: first.playerId,
      gameId: first.gameId,
      labelHe: `${first.playerNameHe} — ${group.length} שערים במשחק אחד`,
      detailHe: `${first.competitionNameHe} · ${first.homeName} נגד ${first.awayName} · ${formatHeDateFromISO(first.gameDateISO)}`,
    };
  });
}

/** Youngest/oldest scorer — one row per player (their most extreme instance), ranked by age in days. */
export function computeAgeExtremes(events: EngineGoalEvent[], kind: 'youngest' | 'oldest', top: number): ComputedRecord[] {
  const withAge = events
    .filter((ev): ev is EngineGoalEvent & { playerBirthDate: Date } => ev.playerBirthDate != null)
    .map((ev) => {
      const gameDate = new Date(ev.gameDateISO);
      return { ev, gameDate, totalDays: daysBetweenUTC(ev.playerBirthDate, gameDate) };
    });

  const byPlayer = new Map<string, (typeof withAge)[number]>();
  for (const item of withAge) {
    const existing = byPlayer.get(item.ev.playerId);
    if (!existing) { byPlayer.set(item.ev.playerId, item); continue; }
    const better = kind === 'youngest' ? item.totalDays < existing.totalDays : item.totalDays > existing.totalDays;
    if (better) byPlayer.set(item.ev.playerId, item);
  }

  const list = [...byPlayer.values()].sort((a, b) => (kind === 'youngest' ? a.totalDays - b.totalDays : b.totalDays - a.totalDays));
  const kindWordHe = kind === 'youngest' ? 'הכובש הצעיר ביותר' : 'הכובש המבוגר ביותר';

  return list.slice(0, top).map(({ ev, gameDate, totalDays }) => {
    const { years, days } = ageYearsAndDays(ev.playerBirthDate, gameDate);
    return {
      valueNum: totalDays,
      playerId: ev.playerId,
      gameId: ev.gameId,
      labelHe: `${ev.playerNameHe} — ${kindWordHe} (בן ${years} ו-${days} ימים)`,
      detailHe: `${ev.competitionNameHe} · ${ev.homeName} נגד ${ev.awayName} · ${formatHeDateFromISO(ev.gameDateISO)}`,
    };
  });
}

// ---------------------------------------------------------------------------
// Orchestrator (prisma-facing; validated by the dev-DB probe, not unit-tested)
// ---------------------------------------------------------------------------

/** `ordered` — the category depends on within-season game ordering, so it only
 *  covers reliably-dated seasons (pages render a coverage footnote, like eventBased). */
export const RECORD_CATEGORIES: Array<{ key: string; titleHe: string; eventBased: boolean; ordered: boolean }> = [
  { key: 'biggest_win', titleHe: 'הניצחון הגדול ביותר', eventBased: false, ordered: false },
  { key: 'highest_scoring_game', titleHe: 'המשחק העשיר בשערים', eventBased: false, ordered: false },
  { key: 'longest_win_streak', titleHe: 'רצף הניצחונות הארוך ביותר', eventBased: false, ordered: true },
  { key: 'longest_unbeaten_streak', titleHe: 'הרצף הארוך ביותר ללא הפסד', eventBased: false, ordered: true },
  { key: 'longest_scoring_streak', titleHe: 'הרצף הארוך ביותר עם הבקעה', eventBased: false, ordered: true },
  { key: 'fastest_goal', titleHe: 'השער המהיר ביותר', eventBased: true, ordered: false },
  { key: 'most_goals_player_game', titleHe: 'הכי הרבה שערים במשחק אחד', eventBased: true, ordered: false },
  { key: 'youngest_scorer', titleHe: 'הכובש הצעיר ביותר', eventBased: true, ordered: false },
  { key: 'oldest_scorer', titleHe: 'הכובש המבוגר ביותר', eventBased: true, ordered: false },
];

async function loadLeagueGames(): Promise<{
  games: EngineGame[];
  seasonYearByGameId: Map<string, number>;
  reliableSeasonYears: Set<number>;
  clubNameByKey: Map<string, string>;
  skipped: number;
}> {
  const rows = await prisma.game.findMany({
    where: {
      competitionId: LIGAT_HAAL_ID,
      status: 'COMPLETED',
      homeScore: { not: null },
      awayScore: { not: null },
    },
    select: {
      id: true,
      dateTime: true,
      homeScore: true,
      awayScore: true,
      homeTeamId: true,
      awayTeamId: true,
      season: { select: { year: true } },
      homeTeam: { select: { nameHe: true } },
      awayTeam: { select: { nameHe: true } },
      competition: { select: { nameHe: true } },
    },
  });

  const reliableSeasonYears = findReliableSeasonYears(
    rows.map((r) => ({ seasonYear: r.season.year, dateTime: r.dateTime })),
  );

  const clubIndex = await getClubTeamIndex();
  const games: EngineGame[] = [];
  const seasonYearByGameId = new Map<string, number>();
  const clubNameByKey = new Map<string, string>();
  let skipped = 0;

  // Prefer the club family's (current) Hebrew name over the raw per-season row
  // name — but only when the family actually has a Hebrew name; either way,
  // strip import-disambiguation suffixes like "(1)"/"(x)".
  const displayName = (familyNameHe: string, rawNameHe: string) =>
    stripDisambiguationSuffix(HEBREW_RE.test(familyNameHe) ? familyNameHe : rawNameHe);

  for (const row of rows) {
    const homeFamily = clubIndex.get(row.homeTeamId);
    const awayFamily = clubIndex.get(row.awayTeamId);
    if (!homeFamily || !awayFamily) { skipped += 1; continue; }
    const year = row.season.year;
    games.push({
      id: row.id,
      homeClubKey: homeFamily.clubKey,
      awayClubKey: awayFamily.clubKey,
      homeScore: row.homeScore as number,
      awayScore: row.awayScore as number,
      dateTime: row.dateTime,
      homeName: displayName(homeFamily.nameHe, row.homeTeam.nameHe),
      awayName: displayName(awayFamily.nameHe, row.awayTeam.nameHe),
      competitionNameHe: row.competition?.nameHe ?? 'ליגת העל',
      // placeholder-dated seasons: show the season instead of the fake date
      ...(reliableSeasonYears.has(year) ? {} : { dateLabelHe: seasonLabelHe(year) }),
    });
    seasonYearByGameId.set(row.id, year);
    clubNameByKey.set(homeFamily.clubKey, homeFamily.nameHe);
    clubNameByKey.set(awayFamily.clubKey, awayFamily.nameHe);
  }

  return { games, seasonYearByGameId, reliableSeasonYears, clubNameByKey, skipped };
}

async function loadGoalEvents(): Promise<EngineGoalEvent[]> {
  const rows = await prisma.gameEvent.findMany({
    where: {
      type: { in: ['GOAL', 'PENALTY_GOAL'] },
      playerId: { not: null },
      game: { competitionId: LIGAT_HAAL_ID, status: 'COMPLETED' },
    },
    select: {
      id: true,
      minute: true,
      extraMinute: true,
      playerId: true,
      gameId: true,
      player: { select: { nameHe: true, birthDate: true } },
      game: {
        select: {
          dateTime: true,
          homeTeam: { select: { nameHe: true } },
          awayTeam: { select: { nameHe: true } },
          competition: { select: { nameHe: true } },
        },
      },
    },
  });

  return rows.map((row) => ({
    eventId: row.id,
    gameId: row.gameId,
    minute: row.minute,
    extraMinute: row.extraMinute,
    playerId: row.playerId as string,
    playerNameHe: row.player?.nameHe ?? '',
    playerBirthDate: row.player?.birthDate ?? null,
    gameDateISO: toIsoDate(row.game.dateTime),
    homeName: row.game.homeTeam.nameHe,
    awayName: row.game.awayTeam.nameHe,
    competitionNameHe: row.game.competition?.nameHe ?? 'ליגת העל',
  }));
}

interface RecordEntryRow {
  category: string; scope: string; rank: number; valueNum: number | null;
  labelHe: string; detailHe: string | null; clubKey: string | null;
  playerId: string | null; gameId: string | null; seasonYear: number | null;
}

function rowsFromRecords(
  category: string,
  scope: string,
  records: ComputedRecord[],
  seasonYearByGameId?: Map<string, number>,
): RecordEntryRow[] {
  return records.map((rec, i) => ({
    category,
    scope,
    rank: i + 1,
    valueNum: rec.valueNum,
    labelHe: rec.labelHe,
    detailHe: rec.detailHe,
    clubKey: rec.clubKey ?? rec.winnerClubKey ?? null,
    playerId: rec.playerId ?? null,
    gameId: rec.gameId ?? null,
    seasonYear: rec.seasonYear ?? (rec.gameId ? seasonYearByGameId?.get(rec.gameId) ?? null : null),
  }));
}

export async function rebuildAllRecords(): Promise<{ written: number; byCategory: Record<string, number> }> {
  const [{ games, seasonYearByGameId, reliableSeasonYears, clubNameByKey, skipped }, events] =
    await Promise.all([loadLeagueGames(), loadGoalEvents()]);

  if (skipped > 0) {
    console.warn(`[records-engine] skipped ${skipped} league game(s) with unresolvable club identity`);
  }

  // Streaks need trustworthy within-season ordering — exclude placeholder-dated
  // seasons WHOLE (never drop games mid-timeline: a run must not bridge a gap).
  const streakGames = games.filter((g) => reliableSeasonYears.has(seasonYearByGameId.get(g.id)!));
  const unreliableCount = games.length - streakGames.length;
  if (unreliableCount > 0) {
    console.warn(`[records-engine] excluded ${unreliableCount} game(s) from placeholder-dated seasons from streak computation`);
  }

  // Club scopes only for families with a real Hebrew name — latin-only
  // singleton families from the pre-2006 import are phantom duplicates.
  const clubKeys = new Set<string>();
  let phantomClubs = 0;
  for (const [clubKey, familyNameHe] of clubNameByKey) {
    if (HEBREW_RE.test(familyNameHe)) clubKeys.add(clubKey);
    else phantomClubs += 1;
  }
  if (phantomClubs > 0) {
    console.warn(`[records-engine] skipped club scopes for ${phantomClubs} phantom (non-Hebrew-named) club families`);
  }

  const byCategory: Record<string, number> = {};
  let written = 0;

  const writeCategory = async (category: string, rows: RecordEntryRow[]) => {
    await prisma.$transaction([
      prisma.recordEntry.deleteMany({ where: { category } }),
      prisma.recordEntry.createMany({ data: rows }),
    ]);
    byCategory[category] = rows.length;
    written += rows.length;
  };

  const byClub = (pool: EngineGame[], clubKey: string) =>
    pool.filter((g) => g.homeClubKey === clubKey || g.awayClubKey === clubKey);

  // biggest_win — league + club (club scope = biggest win BY that club)
  {
    const rows = rowsFromRecords('biggest_win', 'league', computeBiggestWins(games, LEAGUE_TOP), seasonYearByGameId);
    for (const clubKey of clubKeys) {
      const clubWins = computeBiggestWins(byClub(games, clubKey), Number.POSITIVE_INFINITY)
        .filter((r) => r.winnerClubKey === clubKey)
        .slice(0, CLUB_TOP);
      rows.push(...rowsFromRecords('biggest_win', `club:${clubKey}`, clubWins, seasonYearByGameId));
    }
    await writeCategory('biggest_win', rows);
  }

  // highest_scoring_game — league + club (club scope = richest games INVOLVING the club)
  {
    const rows = rowsFromRecords('highest_scoring_game', 'league', computeHighestScoringGames(games, LEAGUE_TOP), seasonYearByGameId);
    for (const clubKey of clubKeys) {
      const clubGames = computeHighestScoringGames(byClub(games, clubKey), CLUB_TOP);
      rows.push(...rowsFromRecords('highest_scoring_game', `club:${clubKey}`, clubGames, seasonYearByGameId));
    }
    await writeCategory('highest_scoring_game', rows);
  }

  // streak categories — league + club, reliable-season games only
  const streakCategories: Array<{ key: string; kind: 'win' | 'unbeaten' | 'scoring' }> = [
    { key: 'longest_win_streak', kind: 'win' },
    { key: 'longest_unbeaten_streak', kind: 'unbeaten' },
    { key: 'longest_scoring_streak', kind: 'scoring' },
  ];
  for (const { key, kind } of streakCategories) {
    const rows = rowsFromRecords(key, 'league', computeStreaks(streakGames, kind, LEAGUE_TOP));
    for (const clubKey of clubKeys) {
      // top=Infinity: the pool contains the opponents' runs too — a finite top
      // could truncate this club's runs before the clubKey filter.
      const clubStreaks = computeStreaks(byClub(streakGames, clubKey), kind, Number.POSITIVE_INFINITY)
        .filter((r) => r.clubKey === clubKey)
        .slice(0, CLUB_TOP);
      rows.push(...rowsFromRecords(key, `club:${clubKey}`, clubStreaks));
    }
    await writeCategory(key, rows);
  }

  // event-based categories — league only (2006+ data; pages render the "מ-2006" footnote via eventBased)
  await writeCategory('fastest_goal', rowsFromRecords('fastest_goal', 'league', computeFastestGoals(events, LEAGUE_TOP)));
  await writeCategory(
    'most_goals_player_game',
    rowsFromRecords('most_goals_player_game', 'league', computePlayerGameGoals(events, LEAGUE_TOP)),
  );
  await writeCategory(
    'youngest_scorer',
    rowsFromRecords('youngest_scorer', 'league', computeAgeExtremes(events, 'youngest', LEAGUE_TOP)),
  );
  await writeCategory(
    'oldest_scorer',
    rowsFromRecords('oldest_scorer', 'league', computeAgeExtremes(events, 'oldest', LEAGUE_TOP)),
  );

  return { written, byCategory };
}
