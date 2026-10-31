// Referee crews of Be'er Sheva's Leumit 2007/08 rounds 23-32 from the owner's screenshots of IFA game pages,
// and a check of the scorers they show against the book's (the book decides; only reported).
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2007';
const C={23:['זטמה חלים','בדארנה מוסטפא','איזנברג נועם','מרקוס אלון'],24:['כהן יוסי','קודיש שוקי','ברקוביץ ארז','עמר ניר'],
25:['בן יצחק רמי','דוד קובי','ממן אייל','ריינשרייבר רועי'],26:['כהן אשר','לייכט רן','ביטון דודו','ביטון ניסים'],
27:['רקוטש יעקב','צוקרמן אורן','שטנגל אסף','זילברמן שירן'],28:['והבי אלי','מטרני ארז','ויינטראוב יורי','מרקוס אלון'],
29:['יפת אלון','נחמיאס שבתאי','דוידי ניסן','גרינפלד אוראל'],30:['לנקרי שי','גולדשטיין אבי','חסן רועי','ברגר גיא'],
31:['משיח מנשה','דוידי ניסן','מוזס עמיחי','מרקוס אלון'],32:['יפת אלון','חתוכה אייל','גרינברג איתן','ביטון ניסים']};
const IFA_GOALS={23:'מקאסי סעיד 33',27:'בדש ברק 45',29:'סימיוני לאנדרו 61',30:'סימיוני לאנדרו 20(פ)',31:'ניסים אורן 39, פדידה חגן 66, מקאסי סעיד 87',32:'סימיוני לאנדרו 59(פ)',33:'שימול רותם 44 | סימיוני לאנדרו 2, פדידה חגן 82'};
const norm=s=>String(s||'').replace(/[-\s]+/g,' ').trim().split(' ').sort().join(' ');
(async()=>{
 const BS='cmpidi2g00bxfop2xawcded5t';
 const g=await p.game.findMany({where:{competitionId:'comp_liga_leumit',season:{year:2007},OR:[{homeTeamId:BS},{awayTeamId:BS}]},select:{id:true,roundNameHe:true,roundNameEn:true,refereeHe:true,events:{select:{type:true,minute:true,participantName:true},orderBy:{minute:'asc'}}}});
 const rn=o=>+String(o.roundNameHe||o.roundNameEn).replace(/\D/g,'');
 const batchId=`${SOURCE}-referees-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(let r=23;r<=33;r++){
  const x=g.find(y=>rn(y)===r);if(!x){console.log(r,'NO GAME');continue}
  const goals=x.events.filter(e=>/GOAL/.test(e.type)).map(e=>`${e.participantName} ${e.minute}${e.type==='PENALTY_GOAL'?'(פ)':e.type==='OWN_GOAL'?'(ע)':''}`).join(', ');
  console.log(r,'| book:',goals||'—','| ifa:',IFA_GOALS[r]||'—');
  const c=C[r];if(!c)continue;
  const crew=`${c[0]} (שופט ראשי), ${c[1]} (עוזר שופט 1), ${c[2]} (עוזר שופט 2), ${c[3]} (שופט רביעי)`;
  const ok=!x.refereeHe||norm(x.refereeHe)===norm(c[0])||(r===28&&x.refereeHe==='אלי ווהבי');
  console.log('   ',ok?'OK  ':'SKIP',x.refereeHe,'→',c[0]);
  if(APPLY&&ok)await p.$transaction([p.game.update({where:{id:x.id},data:{refereeHe:crew}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:x.id,field:'refereeHe',oldValue:x.refereeHe??undefined,newValue:crew,basis:'referee-crew',sourceRef:'ifa-screenshot-r'+r}})]);
 }
 await p.$disconnect();
})();
