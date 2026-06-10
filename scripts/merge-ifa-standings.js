/**
 * Backfill league standings from already-scraped IFA (footballOrgIl) data into
 * the main `standings` table, using the same robust abbreviation matching as the
 * merge-engine so existing team rows are reused (no duplicate teams created).
 *
 * Motivation: ליגת העל standings for 2016/17–2018/19 were scraped but never
 * merged, so those top-flight seasons were missing from team position history.
 *
 * Dry-run by default (prints what it would do). Pass --execute to write.
 *
 *   node scripts/merge-ifa-standings.js --season "2016/2017" --league "ליגת העל"
 *   node scripts/merge-ifa-standings.js --season "2016/2017" --league "ליגת העל" --execute
 *
 * Omit --season to process all seasons of that source; omit --league for both tiers.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const LIGA_HAAL_API_ID = 383;
const LIGA_LEUMIT_API_ID = 382;

// ── Ported verbatim from src/lib/merge-engine.ts ──────────────────────────────
function normalizeName(name) {
  return name
    .replace(/&#\d+;/g, '')
    .replace(/&\w+;/g, '')
    .replace(/['"״׳\-\.`']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const IFA_TEAM_ABBREVS = {
  'הפועל ב"ש': ['הפועל באר שבע'],
  'הפועל ת"א': ['הפועל תל אביב'],
  'מכבי ת"א': ['מכבי תל אביב'],
  'בית"ר י-ם': ['בית"ר ירושלים', 'ביתר ירושלים'],
  'הפועל י-ם': ['הפועל ירושלים'],
  'הפועל פ"ת': ['הפועל פתח תקווה'],
  'הפועל ק"ש': ['עירוני קריית שמונה', 'הפועל קריית שמונה'],
  'הפועל ר"ג': ['הפועל רמת גן'],
  'הפועל כפ"ס': ['הפועל כפר סבא'],
  'מכבי פ"ת': ['מכבי פתח תקווה'],
  'הפ\' חדרה ש. שוורץ': ['הפועל חדרה'],
  'הפ\' חדרה': ['הפועל חדרה'],
  'הפועל ע"א': ['הפועל עפולה'],
  'עירוני ק"ש': ['עירוני קריית שמונה'],
  'מ.ס. אשדוד': ['מ.ס. אשדוד', 'אשדוד'],
  'בני יהודה ת"א': ['בני יהודה'],
  'הפועל ק"ג': ['הפועל קריית גת'],
  'מכבי ק"ג': ['מכבי קריית גת'],
  'הפועל ר"ל': ['הפועל ראשון לציון'],
  'עירוני ר"ל': ['עירוני ראשון לציון'],
  'מכבי ב"ר': ['מכבי בני ריינה'],
  'בני סכנין': ['בני סכנין'],
  'מכבי נתניה': ['מכבי נתניה'],
  'מכבי חיפה': ['מכבי חיפה'],
  'הפועל חיפה': ['הפועל חיפה'],
  'עירוני טבריה': ['עירוני טבריה'],
  'עירוני קרית שמונה': ['עירוני קריית שמונה', 'הפועל קריית שמונה'],
  'עירוני קרית-שמונה': ['עירוני קריית שמונה'],
  'מכבי פתח תקוה': ['מכבי פתח תקווה'],
  'הפועל פתח תקוה': ['הפועל פתח תקווה'],
  'בני יהודה תל-אביב': ['בני יהודה'],
  'הפועל ראשון לציון': ['הפועל ראשון לציון'],
  'מכבי קרית-גת': ['מכבי קריית גת'],
  'מכבי הרצליה': ['מכבי הרצליה'],
  'הפועל נוף הגליל': ['הפועל נצרת עילית', 'הפועל נוף הגליל'],
  'הפועל כפר סבא': ['הפועל כפר סבא'],
  'הפועל אום אל-פחם': ['הפועל אום אל פאחם'],
  'הפועל ראשל"צ': ['הפועל ראשון לציון'],
  'בית"ר ת"א חולון': ['בית"ר תל אביב', 'בית"ר תל אביב חולון'],
  'הפ\' בני לוד רכבת': ['הפועל בני לוד'],
  'עירוני דורות טבריה': ['עירוני טבריה'],
  'הפועל ניר רמה"ש': ['הפועל ניר רמת השרון', 'הפועל רמת השרון'],
  'מ.ס. כפר קאסם סוהיב': ['מ.ס. כפר קאסם'],
  'מכבי הרצליה דיוויד יחזקאל': ['מכבי הרצליה'],
  'הפועל א.א. פאחם': ['הפועל אום אל פאחם'],
  'הפועל ע. אשקלון / לא פעיל': ['הפועל אשקלון', 'הפועל עירוני אשקלון'],
  'הפועל ע. אשקלון': ['הפועל אשקלון', 'הפועל עירוני אשקלון'],
};

function matchTeamName(ifaName, dbName) {
  const cleanIfa = normalizeName(ifaName);
  const cleanDb = normalizeName(dbName);
  if (cleanIfa === cleanDb) return true;
  const expansions = IFA_TEAM_ABBREVS[ifaName];
  if (expansions) return expansions.some((exp) => normalizeName(exp) === cleanDb);
  for (const [abbr, exps] of Object.entries(IFA_TEAM_ABBREVS)) {
    if (normalizeName(abbr) === cleanIfa) return exps.some((exp) => normalizeName(exp) === cleanDb);
  }
  const wordsIfa = cleanIfa.split(' ');
  const wordsDb = cleanDb.split(' ');
  if (wordsIfa.length >= 2 && wordsDb.length >= 2) {
    if (wordsIfa[0] === wordsDb[0] && wordsIfa[wordsIfa.length - 1] === wordsDb[wordsDb.length - 1]) return true;
  }
  return false;
}
// ──────────────────────────────────────────────────────────────────────────────

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const seasonFilter = arg('--season');
  const leagueFilter = arg('--league');

  const where = { source: 'footballOrgIl' };
  if (seasonFilter) where.season = seasonFilter;
  if (leagueFilter) where.leagueNameHe = leagueFilter;

  const rows = await prisma.scrapedStanding.findMany({
    where,
    orderBy: [{ season: 'desc' }, { position: 'asc' }],
  });
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'} | scraped rows: ${rows.length}\n`);

  // group by season|league
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.season}|${r.leagueNameHe}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }

  let created = 0, skipped = 0, unmatched = 0;
  const unmatchedList = [];

  for (const [key, grp] of groups) {
    const [seasonStr, leagueName] = key.split('|');
    const m = seasonStr.match(/(\d{4})\/(\d{4})/);
    if (!m) { console.log(`  ?? bad season "${seasonStr}" — skip`); skipped += grp.length; continue; }
    const year = parseInt(m[1], 10);

    const season = await prisma.season.findFirst({ where: { year } });
    if (!season) { console.log(`  ?? season year ${year} not in DB — skip`); skipped += grp.length; continue; }

    const isLeumit = leagueName.includes('לאומית');
    const compApiId = isLeumit ? LIGA_LEUMIT_API_ID : LIGA_HAAL_API_ID;
    const competition = await prisma.competition.findFirst({ where: { apiFootballId: compApiId } });
    if (!competition) { console.log(`  ?? competition apiId ${compApiId} missing — skip`); skipped += grp.length; continue; }

    const dbTeams = await prisma.team.findMany({ where: { seasonId: season.id }, select: { id: true, nameHe: true } });

    console.log(`▶ ${seasonStr} ${leagueName} → comp ${competition.nameEn} (${grp.length} rows)`);

    if (execute) {
      await prisma.competitionSeason.upsert({
        where: { competitionId_seasonId: { competitionId: competition.id, seasonId: season.id } },
        update: {}, create: { competitionId: competition.id, seasonId: season.id },
      }).catch(() => null);
    }

    for (const row of grp) {
      const team = dbTeams.find((t) => matchTeamName(row.teamNameHe, t.nameHe));
      if (!team) {
        unmatched++;
        unmatchedList.push(`${seasonStr} #${row.position} "${row.teamNameHe}"`);
        continue;
      }
      const existing = await prisma.standing.findFirst({
        where: { seasonId: season.id, teamId: team.id, competitionId: competition.id },
      });
      if (existing) { skipped++; continue; }

      console.log(`    ${execute ? '+ create' : '~ would create'}  #${row.position} ${row.teamNameHe} → ${team.nameHe} (${row.points} pts)`);
      if (execute) {
        await prisma.standing.create({
          data: {
            seasonId: season.id, teamId: team.id, competitionId: competition.id,
            position: row.position, played: row.played, wins: row.wins, draws: row.draws,
            losses: row.losses, goalsFor: row.goalsFor, goalsAgainst: row.goalsAgainst, points: row.points,
          },
        });
      }
      created++;
    }
  }

  console.log(`\n${execute ? 'Created' : 'Would create'}: ${created} | skipped (exists/other): ${skipped} | UNMATCHED: ${unmatched}`);
  if (unmatchedList.length) {
    console.log('\nUnmatched (no team row found — NOT created):');
    unmatchedList.forEach((u) => console.log('  ! ' + u));
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
