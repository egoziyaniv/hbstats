// 2019-20 Ligat Ha'Al: the stored table stopped at round 35 of the play-off; the three
// round-36 games are in the DB. Add them to the six championship rows, and give the three
// API-Football games with no round their round. Ledger: source eyal-archive, basis book-table-fix.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');
(async()=>{
 const batchId=`eyal-archive-table-fix-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 const last=await p.game.findMany({where:{competitionId:'comp_liga_haal',season:{year:2019},dateTime:{gte:new Date('2020-07-07'),lt:new Date('2020-07-08')}}});
 const rounds={331856:'Championship Round - 8',331853:'Championship Round - 9',331858:'Championship Round - 10'};
 const ch=[];
 for(const [api,r] of Object.entries(rounds)){const g=await p.game.findFirst({where:{apiFootballId:+api}});if(!g.roundNameEn)ch.push({table:'games',id:g.id,data:{roundNameEn:r},old:{roundNameEn:null}});}
 for(const g of last){
  for(const side of ['home','away']){
   const teamId=g[side+'TeamId'];const f=side==='home'?g.homeScore:g.awayScore;const a=side==='home'?g.awayScore:g.homeScore;
   const s=await p.standing.findFirst({where:{teamId,competitionId:'comp_liga_haal',seasonId:g.seasonId}});
   if(s.played!==35){console.log('skip',teamId,s.played);continue;}
   const data={played:36,goalsFor:s.goalsFor+f,goalsAgainst:s.goalsAgainst+a,goalsDiff:s.goalsFor+f-s.goalsAgainst-a,
     wins:s.wins+(f>a?1:0),draws:s.draws+(f===a?1:0),losses:s.losses+(f<a?1:0),points:s.points+(f>a?3:f===a?1:0)};
   const old=Object.fromEntries(Object.keys(data).map(k=>[k,s[k]]));
   ch.push({table:'standings',id:s.id,data,old});
  }
 }
 for(const c of ch) console.log(c.table,c.id,JSON.stringify(c.old),'→',JSON.stringify(c.data));
 if(!APPLY){console.log('dry run');return p.$disconnect();}
 for(const c of ch){
  const model=c.table==='games'?p.game:p.standing;
  await p.$transaction([model.update({where:{id:c.id},data:c.data}),p.dataImportChange.createMany({data:Object.keys(c.data).map(k=>({source:'eyal-archive',batchId,table:c.table,recordId:c.id,field:k,oldValue:c.old[k]??undefined,newValue:c.data[k],basis:'book-table-fix',sourceRef:'2019-20 round 36'}))})]);
 }
 console.log('applied',ch.length,batchId);await p.$disconnect();
})();
