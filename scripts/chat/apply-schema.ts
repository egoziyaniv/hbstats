/**
 * Rebuilds the `chat` schema (scripts/chat/schema.sql) in one transaction: drops it, recreates every
 * view, fills chat.club_map from the club-identity families, and grants the read-only hbs_chat role
 * SELECT when that role exists. Also how the materialized views get fresh data — run from cron.
 *
 * Usage: npx tsx scripts/chat/apply-schema.ts
 */
import fs from 'fs';
import path from 'path';
import prisma from '@/lib/prisma';
import { getClubTeamIndex } from '@/lib/history/club-identity';

const CHAT_ROLE = 'hbs_chat';
const HBS_KEY = 'api-563';

async function main() {
  const t0 = Date.now();
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const index = await getClubTeamIndex();
  const teams = await prisma.team.findMany({ select: { id: true, nameHe: true, nameEn: true } });
  const hbsName = Array.from(index.values()).find((f) => f.clubKey === HBS_KEY)?.nameHe;
  const map = teams.map((t) => {
    // The archive's pre-API Beer Sheva rows carry the Hebrew name only.
    if (hbsName && t.nameHe === hbsName) return [t.id, HBS_KEY, hbsName];
    const family = index.get(t.id);
    return [t.id, family?.clubKey ?? `team-${t.id}`, family?.nameHe || t.nameHe || t.nameEn];
  });
  const role = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT count(*) AS n FROM pg_roles WHERE rolname = '${CHAT_ROLE}'`);

  // schema.sql has no functions or quoted semicolons, so splitting on ';' at line ends is safe.
  const stmts = sql.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
  const isMv = (s: string) => s.startsWith('CREATE MATERIALIZED VIEW');
  const isIndex = (s: string) => s.startsWith('CREATE INDEX');

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('DROP SCHEMA IF EXISTS chat CASCADE');
    for (const stmt of stmts.filter((s) => !isMv(s) && !isIndex(s))) await tx.$executeRawUnsafe(stmt);
    for (let i = 0; i < map.length; i += 1000) {
      const chunk = map.slice(i, i + 1000);
      const values = chunk.map((_, j) => `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`).join(',');
      await tx.$executeRawUnsafe(`INSERT INTO chat.club_map (team_id, club_key, club) VALUES ${values}`, ...chunk.flat());
    }
    // The materialized views read club_map, so they are built once it is filled.
    for (const stmt of stmts.filter(isMv)) await tx.$executeRawUnsafe(stmt);
    for (const stmt of stmts.filter(isIndex)) await tx.$executeRawUnsafe(stmt);
    if (Number(role[0]?.n ?? 0) > 0) {
      await tx.$executeRawUnsafe(`GRANT USAGE ON SCHEMA chat TO ${CHAT_ROLE}`);
      await tx.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA chat TO ${CHAT_ROLE}`);
    }
  }, { timeout: 600_000, maxWait: 30_000 });

  const counts = await prisma.$queryRawUnsafe<Array<Record<string, bigint>>>(
    `SELECT (SELECT count(*) FROM chat.games) games, (SELECT count(*) FROM chat.team_games) team_games,
            (SELECT count(*) FROM chat.goals) goals, (SELECT count(*) FROM chat.player_appearances) appearances,
            (SELECT count(*) FROM chat.standings) standings, (SELECT count(*) FROM chat.club_map) club_map`,
  );
  const c = Object.fromEntries(Object.entries(counts[0]).map(([k, v]) => [k, Number(v)]));
  console.log(`chat schema rebuilt in ${Date.now() - t0} ms`, c, Number(role[0]?.n ?? 0) ? `granted to ${CHAT_ROLE}` : `(no ${CHAT_ROLE} role yet)`);
}

main().then(() => prisma.$disconnect()).catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
