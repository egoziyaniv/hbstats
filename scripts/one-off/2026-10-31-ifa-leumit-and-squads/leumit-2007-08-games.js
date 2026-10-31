// Liga Leumit 2007/08: Nof HaGalil's old-name team row out of the league, the two duplicates it caused,
// and rounds 23-33 from the owner's screenshots of football.org.il. Ledger source 'ifa-leumit-2007'.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2007';
const late=require('./leumit-2007-r23-33.json');
const T={AMIDAR:'cmpidi2c80bwxop2x2qvkl443',PT:'cmpidi2dj0bx3op2xjyks8fpj',RAANANA:'cmpidi2ig0bxxop2xl8qaq2nc',HAIFA:'cmpidi2ej0bx9op2xua5dukma',BS:'cmpidi2g00bxfop2xawcded5t',LOD:'cmpidi2gs0bxlop2xl0mupgea',HRG:'cmpidi2ho0bxrop2xcwh867ql',RH:'cmpidi2j60by3op2x3s5n1ppe',AHI:'cmpidi2jy0by9op2xx43nhy93',AKKO:'cmpidi2ky0byfop2x66xqjr5z',RISHON:'cmpidi2m00bylop2xwenra3i6',NG:'cmpidi2n50byrop2xu8pjxmah'};
const DUPES=['cmvwe2f5b0006129y00nbitfo','cmvwe2fao002e129ybxzidvlz'];
const R33_REF='אדלר זיו (שופט ראשי), מחאג\'נה מחמוד (עוזר שופט 1), דוד קובי (עוזר שופט 2), פרמינגר רועי (שופט רביעי)';
(async()=>{
 const season=(await p.team.findUnique({where:{id:T.BS},select:{seasonId:true}})).seasonId;
 const ni=await p.team.findFirst({where:{seasonId:season,nameHe:'הפועל נצרת עילית'},select:{id:true}});
 let ours=await p.game.findMany({where:{seasonId:season,competitionId:'comp_liga_leumit'},select:{id:true,homeTeamId:true,awayTeamId:true,homeScore:true,awayScore:true,roundNameHe:true,roundNameEn:true,refereeHe:true,_count:{select:{events:true}}}});
 const dupes=ours.filter(g=>DUPES.includes(g.id));
 if(dupes.length!==2||dupes.some(d=>d._count.events)) throw new Error('dupes not as expected');
 ours=ours.filter(g=>!DUPES.includes(g.id));
 const move=[];for(const g of ours)for(const f of ['homeTeamId','awayTeamId'])if(g[f]===ni.id){move.push({id:g.id,field:f});g[f]=T.NG}
 const evs=await p.gameEvent.findMany({where:{teamId:ni.id,gameId:{in:move.map(m=>m.id)}},select:{id:true}});
 const rn=o=>+String(o.roundNameHe||o.roundNameEn||'').replace(/\D/g,'');
 const create=[],conflict=[];let held=0;
 for(const r of late){const h=T[r[2]],a=T[r[3]];const g=ours.find(o=>o.homeTeamId===h&&o.awayTeamId===a&&rn(o)===+r[0]);
  if(!g){create.push(r);continue}held++;if(g.homeScore!==r[4]||g.awayScore!==r[5])conflict.push(r.join(' ')+' ours '+g.homeScore+':'+g.awayScore)}
 // the table from all games, to compare with IFA's after round 33
 const all=[...ours.map(g=>[g.homeTeamId,g.awayTeamId,g.homeScore,g.awayScore]),...create.map(r=>[T[r[2]],T[r[3]],r[4],r[5]])];
 const t={};for(const [h,a,hs,as] of all)for(const [id,f,g] of [[h,hs,as],[a,as,hs]]){const x=t[id]=t[id]||{p:0,w:0,d:0,l:0,gf:0,ga:0,pts:0};x.p++;x.gf+=f;x.ga+=g;if(f>g){x.w++;x.pts+=3}else if(f<g)x.l++;else{x.d++;x.pts++}}
 const name=Object.fromEntries(Object.entries(T).map(([k,v])=>[v,k]));
 console.log(`${APPLY?'APPLY':'DRY RUN'} games ${all.length}; move NI→NG ${move.length} (+${evs.length} events), delete dupes 2, create ${create.length}, held ${held}, conflicts ${conflict.length}`);
 conflict.forEach(c=>console.log('  conflict',c));
 Object.entries(t).sort((a,b)=>b[1].pts-a[1].pts).forEach(([id,x])=>console.log(' ',(name[id]||id).padEnd(8),x.p,`${x.w}-${x.d}-${x.l}`,`${x.gf}:${x.ga}`,x.pts));
 if(!APPLY)return p.$disconnect();
 const batchId=`${SOURCE}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(const d of DUPES){await p.$transaction([p.dataImportChange.deleteMany({where:{recordId:d,field:'*created*'}}),p.game.delete({where:{id:d}})]);}
 for(const m of move)await p.$transaction([p.game.update({where:{id:m.id},data:{[m.field]:T.NG}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:m.id,field:m.field,oldValue:ni.id,newValue:T.NG,basis:'club-old-name'}})]);
 for(const e of evs)await p.$transaction([p.gameEvent.update({where:{id:e.id},data:{teamId:T.NG}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'game_events',recordId:e.id,field:'teamId',oldValue:ni.id,newValue:T.NG,basis:'club-old-name'}})]);
 for(const r of create){const data={seasonId:season,competitionId:'comp_liga_leumit',homeTeamId:T[r[2]],awayTeamId:T[r[3]],dateTime:new Date(r[1]+'T10:00:00.000Z'),homeScore:r[4],awayScore:r[5],status:'COMPLETED',statusShort:'FT',roundNameHe:`מחזור ${r[0]}`,venueNameHe:r[6],additionalInfo:{sources:['footballOrgIl'],ifaRef:'ifa-screenshot-r'+r[0]}};
  await p.$transaction(async tx=>{const g=await tx.game.create({data,select:{id:true}});await tx.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:g.id,field:'*created*',newValue:{...data,dateTime:data.dateTime.toISOString()},basis:'created',sourceRef:data.additionalInfo.ifaRef}})});}
 const r33=ours.find(o=>rn(o)===33&&(o.homeTeamId===T.BS||o.awayTeamId===T.BS));
 if(r33)await p.$transaction([p.game.update({where:{id:r33.id},data:{refereeHe:R33_REF}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:r33.id,field:'refereeHe',oldValue:r33.refereeHe??undefined,newValue:R33_REF,basis:'referee-crew',sourceRef:'ifa-screenshot-r33'}})]);
 console.log('done',batchId,'r33 referee was',r33?.refereeHe);await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
