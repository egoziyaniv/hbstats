// Liga Leumit 2006/07 from IFA: rounds 1-22 from scraped_matches (captured before Cloudflare),
// rounds 23-33 transcribed from the owner's screenshots of football.org.il. Missing games are
// created; a game we hold gets its referee when it has none. Ledger source 'ifa-leumit-2006'.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2006';
const late=require('./leumit-2006-r23-33.json');
const MAP={'הפועל ק"ש':'עירוני קריית שמונה','בני סכנין':'בני סכנין','הפועל חיפה':'הפועל חיפה','הפועל עכו':'הפועל עכו','הפועל רעננה':'הפועל רעננה',"הפ' נוף הגליל":'הפועל נוף הגליל','מכבי אחי נצרת':'מכבי אחי נצרת','הפועל ניר רמה"ש':'הפועל ניר רמת השרון',"הפ' בני לוד רכבת":'הפועל בני לוד','הפועל ע. אשקלון / לא פעיל':'הפועל אשקלון','הפועל ירושלים':'הפועל ירושלים','הפועל ב"ש':'הפועל באר שבע'};
(async()=>{
 const season=(await p.standing.findFirst({where:{competitionId:'comp_liga_leumit',season:{year:2006}},select:{seasonId:true}})).seasonId;
 const teams=await p.team.findMany({where:{seasonId:season,standings:{some:{competitionId:'comp_liga_leumit'}}},select:{id:true,nameHe:true}});
 const tid=Object.fromEntries(Object.entries(MAP).map(([k,v])=>[k,teams.find(t=>t.nameHe===v)?.id]));
 if(Object.values(tid).some(x=>!x)) throw new Error('team map '+JSON.stringify(tid));
 const sm=(await p.scrapedMatch.findMany({where:{source:'footballOrgIl',season:'2006/2007',framework:'league',leagueNameHe:null}})).filter(s=>MAP[s.homeTeamName]);
 const rows=[...sm.map(s=>({round:+s.round,date:s.dateTime,home:tid[s.homeTeamName],away:tid[s.awayTeamName],hs:s.homeScore,as:s.awayScore,venue:s.venue,referee:s.referee,ht:[s.homeHalfScore,s.awayHalfScore],ref:'ifa:'+s.sourceId})),
   ...late.map(r=>({round:+r[0],date:new Date(r[1]+'T10:00:00.000Z'),home:tid[r[2]],away:tid[r[3]],hs:r[4],as:r[5],venue:r[6],referee:null,ht:[null,null],ref:'ifa-screenshot-r'+r[0]}))];
 const ours=await p.game.findMany({where:{seasonId:season,competitionId:'comp_liga_leumit'},select:{id:true,homeTeamId:true,awayTeamId:true,homeScore:true,awayScore:true,refereeHe:true,dateTime:true,roundNameHe:true,roundNameEn:true}});
 // "הפועל נצרת עילית" is Nof HaGalil's old name — the archive made it a team of its own; its league games join the table's team.
 const NI='cmvw608ed00ou13py498i5qfs', NG=tid["הפ' נוף הגליל"];
 const moveTeam=[];
 for(const o of ours){for(const f of ['homeTeamId','awayTeamId']) if(o[f]===NI){moveTeam.push({id:o.id,field:f});o[f]=NG}}
 const evs=await p.gameEvent.findMany({where:{teamId:NI,gameId:{in:moveTeam.map(m=>m.id)}},select:{id:true}});
 console.log('games moved off the Nazareth Illit row',moveTeam.length,'events',evs.length);
 const create=[],refs=[],conflict=[];
 for(const r of rows){
  const rn=(o)=>+String(o.roundNameHe||o.roundNameEn||'').replace(/\D/g,'');
  const g=ours.find(o=>o.homeTeamId===r.home&&o.awayTeamId===r.away&&(rn(o)===r.round||o.dateTime.toISOString().slice(0,10)===r.date.toISOString().slice(0,10)));
  if(!g){create.push(r);continue}
  if(g.homeScore!==r.hs||g.awayScore!==r.as) conflict.push(`${r.round} ${g.id} ours ${g.homeScore}:${g.awayScore} ifa ${r.hs}:${r.as}`);
  else if(!g.refereeHe&&r.referee) refs.push({id:g.id,referee:r.referee,ref:r.ref});
 }
 console.log(`${APPLY?'APPLY':'DRY RUN'} rows ${rows.length}: create ${create.length}, referee ${refs.length}, score conflicts ${conflict.length}; total after ${ours.length+create.length}`);
 conflict.forEach(c=>console.log('  conflict',c));
 const used=new Set();for(const r of rows){const rn=(o)=>+String(o.roundNameHe||o.roundNameEn||'').replace(/\D/g,'');const g=ours.find(o=>o.homeTeamId===r.home&&o.awayTeamId===r.away&&(rn(o)===r.round||o.dateTime.toISOString().slice(0,10)===r.date.toISOString().slice(0,10)));if(g)used.add(g.id)}
 for(const o of ours.filter(o=>!used.has(o.id))){const tn=id=>(teams.find(t=>t.id===id)||{nameHe:'?'+id}).nameHe;const twin=rows.filter(r=>r.home===o.homeTeamId&&r.away===o.awayTeamId).map(r=>r.round+'@'+r.date.toISOString().slice(0,10)+' '+r.hs+':'+r.as);console.log('  unmatched ours',o.id,o.roundNameHe||o.roundNameEn,o.dateTime.toISOString().slice(0,10),tn(o.homeTeamId),o.homeScore+':'+o.awayScore,tn(o.awayTeamId),'| ifa',twin.join(', '))}
 if(!APPLY) return p.$disconnect();
 const batchId=`${SOURCE}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(const m of moveTeam) await p.$transaction([p.game.update({where:{id:m.id},data:{[m.field]:NG}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:m.id,field:m.field,oldValue:NI,newValue:NG,basis:'club-old-name'}})]);
 for(const e of evs) await p.$transaction([p.gameEvent.update({where:{id:e.id},data:{teamId:NG}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'game_events',recordId:e.id,field:'teamId',oldValue:NI,newValue:NG,basis:'club-old-name'}})]);
 for(const r of create){
  const data={seasonId:season,competitionId:'comp_liga_leumit',homeTeamId:r.home,awayTeamId:r.away,dateTime:r.date,homeScore:r.hs,awayScore:r.as,
  status:'COMPLETED',statusShort:'FT',roundNameHe:`מחזור ${r.round}`,
   ...(r.venue?{venueNameHe:r.venue}:{}),...(r.referee?{refereeHe:r.referee}:{}),additionalInfo:{sources:['footballOrgIl'],ifaRef:r.ref,...(r.ht[0]!=null?{halfTime:{home:r.ht[0],away:r.ht[1]}}:{})}};
  await p.$transaction(async tx=>{const g=await tx.game.create({data,select:{id:true}});
   await tx.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:g.id,field:'*created*',newValue:{...data,dateTime:data.dateTime.toISOString()},basis:'created',sourceRef:r.ref}});});
 }
 for(const r of refs) await p.$transaction([p.game.update({where:{id:r.id},data:{refereeHe:r.referee}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:r.id,field:'refereeHe',newValue:r.referee,basis:'fill-empty',sourceRef:r.ref}})]);
 console.log('done',batchId);await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
