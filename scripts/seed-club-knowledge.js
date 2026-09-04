'use strict';
/**
 * seed-club-knowledge.js — plant Hapoel Beer Sheva honors, hall-of-fame legends
 * and club-history prose (facts sourced from Wikipedia). Idempotent:
 *  - honors: cleared + reseeded (pure facts, not editor-managed)
 *  - hall of fame: seeded ONLY when the table is empty (editors refine after)
 *  - club pages: created by slug only when absent (never overwrites editor edits)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const yearOf = (label) => parseInt(String(label).slice(0, 4), 10);
const W = (comp, seasons) => seasons.map((s) => ({ competitionHe: comp, place: 'WINNER', seasonLabel: s, year: yearOf(s) }));
const R = (comp, seasons) => seasons.map((s) => ({ competitionHe: comp, place: 'RUNNER_UP', seasonLabel: s, year: yearOf(s) }));

const HONORS = [
  ...W('ליגת העל', ['1974/75', '1975/76', '2015/16', '2016/17', '2017/18', '2025/26']),
  ...R('ליגת העל', ['2013/14', '2021/22', '2022/23', '2024/25']),
  ...W('גביע המדינה', ['1996/97', '2019/20', '2021/22', '2024/25']),
  ...R('גביע המדינה', ['1983/84', '2002/03', '2014/15', '2023/24', '2025/26']),
  ...W('אלוף האלופים', ['1975', '2016', '2017', '2022', '2025']),
  ...R('אלוף האלופים', ['1976', '2018', '2020', '2026']),
  ...W('גביע הטוטו', ['1988/89', '1995/96', '2016/17']),
  ...R('גביע הטוטו', ['1985/86', '2012/13', '2017/18', '2021/22', '2022/23']),
  ...W('גביע ליליאן', ['1988/89']),
];

const LEGENDS = [
  { nameHe: 'שלמה אילוז', role: 'PLAYER', years: 'שנות ה-70–80', statLineHe: 'שיא הופעות · 515', blurbHe: 'שיאן ההופעות בתולדות המועדון.' },
  { nameHe: 'שלום אביטן', role: 'PLAYER', years: 'שנות ה-80', statLineHe: 'מלך השערים · 100', blurbHe: 'מלך השערים ההיסטורי של המועדון.' },
  { nameHe: 'אליניב ברדה', role: 'PLAYER', years: '1998–2003, 2013–2018', statLineHe: '207 הופעות · 53 שערים', blurbHe: 'סמל האליפות הראשונה בעידן ברקת.' },
  { nameHe: 'מיגל ויטור', role: 'PLAYER', years: '2016–2022', statLineHe: 'קפטן שלוש אליפויות', blurbHe: 'קפטן שושלת האליפויות.' },
  { nameHe: 'אליהו עופר', role: 'PLAYER', years: 'שנות ה-70–80', statLineHe: '450 הופעות · 64 שערים' },
  { nameHe: 'מאיר בראד', role: 'PLAYER', statLineHe: '344 הופעות · 80 שערים' },
  { nameHe: 'סתיו אלימלך', role: 'PLAYER', statLineHe: '431 הופעות' },
  { nameHe: 'רפי אליהו', role: 'PLAYER', statLineHe: '419 הופעות · 66 שערים' },
  { nameHe: 'מאור מליקסון', role: 'PLAYER', statLineHe: '230 הופעות' },
  { nameHe: 'ברק בכר', role: 'COACH', years: '2015–2020', statLineHe: '161 משחקי ליגה · 68.7% הצלחה', blurbHe: 'המאמן של פריצת הדרך והאליפויות.' },
];

const PAGES = [
  {
    slug: 'history', title: 'ההיסטוריה של הפועל באר שבע', category: 'HISTORY', displayOrder: 1,
    bodyHe: [
      'הפועל באר שבע נוסדה ב-1 במאי 1949, ומכונה "הגמלים" ו"האדומים מהדרום".',
      '',
      'תארים ראשונים (שנות ה-70): המועדון זכה באליפויות הראשונות שלו בעונות 1974/75 ו-1975/76, בהובלת הדור הזהב של אותה תקופה.',
      '',
      'עידן אלונה ברקת (מ-2007): רכישת המועדון על-ידי אלונה ברקת סימנה נקודת מפנה, עם השקעה שהחזירה את הקבוצה אל צמרת הכדורגל הישראלי.',
      '',
      'שושלת האליפויות (מ-2016): בהובלת המאמן ברק בכר זכתה הקבוצה באליפות 2015/16, ואחריה 2016/17 ו-2017/18, לצד הופעות בזירה האירופית.',
      '',
      'אלופה שישית (2025/26): המועדון הוסיף אליפות שישית לארון התארים.',
    ].join('\n'),
  },
  {
    slug: 'turner-stadium', title: 'אצטדיון טרנר', category: 'STADIUM', displayOrder: 2,
    bodyHe: [
      'אצטדיון טרנר (השם המלא: אצטדיון טוטו באר שבע ע"ש יעקב טרנר) נפתח ב-21 בספטמבר 2015 ומכיל 16,126 מושבים. הוא ממוקם ברחוב האצ"ל 6 בבאר שבע, והחליף את אצטדיון וסרמיל הוותיק.',
      '',
      'אצטדיון וסרמיל: נפתח ב-1959, נקרא ב-1988 על-שם ארתור וסרמיל, ושימש את המועדון עד 2015.',
    ].join('\n'),
  },
  {
    slug: 'identity', title: 'זהות, סמל ומדים', category: 'IDENTITY', displayOrder: 3,
    bodyHe: [
      'סמל וכינוי: המועדון מכונה "הגמלים" ו"האדומים מהדרום". הסמל עבר מספר גלגולים לאורך השנים.',
      '',
      'מדים: אדום-לבן במגרש הביתי, לבן בחוץ, וכחול כמדי שלישית.',
      '',
      'בעלות: המועדון בבעלות אלונה ברקת מאז יולי 2007.',
      '',
      'תרבות אוהדים: ארגוני האוהדים "וסרמיליה" (2013) ו"אולטרס דרום" (2014) מובילים את היציע האדום מהדרום.',
    ].join('\n'),
  },
];

(async () => {
  // Honors — clear + reseed
  await prisma.clubHonor.deleteMany({});
  await prisma.clubHonor.createMany({ data: HONORS.map((h, i) => ({ ...h, displayOrder: i })) });
  console.log('honors seeded:', HONORS.length);

  // Hall of fame — only when empty (respect editor edits on re-run)
  const hofCount = await prisma.hallOfFameEntry.count();
  if (hofCount === 0) {
    await prisma.hallOfFameEntry.createMany({ data: LEGENDS.map((l, i) => ({ ...l, rank: i })) });
    console.log('hall of fame seeded:', LEGENDS.length);
  } else {
    console.log('hall of fame skipped (already', hofCount, 'entries)');
  }

  // Club pages — create by slug only when absent
  let created = 0;
  for (const pg of PAGES) {
    const exists = await prisma.clubPage.findUnique({ where: { slug: pg.slug }, select: { id: true } });
    if (!exists) { await prisma.clubPage.create({ data: pg }); created++; }
  }
  console.log('club pages created:', created, '(existing left untouched)');

  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
