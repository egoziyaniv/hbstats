/**
 * player-trophies.ts — assemble a player's trophy cabinet.
 *
 * Combines two sources:
 *   1. PlayerTrophy table (API-Football scrape) — international + many
 *      Israeli wins, but no Hebrew labels and sometimes missing recent
 *      seasons.
 *   2. Standing data — for each season the player appeared in an Israeli team,
 *      check if that team finished 1st in Ligat HaAl (championship trophy) or
 *      won/lost the State Cup final. These rows are merged with PlayerTrophy
 *      and dedupes by (league, country, season, place).
 *
 * Output: TrophyGroup[] grouped by (league + country) with wins/runnerUps
 * counts and per-trophy season-team detail for richer display.
 */
import prisma from '@/lib/prisma';

const HE_LEAGUE_NAMES: Record<string, string> = {
  "Ligat Ha'al": 'ליגת העל',
  'Ligat HaAl': 'ליגת העל',
  'Premier League': 'ליגת העל',
  'State Cup': 'גביע המדינה',
  'Super Cup': 'אלוף האלופים',
  'Toto Cup Ligat Al': 'גביע הטוטו ליגת העל',
  'Toto Cup': 'גביע הטוטו',
  'Liga Leumit': 'הליגה הלאומית',
  'National League': 'הליגה הלאומית',
  'First League': 'ליגה ראשונה',
  '1. Division': 'ליגה ראשונה',
};
const HE_COUNTRY: Record<string, string> = {
  Israel: 'ישראל',
  Bulgaria: 'בולגריה',
  Italy: 'איטליה',
  Spain: 'ספרד',
  England: 'אנגליה',
  Germany: 'גרמניה',
};

function localizeLeague(name: string): string {
  return HE_LEAGUE_NAMES[name] || name;
}
function localizeCountry(name: string | null): string | null {
  if (!name) return null;
  return HE_COUNTRY[name] || name;
}

function placeKind(placeEn: string | null, placeHe: string | null): 'win' | 'runner-up' | 'other' {
  const v = (placeEn || placeHe || '').toLowerCase();
  if (v.includes('winner') || v.includes('1st') || v.includes('זוכ')) return 'win';
  if (v.includes('runner') || v.includes('2nd') || v.includes('סגן')) return 'runner-up';
  return 'other';
}

// Two sources of season labels emit different formats for the same trophy:
//   API-Football → "2025" (single-year cups) or "2024/2025" (full leagues)
//   Standing-derivation → "2024/25" (our local Season.name)
// Dedup by start year so a Super Cup logged twice (once per source) collapses
// to one row, then pick the prettiest label to display.
function seasonStartYear(label: string): number | null {
  const m = label.match(/^(\d{4})/);
  return m ? parseInt(m[1], 10) : null;
}
function seasonScore(label: string): number {
  if (/^\d{4}\/\d{2}$/.test(label)) return 3;       // "2024/25"
  if (/^\d{4}[\/\-]\d{4}$/.test(label)) return 2;   // "2024/2025" or "2024-2025"
  if (/^\d{4}$/.test(label)) return 1;              // "2024"
  return 0;
}

export interface TrophyDetail {
  seasonLabel: string;
  kind: 'win' | 'runner-up';
  teamName: string | null;
}

export interface TrophyGroup {
  leagueNameHe: string;
  countryHe: string | null;
  countryEn: string | null;
  wins: number;
  runnerUps: number;
  seasonsWon: string[];
  details: TrophyDetail[]; // chronological, newest first
}

