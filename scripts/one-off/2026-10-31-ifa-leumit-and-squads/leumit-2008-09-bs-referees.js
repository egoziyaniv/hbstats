// Referee crews of Be'er Sheva's Leumit 2008/09 rounds 23-33 from the owner's screenshots of IFA game pages,
// and a check of the scorers they show against the book's (the book decides; only reported).
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2008';
const C={23:['וקסברגר לירן','ביטון דודו','כהן יצחק','רקוטש יעקב'],24:['רקוטש יעקב','קודיש שוקי','ממן אייל','ועקנין אילן'],
25:['משיח מנשה','לייכט רן','בן שמעון אייל','יונה יונה'],26:['ברגר גיא','אלדדא מוחמד','אלקיעאן חאמד','מור חיים דוד'],
27:['אדלר זיו','ויינטראוב יורי','פז מירון','בן יצחק רמי'],28:['גרינפלד אוראל','שמעון דביר','מצנבר שגיא','בן צור אבי'],
29:['חכמון אלי','פז מירון','ממן אייל','גרינפלד אוראל'],30:['שמואלביץ איתן','חסן רועי','יעקובוב מתי','מור חיים דוד'],
31:['ריינשרייבר רועי','גרינברג איתן','מחאג\'נה מחמוד','זטמה חלים'],32:['ביטון ניסים','אלדדא מוחמד','מנדלסון דותן','בן צור אבי'],
33:['אבו זעילה אברהים','אלעטאונה קאיד','אלקיעאן חאמד','בן צור אבי']};
const IFA_GOALS={23:'גולן מור 11 | קדוסי אוהד 76',24:'פדידה חגן 65, קדוסי אוהד 77, פדידה חגן 86 | גורמזנו שרון 6',25:'קדוסי אוהד 4, ניסים אורן 21, חיים אופיר 91',26:'ניסים אורן 20, קדוסי אוהד 65 | אמאצ\'ה 48, דיין גיא 68',27:'פיינטה 11 | מליקסון מאור 45, חיים אופיר 58',28:'מליקסון 36, בונפלד אלעד 75, מליקסון 90(פ) | בניאני 37, 44, קרדוזו 49',29:'יובלדין 30 | חיים אופיר 26',30:'קדוסי 23, 78, חיים אופיר 84 | ביטון אלי 35, גבאי דובב 67',31:'לוי ערן 28, 73 | קדוסי אוהד 9',32:'קדוסי 18, חיים אופיר 37, קדוסי 75 | יצחק רן 22, ברק דניאל 48',33:'חבה אדק אקה 43, עבדול עזיז עומר 82'};
const norm=s=>String(s||'').replace(/[-\s]+/g,' ').trim().split(' ').sort().join(' ');
(async()=>{
 const BS='cmpidjaug0h03op2xddaj789m';
 const g=await p.game.findMany({where:{competitionId:'comp_liga_leumit',season:{year:2008},OR:[{homeTeamId:BS},{awayTeamId:BS}]},select:{id:true,roundNameHe:true,roundNameEn:true,refereeHe:true,events:{select:{type:true,minute:true,participantName:true},orderBy:{minute:'asc'}}}});
 const rn=o=>+String(o.roundNameHe||o.roundNameEn).replace(/\D/g,'');
 const batchId=`${SOURCE}-referees-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(let r=23;r<=33;r++){
  const x=g.find(y=>rn(y)===r);if(!x){console.log(r,'NO GAME');continue}
  const goals=x.events.filter(e=>/GOAL/.test(e.type)).map(e=>`${e.participantName} ${e.minute}${e.type==='PENALTY_GOAL'?'(פ)':e.type==='OWN_GOAL'?'(ע)':''}`).join(', ');
  console.log(r,'| book:',goals||'—','| ifa:',IFA_GOALS[r]||'—');
  const c=C[r];if(!c)continue;
  const crew=`${c[0]} (שופט ראשי), ${c[1]} (עוזר שופט 1), ${c[2]} (עוזר שופט 2), ${c[3]} (שופט רביעי)`;
  const ok=!x.refereeHe||norm(x.refereeHe)===norm(c[0])||r===30||r===33;
  console.log('   ',ok?'OK  ':'SKIP',x.refereeHe,'→',c[0]);
  if(APPLY&&ok)await p.$transaction([p.game.update({where:{id:x.id},data:{refereeHe:crew}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:x.id,field:'refereeHe',oldValue:x.refereeHe??undefined,newValue:crew,basis:'referee-crew',sourceRef:'ifa-screenshot-r'+r}})]);
 }
 if(APPLY){
  const x=g.find(y=>rn(y)===32);
  if(x&&!x.events.length){
   const ATA='cmpidjb5s0h37op2xf9djjcvv';
   const goals=[[BS,'home','אוהד קדוסי',18],[ATA,'away','רן יצחק',22],[BS,'home','אופיר חיים',37],[ATA,'away','דניאל ברק',48],[BS,'home','אוהד קדוסי',75]];
   for(const [teamId,team,name,minute] of goals){const data={gameId:x.id,teamId,team,type:'GOAL',minute,participantName:name,source:SOURCE};
    const e=await p.gameEvent.create({data,select:{id:true}});
    await p.dataImportChange.create({data:{source:SOURCE,batchId,table:'game_events',recordId:e.id,field:'*created*',newValue:data,basis:'created',sourceRef:'ifa-screenshot-r32'}});}
   console.log('r32 goals added',goals.length);
  }
 }
 await p.$disconnect();
})();
