#!/usr/bin/env node
/** Corrects the classification of UEFA club competitions imported before 2026-09-22. */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.competition.updateMany({
    where: { apiFootballId: { in: [2, 3, 848] } },
    data: { type: 'EUROPE' },
  });
  console.log(`Updated ${result.count} European competition record(s).`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
