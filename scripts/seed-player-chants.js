'use strict';
/**
 * seed-player-chants.js — Hapoel Beer Sheva player chants (שירי שחקנים) sourced
 * from the אולטרס דרום channel: video + lyrics (where the channel published them)
 * + the original melody, linked to the player's record.
 *
 * Player matching is scoped to BEER SHEVA squads only, so a name collision with
 * some other club's player can never produce a wrong link. Idempotent: upsert by slug.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const CHANTS = [
  { playerNameHe: 'מיגל ויטור', titleHe: 'מיגל ויטור עולה עולהו', youtubeUrl: 'https://www.youtube.com/watch?v=sYg-GgiEpTE', originalMelody: 'אנצל – מוש בן ארי', lyricsHe: "וזה עולם די יהיר\nהכל רק כסף מהיר\nולפעמים זה רודף אותי\nבין מה נכון לא נכון\nאנ'לא מוצא היגיון\nבכל מה שקורה סביבי\n\nמיגל ויטור\nמיגל ויטור עולה עולהו\nמיגל ויטור עולה עולהו" },
  { playerNameHe: 'אמיר גנאח', titleHe: 'יאללה אמיר גנאח', youtubeUrl: 'https://www.youtube.com/watch?v=WYwlqHLjtEY', originalMelody: 'התמונות שבאלבום – חיים משה', lyricsHe: 'התמונות שבאלבום\nילדות שלא נגמרת\nעד שהגעת לבוגרים\nהכל היה כסרט\nפתאום לבשת תמדים\nידעת אין אחרת\nבכל מקום תמיד תזכור\nרק הפועל מרגשת\n\nלהלהלהלהלהלהלהלה\nיאללה אמיר גנאח\nלהלהלהלהלהלהלהלהלהלה\nיאללה אמיר גנאח' },
  { playerNameHe: 'אליאל פרץ', titleHe: 'השיר של אליאל פרץ', youtubeUrl: 'https://www.youtube.com/watch?v=LpGzysznFZU', originalMelody: null, lyricsHe: null },
  { playerNameHe: 'לוקאס ונטורה', titleHe: 'השיר של לוקאס ונטורה', youtubeUrl: 'https://www.youtube.com/watch?v=avHz3jyHDvo', originalMelody: null, lyricsHe: null },
  { playerNameHe: 'איגור זלאטנוביץ', titleHe: 'השיר של איגור זלאטנוביץ', youtubeUrl: 'https://www.youtube.com/watch?v=xfzT-GUPuzY', originalMelody: null, lyricsHe: null },
  { playerNameHe: 'ניב אליאסי', titleHe: 'השיר של ניב אליאסי', youtubeUrl: 'https://www.youtube.com/watch?v=_oJnsk5mJwc', originalMelody: null, lyricsHe: null },
  { playerNameHe: 'אופיר מרציאנו', titleHe: 'השיר של אופיר מרציאנו', youtubeUrl: 'https://www.youtube.com/watch?v=VCcKk1ERaNI', originalMelody: null, lyricsHe: null },
  { playerNameHe: 'הלדר לופס', titleHe: 'השיר של הלדר לופס', youtubeUrl: 'https://www.youtube.com/watch?v=1kT29K8djiM', originalMelody: null, lyricsHe: null },
  { playerNameHe: 'יוני סטויאנוב', titleHe: 'לה לה לה יוני סטויאנוב', youtubeUrl: 'https://www.youtube.com/watch?v=_DJomtNqoMs', originalMelody: 'כל הכוח – קובי פרץ', lyricsHe: 'רק פתחי את ליבך שוב כמו פעם\nלהחזיר לחיי את הטעם\nתחייכי שוב אליי ותתני לי\nלאהוב אותך\nאיי איי איי\nלה לה לה לה לה לה לה לה יוני סטויאנוב\nלה לה לה לה לה לה לה לה יוני סטויאנוב\nאני אוהב אותך!' },
  { playerNameHe: 'רותם חטואל', titleHe: 'יאללה יאללה רותם חטואל', youtubeUrl: 'https://www.youtube.com/watch?v=NhYa0e9eOVM', originalMelody: null, lyricsHe: 'בלילות כשהייתי לבדי\nולא היית איתי לדעת\nמה קורה בתוך ליבי\nקחי אותי ותראי איך שאני\nמתמלא מגעגוע\nשרגע לא עוזב אותי\nויאלה יאלה רותם חתואל\nויאלה יאלה רותם חתואל\nתראה איך עוד שניה הגג נופל\nתביא לנו תגול ונשתולל' },
  { playerNameHe: 'מאור מליקסון', titleHe: 'שלוש שנים בלב היה לי חור', youtubeUrl: 'https://www.youtube.com/watch?v=DMJYBaPEtrI', originalMelody: null, lyricsHe: 'שלוש שנים בלב היה לי חור,\nהוא חשב רק על מאור\nובלילות תפילה לאלוהים\nלשיר לו את אותן מילים\nאוי אוי אוי אוי אוי\nמאור מליקסון\nאוי אוי אוי אוי אוי\nמאור מליקסון' },
  { playerNameHe: 'אליניב ברדה', titleHe: 'אליניב ברדה נשמה', youtubeUrl: 'https://www.youtube.com/watch?v=XJPEYOnbNLI', originalMelody: 'תותים – אתניקס', lyricsHe: 'הקור שבגנך\nמול החום שבגני\nהבונקר לשמאלך\nמול הפגז שבידי\nאוו אוו או, אוו או או\nאור עולה מן המגרש\nוקוראים לו אליה\nאליניב ברדה נשמה\nאליניב ברדה, אתה תמיד\nתהיה מספר 1' },
  { playerNameHe: 'מהראן ראדי', titleHe: 'מהראן ראדי עולה עולה', youtubeUrl: 'https://www.youtube.com/watch?v=FWrqKL4shj8', originalMelody: 'האם להיות בך מאוהב – אביב גפן', lyricsHe: 'האם להיות בך מאוהב\nזה כשאני עצוב עכשיו\nוהחלון מראה לי סתיו\nהאם להיות בך מאוהב\nזה כשהלב מרגיש רעב\nכשאת לא פה לידי\n\nמהראן מהראן ראדי מהראן\nעולה עולה עולה עולה' },
  { playerNameHe: 'ולדימיר ברון', titleHe: 'וובה וובה בראון', youtubeUrl: 'https://www.youtube.com/watch?v=FVzXmtw9YYQ', originalMelody: 'ריו – אגם בוחבוט', lyricsHe: 'כולם עכשיו קופצים\nמעיפים את טרנר עד העננים\nולך שרים..\nוובה וובה בראון\nלה לה לה לה לה לה אה\nוובה וובה בראון\nאוי אוי אוי אוי אוי אוי' },
  { playerNameHe: 'רועי גורדנה', titleHe: 'רועי גורדנה עולה עולה', youtubeUrl: 'https://www.youtube.com/watch?v=4n7xUeedKaM', originalMelody: 'ילד של אבא – מוקי', lyricsHe: 'כי זמן לא עוצר,\nהוא עף, נשרף מסך עשן\nהיה לאילן,\nתפוס ירח, שוט על ענן\nנה נה נה רועי גורדנה\nגורדנה עולה עולה\nרועי גורדנה עולה עולה\nתיתן את כולך,\nאנחנו נשיר בשבילך\nואף פעם אל תשכח,\nשאנחנו תמיד איתך,\nשכל אוהד באצטדיון אוהב אותך' },
];

const slugify = (t) => (t || '').trim().toLowerCase()
  .replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
// Ignore apostrophes/quotes + spacing when comparing Hebrew names.
const norm = (s) => (s || '').replace(/['"׳״]/g, '').replace(/\s+/g, ' ').trim();

(async () => {
  // Only ever match against players who were on a Beer Sheva squad.
  const bsTeams = await prisma.team.findMany({ where: { apiFootballId: 563 }, select: { id: true } });
  const bsIds = bsTeams.map((t) => t.id);
  const bsPlayers = await prisma.player.findMany({
    where: { teamId: { in: bsIds } },
    select: { id: true, nameHe: true, canonicalPlayerId: true },
  });

  const resolvePlayerId = (nameHe) => {
    const target = norm(nameHe);
    const matches = bsPlayers.filter((p) => norm(p.nameHe) === target);
    if (!matches.length) return null;
    const canonical = matches.find((m) => !m.canonicalPlayerId);
    return canonical ? canonical.id : (matches[0].canonicalPlayerId || matches[0].id);
  };

  let linked = 0, withLyrics = 0;
  for (const c of CHANTS) {
    const slug = slugify(c.titleHe);
    const playerId = resolvePlayerId(c.playerNameHe);
    if (playerId) linked++;
    if (c.lyricsHe) withLyrics++;
    const data = {
      type: 'PLAYER',
      titleHe: c.titleHe,
      lyricsHe: c.lyricsHe,
      originalMelody: c.originalMelody,
      videoUrls: [c.youtubeUrl],
      performerGroup: 'אולטרס דרום',
      playerId,
      isPublished: true,
    };
    await prisma.song.upsert({ where: { slug }, create: { slug, ...data }, update: data });
    console.log(`${c.playerNameHe.padEnd(16)} | lyrics=${c.lyricsHe ? 'yes' : 'no '} | player=${playerId ? 'linked' : '—'} | ${slug}`);
  }
  console.log(`\ntotal=${CHANTS.length} linked=${linked} withLyrics=${withLyrics}`);
  await prisma.$disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
