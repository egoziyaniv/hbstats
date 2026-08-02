#!/usr/bin/env node
/**
 * translate-foreign-teams.js — give Hebrew names to the foreign clubs imported
 * as opponents in Israeli teams' European games. Curated map (Israeli sports-
 * media conventions) matched by exact nameEn; only touches records whose nameHe
 * is still English (so manual fixes like Inter=אינטר / ויקינגור stay). Teams not
 * in the map keep their English name (better than a bad auto-transliteration).
 *
 * Usage: node scripts/translate-foreign-teams.js [--execute]
 */
'use strict';
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const EXECUTE = process.argv.includes('--execute');

const EN_TO_HE = {
  // Frequent opponents (from the European-games import)
  'Kairat Almaty': 'קאיראט אלמטי', 'Villarreal': 'ויאריאל', 'Levski Sofia': 'לבסקי סופיה',
  'Olympiakos Piraeus': 'אולימפיאקוס', 'Sheriff Tiraspol': 'שריף טירספול', 'Slavia Praha': 'סלאביה פראג',
  'Sutjeska': 'סוטייסקה', 'Universitatea Craiova': 'אוניברסיטטאה קרייובה', 'Celje': 'צלייה', 'Sabah FA': 'סבח',
  'Ararat-Armenia': 'אררט-ארמניה', 'Dinamo Zagreb': 'דינמו זאגרב', 'Riga': 'ריגה', 'Hamrun Spartans': 'חמרון ספרטנס',
  'Slovan Bratislava': 'סלובאן ברטיסלבה', 'Zenit Saint Petersburg': 'זניט סנט פטרסבורג', 'Sparta Praha': 'ספרטה פראג',
  'Omonia Nicosia': 'אומוניה ניקוסיה', 'FC Lugano': 'לוגאנו', 'Neftchi Baku': "נפצ'י באקו", 'Feyenoord': 'פיינורד',
  'Nice': 'ניס', 'Qarabag': 'קרבאח', 'Austria Vienna': 'אוסטריה וינה', 'Lech Poznan': 'לך פוזנן', 'Gent': 'חנט',
  'CFR 1907 Cluj': "CFR קלוז'", 'Flora Tallinn': 'פלורה טאלין', 'Lincoln Red Imps FC': 'לינקולן רד אימפס',
  "Kauno Žalgiris": "קובנה ז'לגיריס", 'KuPS': 'קופס', 'Shamrock Rovers': 'שמרוק רוברס', 'Larne': 'לארן',
  'KI Klaksvik': 'KI קלאקסוויק', 'Saburtalo': 'סבורטלו', 'Beşiktaş': 'בשיקטאש', 'Plzen': 'ויקטוריה פלזן',
  'SC Braga': 'בראגה', 'Bodo/Glimt': 'בודו/גלימט', 'PAOK': 'פאוק', 'Lyon': 'ליון', 'Benfica': 'בנפיקה',
  'Paris Saint Germain': 'פריז סן ז׳רמן', 'Juventus': 'יובנטוס', 'BSC Young Boys': 'יאנג בויז', 'Pafos': 'פאפוס',
  'Dundalk': 'דנדוק', 'AZ Alkmaar': 'א.ז. אלקמאר', 'Southampton': "סאות'המפטון", 'Saint Etienne': 'סנט אטיין',
  'HNK Hajduk Split': 'היידוק ספליט', 'Suduva Marijampole': 'סודובה', "Kalju Nomme": 'נומה קליו',
  'FCSB': 'פ.צ.ס.ב', 'Petrocub': 'פטרוקוב',
  // Well-known clubs Israeli teams have faced / that recur in qualifiers
  'Bayer Leverkusen': 'באייר לברקוזן', 'Motherwell': "מאת'רוול", 'Dinamo Batumi': 'דינמו באטומי',
  'Arda Kardzhali': "ארדה קרדז'אלי", 'Slask Wroclaw': 'שלונסק וורוצלב', 'Malmo FF': 'מאלמה', 'Celtic': 'סלטיק',
  'Rangers': "ריינג'רס", 'Ajax': 'איאקס', 'PSV Eindhoven': 'פ.ס.וו איינדהובן', 'Sporting CP': 'ספורטינג ליסבון',
  'FC Porto': 'פורטו', 'Porto': 'פורטו', 'Sevilla': 'סביליה', 'Real Betis': 'ריאל בטיס', 'Athletic Club': 'אתלטיק בילבאו',
  'Bayern Munich': 'באיירן מינכן', 'Borussia Dortmund': 'בורוסיה דורטמונד', 'Napoli': 'נאפולי', 'AS Roma': 'רומא', 'Roma': 'רומא',
  'Lazio': 'לאציו', 'Atalanta': 'אטאלנטה', 'Fiorentina': 'פיורנטינה', 'Marseille': 'מארסיי', 'Lille': 'ליל', 'Rennes': 'רן',
  'Monaco': 'מונאקו', 'Club Brugge KV': "קלאב ברוז'", 'Club Brugge': "קלאב ברוז'", 'Anderlecht': 'אנדרלכט', 'KRC Genk': 'גנק', 'Genk': 'גנק',
  'Red Bull Salzburg': 'זלצבורג', 'Rapid Vienna': 'ראפיד וינה', 'Sturm Graz': 'שטורם גרץ', 'LASK': 'לאסק', 'FC Basel 1893': 'באזל', 'Basel': 'באזל',
  'Servette FC': 'סרווט', 'Shakhtar Donetsk': 'שחטאר דונייצק', 'Dynamo Kyiv': 'דינמו קייב', 'Red Star Belgrade': 'הכוכב האדום בלגרד',
  'FK Partizan': 'פרטיזן', 'Ludogorets': 'לודוגורץ', 'CSKA Sofia': 'צסק"א סופיה', 'Fenerbahce': "פנרבחצ'ה", 'Galatasaray': 'גלאטסראיי',
  'Trabzonspor': 'טרבזונספור', 'Molde': 'מולדה', 'Rosenborg': 'רוזנבורג', 'FC Midtjylland': 'מידטיולנד', 'FC Copenhagen': 'קופנהגן',
  'Legia Warszawa': 'לגיה ורשה', 'Rakow': 'ראקוב', 'AEK Athens FC': 'אא"ק אתונה', 'AEK Athens': 'אא"ק אתונה',
  'Panathinaikos': 'פנאתינייקוס', 'Aris': 'אריס', 'Union St. Gilloise': 'יוניון סן ז׳ילואז', 'Olympiacos Piraeus': 'אולימפיאקוס',
  'Sparta Rotterdam': 'ספרטה רוטרדם', 'NEC Nijmegen': 'נ.א.צ ניימיכן', 'Sparta CZ': 'ספרטה פראג',
  // Second batch — recognizable clubs from the remaining list
  'AEK Larnaca': 'אא"ק לרנקה', 'Anorthosis': 'אנורתוסיס', 'Apoel Nicosia': 'אפוא"ל ניקוסיה',
  'Apollon Limassol': 'אפולון לימסול', 'Aris Thessalonikis': 'אריס סלוניקי', 'Aston Villa': 'אסטון וילה',
  'Aarhus': 'אארהוס', 'Başakşehir': 'איסטנבול באשאקשהיר', 'Bologna': 'בולוניה', 'Botev Plovdiv': 'בוטב פלובדיב',
  'Breidablik': 'ברידבליק', 'Budapest Honved': 'הונבד בודפשט', 'Cherno More Varna': "צ'רנו מורה ורנה",
  'Dinamo Brest': 'דינמו ברסט', 'Dinamo Minsk': 'דינמו מינסק', 'Dinamo Tbilisi': 'דינמו טביליסי', 'Drita': 'דריטה',
  'FC Astana': 'אסטנה', 'FC Rostov': 'רוסטוב', 'FC Thun': 'תון', 'Fenerbahçe': "פנרבחצ'ה", 'Ferencvarosi TC': 'פרנצווארוש',
  'Floriana': 'פלוריאנה', 'GKS Katowice': 'ג.ק.ס קטוביץ', 'Gorica': 'גוריצה', 'Gornik Zabrze': "גורניק זברז'ה",
  'Gyori ETO FC': "ג'ורי אטו", 'HJK Helsinki': 'הלסינקי', 'Heart Of Midlothian': 'הארטס', 'IFK Norrkoping': "נורצ'פינג",
  'Laci': "לאצ'י", 'Lask Linz': 'לאסק לינץ', 'Maribor': 'מריבור', 'Mlada Boleslav': 'מלדה בולסלב', 'Mura': 'מורה',
  'Panionios': 'פניוניוס', 'Pyunik Yerevan': 'פיוניק ירוואן', 'Radnicki NIS': "רדניצ'קי ניש", 'Raków Częstochowa': "ראקוב צ'נסטוחובה",
  'Real Sociedad': 'ריאל סוסיאדד', 'SC Freiburg': 'פרייבורג', 'SCR Altach': 'אלטאך', 'Sarpsborg 08 FF': 'סרפסבורג',
  'Shakhter Karagandy': 'שחטר קרגנדי', 'Sivasspor': 'סיוואסספור', 'Sloboda Tuzla': 'סלובודה טוזלה', 'Spartak Trnava': 'ספרטק טרנאבה',
  'Strasbourg': 'שטרסבורג', 'Teuta Durrës': 'טאוטה', 'The New Saints': 'הניו סיינטס', 'Tirana': 'טירנה',
  'Torpedo Zhodino': "טורפדו ז'ודינו", 'Tottenham': 'טוטנהאם', 'Union Berlin': 'אוניון ברלין', 'Vardar Skopje': 'ורדאר סקופיה',
  'VfB Stuttgart': 'שטוטגרט', 'Zeljeznicar Sarajevo': "ז'לייזניצ'אר סרייבו", 'Zira': 'זירה', 'Zorya Luhansk': 'זוריה לוהאנסק',
  'Alashkert': 'אלשקרט', 'AS Trencin': "טרנצ'ין", 'Pandurii TG JIU': 'פנדורי', 'Egnatia Rrogozhinë': 'אגנטיה',
  'Borac Banja Luka': 'בוראץ באניה לוקה', 'Mjallby AIF': 'מיאלבי', 'Maribor NK': 'מריבור', 'Chikhura Sachkhere': "צ'יחורה",
};

