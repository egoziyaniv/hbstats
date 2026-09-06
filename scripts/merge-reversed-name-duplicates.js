'use strict';
/**
 * merge-reversed-name-duplicates.js — join the two rows a squad holds for one player
 * when a second importer wrote his name surname-first.
 *
 * In the 2014/15 squad the split is total and consistent: the reversed row ("ברדה אליניב")
 * owns the goal events, the normal row ("אליניב ברדה") owns the lineups. So a striker read
 * 34 appearances and 0 goals. Both rows sit on the SAME teamId — one squad in one season —
 * so identical name tokens in a different order cannot be two different people.
 *
 * Keeper: the canonical root of whichever row's family holds the most data; the other rows
 * become its children, which is all the family aggregation needs to see both halves.
 *
 * Guard: a non-keeper root that already has children of its own is NOT merged, only
 * reported — that shape would mean pulling a whole separate career across on the strength
 * of a name, which is exactly the inference this script refuses to make.
 *
 * Run: node scripts/merge-reversed-name-duplicates.js [--apply] [--all]
 *   --all scans every team; the default is Hapoel Be'er Sheva only.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const ALL_TEAMS = process.argv.includes('--all');

const key = (n) => (n || '').replace(/['"׳״]/g, '').split(/\s+/).filter(Boolean).sort().join(' ');

(async () => {
  const teams = await prisma.team.findMany({
    where: ALL_TEAMS ? {} : { OR: [{ apiFootballId: 563 }, { nameHe: 'הפועל באר שבע' }] },
    select: { id: true, nameHe: true, season: { select: { year: true } } },
  });

  let merged = 0;
  let refused = 0;
  let unchanged = 0;

  for (const t of teams) {
    const squad = await prisma.player.findMany({
      where: { teamId: t.id },
      select: { id: true, nameHe: true, canonicalPlayerId: true },
    });
    const byKey = new Map();
    for (const s of squad) {
      const k = key(s.nameHe);
      if (!k) continue;
      byKey.set(k, [...(byKey.get(k) ?? []), s]);
    }

    for (const [, members] of byKey) {
      if (members.length < 2) continue;
      if (new Set(members.map((m) => m.nameHe)).size < 2) continue;

      // Distinct canonical roots involved.
      const rootIds = [...new Set(members.map((m) => m.canonicalPlayerId ?? m.id))];
      if (rootIds.length < 2) { unchanged++; continue; }

      const families = await Promise.all(
        rootIds.map(async (rootId) => {
          const rows = await prisma.player.findMany({
            where: { OR: [{ id: rootId }, { canonicalPlayerId: rootId }] },
            select: { id: true },
          });
          const ids = [...new Set([rootId, ...rows.map((r) => r.id)])];
          const [lineups, events] = await Promise.all([
            prisma.gameLineupEntry.count({ where: { playerId: { in: ids } } }),
            prisma.gameEvent.count({ where: { playerId: { in: ids } } }),
          ]);
          return { rootId, size: ids.length, volume: lineups + events };
        }),
      );
      families.sort((a, b) => b.volume - a.volume || b.size - a.size);
      const keeper = families[0];
      const others = families.slice(1);

      const risky = others.filter((f) => f.size > 1);
      if (risky.length) {
        console.log(
          `REFUSE ${t.season.year} ${t.nameHe} — ${members.map((m) => m.nameHe).join(' == ')}` +
          `: non-keeper root has its own family (${risky.map((r) => `${r.rootId.slice(0, 9)} size=${r.size}`).join(', ')})`,
        );
        refused++;
        continue;
      }

      console.log(
        `${APPLY ? 'MERGE' : 'PLAN '} ${t.season.year} ${members.map((m) => m.nameHe).join(' == ')}` +
        ` -> keeper ${keeper.rootId.slice(0, 9)} (vol ${keeper.volume}), absorbing ${others.map((o) => `${o.rootId.slice(0, 9)}(vol ${o.volume})`).join(', ')}`,
      );

      if (APPLY) {
        await prisma.player.updateMany({
          where: { id: { in: others.map((o) => o.rootId) } },
          data: { canonicalPlayerId: keeper.rootId },
        });
        // Songs / hall-of-fame pointers must follow, or the family lookup collapses.
        await prisma.song.updateMany({
          where: { playerId: { in: others.map((o) => o.rootId) } },
          data: { playerId: keeper.rootId },
        });
        await prisma.hallOfFameEntry.updateMany({
          where: { playerId: { in: others.map((o) => o.rootId) } },
          data: { playerId: keeper.rootId },
        });
      }
      merged++;
    }
  }

  console.log(
    `\n${APPLY ? 'APPLIED' : 'DRY RUN'} — merged: ${merged}, refused (needs review): ${refused}, already joined: ${unchanged}`,
  );
  if (!APPLY) console.log('re-run with --apply to write');
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