export async function buildPlayerTrophies(playerId: string): Promise<TrophyGroup[]> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, canonicalPlayerId: true, apiFootballId: true, nameHe: true, nameEn: true },
  });
  if (!player) return [];
  const canonicalKey = player.canonicalPlayerId ?? player.id;

  const linked = await prisma.player.findMany({
    where: { OR: [{ id: canonicalKey }, { canonicalPlayerId: canonicalKey }] },
    select: { id: true, apiFootballId: true, teamId: true, team: { select: { nameHe: true, nameEn: true, seasonId: true, season: { select: { name: true, year: true } } } } },
  });
  const linkedIds = linked.map((l) => l.id);
  const apiIds = linked.map((l) => l.apiFootballId).filter((v): v is number => typeof v === 'number');

  // Build (seasonYear → team) map so derived trophies can be tagged.
  const teamBySeason = new Map<number, { teamNameHe: string; teamNameEn: string }>();
  for (const l of linked) {
    if (!l.team?.season) continue;
    teamBySeason.set(l.team.season.year, { teamNameHe: l.team.nameHe, teamNameEn: l.team.nameEn });
  }

  // 1. API-Football trophies.
  const rawRows = await prisma.playerTrophy.findMany({
    where: {
      OR: [
        ...(linkedIds.length > 0 ? [{ playerId: { in: linkedIds } }] : []),
        ...(apiIds.length > 0 ? [{ apiFootballPlayerId: { in: apiIds } }] : []),
      ],
    },
    select: {
      leagueNameHe: true, leagueNameEn: true, countryHe: true, countryEn: true,
      seasonLabel: true, placeHe: true, placeEn: true,
    },
  });

  // 2. Derive Israeli championships from Standing data — for each canonical
  //    player's team, check if they finished 1st or 2nd in liga_haal or won
  //    the state cup final, and emit a synthetic trophy row.
  const derivedTrophies = await deriveIsraeliTrophies(linked);

  // Dedupe: bucket by (league, country, startYear, placeKind). Multiple
  // variants of the same trophy collapse to one row whose seasonLabel is the
  // prettiest of the bunch and whose teamNameHe is preserved from whichever
  // variant happened to carry it.
  type Row = {
    leagueEn: string; leagueHe: string | null;
    countryEn: string | null; countryHe: string | null;
    seasonLabel: string; kind: 'win' | 'runner-up' | 'other';
    teamNameHe: string | null;
  };
  const buckets = new Map<string, Row>();
  function push(r: { leagueEn: string; leagueHe?: string | null; countryEn: string | null; countryHe?: string | null; seasonLabel: string; kind: 'win' | 'runner-up' | 'other'; teamNameHe?: string | null }) {
    const startYear = seasonStartYear(r.seasonLabel);
    const key = `${r.leagueEn}|${r.countryEn || ''}|${startYear ?? r.seasonLabel}|${r.kind}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        leagueEn: r.leagueEn, leagueHe: r.leagueHe || null,
        countryEn: r.countryEn, countryHe: r.countryHe || null,
        seasonLabel: r.seasonLabel, kind: r.kind, teamNameHe: r.teamNameHe || null,
      });
      return;
    }
    if (seasonScore(r.seasonLabel) > seasonScore(existing.seasonLabel)) {
      existing.seasonLabel = r.seasonLabel;
      existing.leagueHe = r.leagueHe || existing.leagueHe;
      existing.countryHe = r.countryHe || existing.countryHe;
    }
    existing.teamNameHe = existing.teamNameHe || r.teamNameHe || null;
  }
  const allRows: Row[] = [];

  for (const t of rawRows) {
    if (!t.seasonLabel) continue;
    push({
      leagueEn: t.leagueNameEn, leagueHe: t.leagueNameHe,
      countryEn: t.countryEn, countryHe: t.countryHe,
      seasonLabel: t.seasonLabel,
      kind: placeKind(t.placeEn, t.placeHe),
    });
  }
  for (const d of derivedTrophies) push(d);
  allRows.push(...buckets.values());

  // Group by league + country.
  const groups = new Map<string, TrophyGroup>();
  for (const r of allRows) {
    if (r.kind === 'other') continue; // ignore unclassified
    const groupKey = `${r.leagueEn}|${r.countryEn || ''}`;
    const leagueHe = localizeLeague(r.leagueHe || r.leagueEn);
    let g = groups.get(groupKey);
    if (!g) {
      g = {
        leagueNameHe: leagueHe,
        countryHe: localizeCountry(r.countryEn) || r.countryHe,
        countryEn: r.countryEn,
        wins: 0, runnerUps: 0, seasonsWon: [], details: [],
      };
      groups.set(groupKey, g);
    }
    if (r.kind === 'win') { g.wins++; g.seasonsWon.push(r.seasonLabel); }
    else if (r.kind === 'runner-up') g.runnerUps++;
    g.details.push({ seasonLabel: r.seasonLabel, kind: r.kind, teamName: r.teamNameHe });
  }

  // Sort details by season newest-first within each group.
  for (const g of groups.values()) {
    g.details.sort((a, b) => b.seasonLabel.localeCompare(a.seasonLabel));
    g.seasonsWon.sort((a, b) => b.localeCompare(a));
  }
  return Array.from(groups.values()).sort((a, b) => (b.wins + b.runnerUps) - (a.wins + a.runnerUps));
}

async function deriveIsraeliTrophies(linked: Array<{ teamId: string; team: { nameHe: string; nameEn: string; seasonId: string; season: { name: string; year: number } } | null }>) {
  const out: Array<{ leagueEn: string; leagueHe: string; countryEn: string; countryHe: string; seasonLabel: string; kind: 'win' | 'runner-up'; teamNameHe: string }> = [];
  for (const l of linked) {
    if (!l.team) continue;
    const teamId = l.teamId;
    const seasonId = l.team.seasonId;
    const seasonLabel = l.team.season.name;
    const teamNameHe = l.team.nameHe || l.team.nameEn;

    // Liga Ha'al final standing: check for any standing with position 1 or 2.
    const standings = await prisma.standing.findMany({
      where: { teamId, seasonId, competitionId: 'comp_liga_haal' },
      select: { position: true, groupNameEn: true },
    });
    for (const s of standings) {
      const isChampGroup = /championship/i.test(s.groupNameEn || '');
      if (isChampGroup || !s.groupNameEn) {
        if (s.position === 1) out.push({ leagueEn: "Ligat Ha'al", leagueHe: 'ליגת העל', countryEn: 'Israel', countryHe: 'ישראל', seasonLabel, kind: 'win', teamNameHe });
        else if (s.position === 2) out.push({ leagueEn: "Ligat Ha'al", leagueHe: 'ליגת העל', countryEn: 'Israel', countryHe: 'ישראל', seasonLabel, kind: 'runner-up', teamNameHe });
      }
    }

    // State Cup: did the team play in the final? Was it a win or loss?
    const cupFinal = await prisma.game.findFirst({
      where: {
        seasonId,
        competition: { nameEn: { contains: 'State Cup' } },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        roundNameEn: { contains: 'Final' },
        status: 'COMPLETED',
      },
      select: { homeTeamId: true, homeScore: true, awayScore: true },
    });
    if (cupFinal && cupFinal.homeScore != null && cupFinal.awayScore != null) {
      const isHome = cupFinal.homeTeamId === teamId;
      const our = isHome ? cupFinal.homeScore : cupFinal.awayScore;
      const their = isHome ? cupFinal.awayScore : cupFinal.homeScore;
      if (our > their) out.push({ leagueEn: 'State Cup', leagueHe: 'גביע המדינה', countryEn: 'Israel', countryHe: 'ישראל', seasonLabel, kind: 'win', teamNameHe });
      else if (our < their) out.push({ leagueEn: 'State Cup', leagueHe: 'גביע המדינה', countryEn: 'Israel', countryHe: 'ישראל', seasonLabel, kind: 'runner-up', teamNameHe });
    }

    // Super Cup result.
    const superCup = await prisma.game.findFirst({
      where: {
        seasonId,
        competition: { nameEn: { contains: 'Super Cup' } },
        OR: [{ homeTeamId: teamId }, { awayTeamId: teamId }],
        status: 'COMPLETED',
      },
      select: { homeTeamId: true, homeScore: true, awayScore: true },
    });
    if (superCup && superCup.homeScore != null && superCup.awayScore != null) {
      const isHome = superCup.homeTeamId === teamId;
      const our = isHome ? superCup.homeScore : superCup.awayScore;
      const their = isHome ? superCup.awayScore : superCup.homeScore;
      if (our > their) out.push({ leagueEn: 'Super Cup', leagueHe: 'אלוף האלופים', countryEn: 'Israel', countryHe: 'ישראל', seasonLabel, kind: 'win', teamNameHe });
      else if (our < their) out.push({ leagueEn: 'Super Cup', leagueHe: 'אלוף האלופים', countryEn: 'Israel', countryHe: 'ישראל', seasonLabel, kind: 'runner-up', teamNameHe });
    }
  }
  return out;
}