async function main() {
  console.log(`=== translate-foreign-teams ${EXECUTE ? '(EXECUTE)' : '(DRY)'} ===`);
  let updated = 0;
  const missing = new Set();
  // all teams that appear in a European game
  const games = await prisma.game.findMany({ where: { competition: { apiFootballId: { in: [2, 3, 848] } } }, select: { homeTeamId: true, awayTeamId: true } });
  const teamIds = new Set();
  games.forEach((g) => { teamIds.add(g.homeTeamId); teamIds.add(g.awayTeamId); });
  const teams = await prisma.team.findMany({ where: { id: { in: [...teamIds] } }, select: { id: true, nameEn: true, nameHe: true } });
  const seen = new Set();
  for (const t of teams) {
    const stillEnglish = !t.nameHe || t.nameHe === t.nameEn || /[A-Za-z]/.test(t.nameHe);
    if (!stillEnglish) continue;
    const he = EN_TO_HE[t.nameEn];
    if (!he) { missing.add(t.nameEn); continue; }
    if (!seen.has(t.nameEn)) { console.log(`  ${t.nameEn} → ${he}`); seen.add(t.nameEn); }
    if (EXECUTE) await prisma.team.update({ where: { id: t.id }, data: { nameHe: he } }).catch(() => {});
    updated++;
  }
  console.log(`\n${EXECUTE ? 'Updated' : 'Would update'} ${updated} team records (${seen.size} distinct clubs).`);
  console.log(`Still English (not in map): ${missing.size} distinct — e.g. ${[...missing].slice(0, 20).join(', ')}`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error('FATAL', e.message); await prisma.$disconnect(); process.exit(1); });
