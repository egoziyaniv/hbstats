/**
 * seed-coaches.js — populate Coach + CoachAlias from existing data.
 *
 * Pulls every distinct coach name from:
 *   - TeamCoachAssignment.coachNameEn (+ coachNameHe, apiFootballCoachId)
 *   - GameLineupEntry.participantName (role=COACH)
 *
 * Groups by normalized key (first-initial + lowercase lastname) so variants
 * like "R. Kozuch" and "Ran Kozuch" collapse into a single Coach. Picks the
 * longest spelling as the canonical nameEn. Saves every variant as a
 * CoachAlias so future imports can resolve back to the canonical row.
 *
 * Also sets `coachId` on TeamCoachAssignment rows that match.
 *
 * Re-runnable: skips coaches/aliases that already exist.
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function normalizeKey(rawName) {
  const parts = rawName.replace(/[.,]/g, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return rawName.toLowerCase();
  const lastName = parts[parts.length - 1].toLowerCase();
  const firstInitial = parts[0][0]?.toLowerCase() || '';
  return `${firstInitial} ${lastName}`;
}

function preferLonger(a, b) {
  return b.length > a.length ? b : a;
}

async function main() {
  // 1. Gather variants from both sources.
  const assignments = await prisma.teamCoachAssignment.findMany({
    select: { coachNameEn: true, coachNameHe: true, apiFootballCoachId: true },
  });
  const lineupRows = await prisma.gameLineupEntry.findMany({
    where: { role: 'COACH', participantName: { not: null } },
    select: { participantName: true },
  });
  console.log(`Sources: ${assignments.length} assignments, ${lineupRows.length} lineup-COACH rows.`);

  // 2. Group by normalized key.
  const buckets = new Map();
  for (const a of assignments) {
    const key = normalizeKey(a.coachNameEn);
    if (!buckets.has(key)) buckets.set(key, { variants: new Set(), nameHe: null, apiFootballCoachId: null });
    const b = buckets.get(key);
    b.variants.add(a.coachNameEn);
    if (a.coachNameHe && !b.nameHe) b.nameHe = a.coachNameHe;
    if (a.apiFootballCoachId && !b.apiFootballCoachId) b.apiFootballCoachId = a.apiFootballCoachId;
  }
  for (const r of lineupRows) {
    const key = normalizeKey(r.participantName);
    if (!buckets.has(key)) buckets.set(key, { variants: new Set(), nameHe: null, apiFootballCoachId: null });
    buckets.get(key).variants.add(r.participantName);
  }
  console.log(`Distinct canonical coaches: ${buckets.size}`);

  // 3. Upsert Coach + CoachAlias.
  let created = 0;
  let aliasesCreated = 0;
  for (const [key, b] of buckets) {
    const variants = Array.from(b.variants);
    const canonicalName = variants.reduce(preferLonger, variants[0]);

    // Skip if any variant is already an alias (avoid re-processing).
    const existingAlias = await prisma.coachAlias.findFirst({
      where: { alias: { in: variants } },
      include: { coach: true },
    });
    let coach = existingAlias?.coach;

    if (!coach) {
      // Check if coach already exists by nameEn (idempotent).
      coach = await prisma.coach.findUnique({ where: { nameEn: canonicalName } });
    }

    if (!coach) {
      coach = await prisma.coach.create({
        data: {
          nameEn: canonicalName,
          nameHe: b.nameHe,
          apiFootballCoachId: b.apiFootballCoachId,
          photoUrl: b.apiFootballCoachId ? `https://media.api-sports.io/football/coachs/${b.apiFootballCoachId}.png` : null,
        },
      });
      created++;
    }

    for (const v of variants) {
      const exists = await prisma.coachAlias.findUnique({ where: { alias: v } });
      if (!exists) {
        await prisma.coachAlias.create({ data: { coachId: coach.id, alias: v } });
        aliasesCreated++;
      }
    }
  }
  console.log(`Created: ${created} coaches, ${aliasesCreated} aliases.`);

  // 4. Backfill coachId on TeamCoachAssignment.
  const allCoaches = await prisma.coach.findMany({ include: { aliases: true } });
  const byAlias = new Map();
  for (const c of allCoaches) {
    for (const a of c.aliases) byAlias.set(a.alias, c.id);
  }
  let linked = 0;
  const unlinked = await prisma.teamCoachAssignment.findMany({
    where: { coachId: null },
    select: { id: true, coachNameEn: true },
  });
  for (const tca of unlinked) {
    const coachId = byAlias.get(tca.coachNameEn);
    if (coachId) {
      await prisma.teamCoachAssignment.update({ where: { id: tca.id }, data: { coachId } });
      linked++;
    }
  }
  console.log(`Linked ${linked}/${unlinked.length} TeamCoachAssignment rows to Coach.`);

  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
