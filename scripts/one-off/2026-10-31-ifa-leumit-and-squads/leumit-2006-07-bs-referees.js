// Full referee crews of Be'er Sheva's Leumit 2006/07 rounds 23-33, from the owner's screenshots of IFA game pages.
// Our games held only the main referee; the crew replaces it in IFA's format when the main referee agrees.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2006';
const C={23:['בן יצחק רמי','אלדדא מוחמד','אלקיעאן חאמד','זילברמן שירן'],24:['גורן אבי','בניטה שלומי','ממן אייל','אסולין לילך'],
25:['משיח מנשה','חתוכה אייל','אוצ\'ניק דן','ועקנין אילן'],26:['כהן יוסי','צוקרמן אורן','ממן אייל','אבו זעילה אברהים'],
27:['לנקרי שי','להב ברק','אדי ליעוז','רקוטש יעקב'],28:['יונה יונה','אבוחרמה סאלם','אלקיעאן חאמד','אמסלם אברהם'],
29:['יפת אלון','מוזס עמיחי','גרינברג איתן','שמואלביץ איתן'],31:['שטרית שי','בניטה שלומי','יעקובוב מתי','ביטון ניסים'],
32:['בר נתן דניאל','ביטון דודו','כהן יצחק','אבו זעילה אברהים'],33:['אסולין לילך','שמול אלירן','ירקוני עידן','אהרון עמית']};
const norm=s=>String(s||'').replace(/[-\s]+/g,' ').trim().split(' ').sort().join(' ');
(async()=>{
 const bs=(await p.team.findMany({where:{OR:[{apiFootballId:563},{nameHe:'הפועל באר שבע'}]},select:{id:true}})).map(t=>t.id);
 const g=await p.game.findMany({where:{competitionId:'comp_liga_leumit',season:{year:2006},OR:[{homeTeamId:{in:bs}},{awayTeamId:{in:bs}}]},select:{id:true,roundNameHe:true,roundNameEn:true,refereeHe:true}});
 const batchId=`${SOURCE}-referees-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(const [r,c] of Object.entries(C)){
  const x=g.find(y=>+String(y.roundNameHe||y.roundNameEn).replace(/\D/g,'')===+r);
  const main=c[0]==='אסולין לילך'?'שופטת ראשית':'שופט ראשי';
  const crew=`${c[0]} (${main}), ${c[1]} (עוזר שופט 1), ${c[2]} (עוזר שופט 2), ${c[3]} (${c[3]==='אסולין לילך'?'שופטת רביעית':'שופט רביעי'})`;
  const ok=x&&norm(x.refereeHe)===norm(c[0]);
  console.log(r,ok?'OK ':'SKIP',x?.refereeHe,'→',crew);
  if(APPLY&&ok) await p.$transaction([p.game.update({where:{id:x.id},data:{refereeHe:crew}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:x.id,field:'refereeHe',oldValue:x.refereeHe,newValue:crew,basis:'referee-crew',sourceRef:'ifa-screenshot-r'+r}})]);
 }
 await p.$disconnect();
})();
