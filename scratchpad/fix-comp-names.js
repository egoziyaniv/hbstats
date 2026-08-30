const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const FIXES = [
  { id: 'comp_liga_leumit',  nameHe: 'ליגה לאומית' },
  { id: 'comp_super_cup',    nameHe: 'אלוף האלופים' },
  { id: 'comp_toto_cup_al',  nameHe: 'גביע הטוטו' },
];

(async () => {
  for (const f of FIXES) {
    const before = await prisma.competition.findUnique({ where: { id: f.id }, select: { id: true, nameEn: true, nameHe: true } });
    if (!before) { console.log(`SKIP ${f.id} (not found)`); continue; }
    if (before.nameHe === f.nameHe) { console.log(`OK   ${f.id} already "${f.nameHe}"`); continue; }
    await prisma.competition.update({ where: { id: f.id }, data: { nameHe: f.nameHe } });
    console.log(`FIX  ${f.id}: "${before.nameHe}" -> "${f.nameHe}" (nameEn="${before.nameEn}")`);
  }
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
