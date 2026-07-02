/**
 * prune-empty-future-seasons.js — delete FUTURE seasons that are completely
 * empty (0 games, 0 teams, 0 standings). These are API/import artifacts (e.g. a
 * premature "2027-2028") that otherwise become the newest season and make
 * season-defaulting pages show an empty list.
 *
 * Only touches seasons with year > current season start year AND zero content.
 * Dry-run by default; pass --execute to delete. Self-loads .env.
 *
 *   node scripts/prune-empty-future-seasons.js            # dry-run
 *   node scripts/prune-empty-future-seasons.js --execute  # delete
 */
const fs = require('fs');
const path = require('path');
(function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
})();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function currentSeasonStartYear(d = new Date()) {
  return d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const cutoff = currentSeasonStartYear();
  console.log(`Mode: ${execute ? 'EXECUTE' : 'DRY-RUN'} | pruning empty seasons with year > ${cutoff}\n`);

  const seasons = await prisma.season.findMany({ where: { year: { gt: cutoff } }, orderBy: { year: 'asc' } });
  let removed = 0;
  for (const s of seasons) {
    const [games, teams, standings] = await Promise.all([
      prisma.game.count({ where: { seasonId: s.id } }),
      prisma.team.count({ where: { seasonId: s.id } }),
      prisma.standing.count({ where: { seasonId: s.id } }),
    ]);
    const empty = games === 0 && teams === 0 && standings === 0;
    console.log(`  ${s.year} (${s.name}) — games=${games} teams=${teams} standings=${standings} → ${empty ? 'PRUNE' : 'keep (has content)'}`);
    if (empty && execute) {
      // Clear the only lightweight dependents an empty season can have.
      await prisma.competitionSeason.deleteMany({ where: { seasonId: s.id } });
      await prisma.liveGameSnapshot.deleteMany({ where: { seasonId: s.id } }).catch(() => null);
      await prisma.season.delete({ where: { id: s.id } });
      removed += 1;
    }
  }
  console.log(`\n${execute ? `Deleted ${removed} empty future season(s).` : '(dry-run — nothing deleted; re-run with --execute)'}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
