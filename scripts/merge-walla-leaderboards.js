/**
 * Merge Walla full player stats into CompetitionLeaderboardEntry.
 * Maps: goals_full → TOP_SCORERS, assists_full → TOP_ASSISTS, etc.
 *
 * Run: node scripts/merge-walla-leaderboards.js [--season "2002/2003"]
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIGA_HAAL_API_ID = 383;

const CATEGORY_MAP = {
  goals_full: 'TOP_SCORERS',
  assists_full: 'TOP_ASSISTS',
  yellowCards_full: 'TOP_YELLOW_CARDS',
  redCards_full: 'TOP_RED_CARDS',
  substitutedIn_full: 'TOP_SUBSTITUTED_IN',
  substitutedOut_full: 'TOP_SUBSTITUTED_OUT',
  // Compact per-season top lists (scrape-walla.js writes these without _full,
  // Ligat Ha'al only — Leumit rows use a `_leumit` suffix and don't match here).
  goals: 'TOP_SCORERS',
  assists: 'TOP_ASSISTS',
  yellowCards: 'TOP_YELLOW_CARDS',
  redCards: 'TOP_RED_CARDS',
  substitutedIn: 'TOP_SUBSTITUTED_IN',
  substitutedOut: 'TOP_SUBSTITUTED_OUT',
};

function norm(n) {
  return n.replace(/['"״׳\-\.`']/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const NAME_MAP = {
  'עירוני קרית שמונה': 'עירוני קריית שמונה',
  'מכבי פתח תקוה': 'מכבי פתח תקווה',
  'הפועל פתח תקוה': 'הפועל פתח תקווה',
  'בני יהודה תל-אביב': 'בני יהודה',
};

function resolveTeamName(name) { return NAME_MAP[name] || name; }

function findTeam(teams, wallaName) {
  const resolved = resolveTeamName(wallaName);
  return teams.find((t) => {
    const tn = norm(t.nameHe);
    const wn = norm(resolved);
    return tn === wn || tn.includes(wn) || wn.includes(tn);
  });
}

async function main() {
  const targetSeason = process.argv.find((a, i) => process.argv[i - 1] === '--season');

  const competition = await prisma.competition.findFirst({ where: { apiFootballId: LIGA_HAAL_API_ID } });
  if (!competition) { console.log('Competition not found!'); return; }

  // Filter by the known category keys (CATEGORY_MAP) rather than `endsWith('_full')`
  // so the compact per-season lists merge too, while `_leumit`-suffixed rows
  // (a different competition) stay excluded since they aren't in the map.
  const where = { source: 'walla', category: { in: Object.keys(CATEGORY_MAP) } };
  if (targetSeason) where.season = targetSeason;

  // category DESC so 'X_full' (complete lists) merges before compact 'X' — the
  // existing-row skip then lets compact lists only fill seasons lacking a _full one.
  const scraped = await prisma.scrapedLeaderboard.findMany({ where, orderBy: [{ season: 'asc' }, { category: 'desc' }, { rank: 'asc' }] });
  console.log('Records to merge:', scraped.length);

  let created = 0, skipped = 0, errors = 0;
  let currentYear = null;
  let seasonId = '';
  let teams = [];

  for (const entry of scraped) {
    const dbCategory = CATEGORY_MAP[entry.category];
    if (!dbCategory) { skipped++; continue; }

    const m = entry.season.match(/(\d{4})\/(\d{4})/);
    if (!m) { skipped++; continue; }
    const year = parseInt(m[1], 10);

    if (year !== currentYear) {
      currentYear = year;
      // Look up by YEAR (unique) — Season.name formatting varies across the
      // table ("2010/2011" vs "2013/14"), so a reconstructed dash-joined name
      // string ("2010-2011") never matches and silently drops every row.
      const season = await prisma.season.findUnique({ where: { year } });
      if (!season) { seasonId = ''; teams = []; skipped++; continue; }
      seasonId = season.id;
      teams = await prisma.team.findMany({ where: { seasonId }, select: { id: true, nameHe: true } });
    }
    if (!seasonId) { skipped++; continue; }

    // Find team
    const team = findTeam(teams, entry.teamName);

    // Check if already exists
    const existing = await prisma.competitionLeaderboardEntry.findFirst({
      where: { seasonId, competitionId: competition.id, category: dbCategory, rank: entry.rank },
    });
    if (existing) { skipped++; continue; }

    try {
      await prisma.competitionLeaderboardEntry.create({
        data: {
          seasonId,
          competitionId: competition.id,
          category: dbCategory,
          rank: entry.rank,
          playerNameEn: entry.playerName,
          playerNameHe: entry.playerName,
          teamNameEn: entry.teamName,
          teamNameHe: entry.teamName,
          value: Math.round(entry.value),
          teamId: team?.id || null,
        },
      });
      created++;
    } catch (e) {
      errors++;
    }

    if ((created + skipped + errors) % 2000 === 0) {
      console.log('  Progress: ' + created + ' created, ' + skipped + ' skipped, ' + errors + ' errors');
    }
  }

  console.log('\nDone: created=' + created + ', skipped=' + skipped + ', errors=' + errors);
  const total = await prisma.competitionLeaderboardEntry.count();
  console.log('DB total leaderboard entries: ' + total);
  await prisma.$disconnect();
}

main().catch(console.error);
