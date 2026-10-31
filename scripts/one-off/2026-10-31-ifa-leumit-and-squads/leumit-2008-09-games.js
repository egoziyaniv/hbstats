// Liga Leumit 2008/09: rounds 23-33 from the owner's screenshots of football.org.il.
// and rounds 23-33 from the owner's screenshots of football.org.il. Ledger source 'ifa-leumit-2008'.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2008';
const late=require('./leumit-2008-r23-33.json');
const T={HAIFA:'cmpidjars0gzhop2xpqk1qc6h',HRG:'cmpidjave0h0dop2x9itco9xr',RAANANA:'cmpidjaxi0h0vop2x0es3lasr',HERZ:'cmpidjazj0h1jop2xfsj6s0jg',JER:'cmpidjb0t0h21op2xfcdlpjq0',KFS:'cmpidjb1t0h2dop2xtl4cvxa8',RH:'cmpidjb3t0h2vop2xo2h1m63z',AKKO:'cmpidjatd0gzrop2x3whpricd',BS:'cmpidjaug0h03op2xddaj789m',AHI:'cmpidjay20h11op2xnwlz1f2p',LOD:'cmpidjazx0h1pop2x7xqknw8v',ATA:'cmpidjb5s0h37op2xf9djjcvv'};
const DUPES=[];
const R33_REF='אדלר זיו (שופט ראשי), מחאג\'נה מחמוד (עוזר שופט 1), דוד קובי (עוזר שופט 2), פרמינגר רועי (שופט רביעי)';
(async()=>{
 const season=(await p.team.findUnique({where:{id:T.BS},select:{seasonId:true}})).seasonId;
 const ni={id:'none'};
 let ours=await p.game.findMany({where:{seasonId:season,competitionId:'comp_liga_leumit'},select:{id:true,homeTeamId:true,awayTeamId:true,homeScore:true,awayScore:true,roundNameHe:true,roundNameEn:true,refereeHe:true,_count:{select:{events:true}}}});
 const dupes=ours.filter(g=>DUPES.includes(g.id));
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
 for(const m of move)await p.$transaction([p.game.update({where:{id:m.id},data:{[m.field]:T.NG}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:m.id,field:m.field,oldValue:ni.id,newValue:T.NG,basis:'club-old-name'}})]);
 for(const e of evs)await p.$transaction([p.gameEvent.update({where:{id:e.id},data:{teamId:T.NG}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'game_events',recordId:e.id,field:'teamId',oldValue:ni.id,newValue:T.NG,basis:'club-old-name'}})]);
 for(const r of create){const data={seasonId:season,competitionId:'comp_liga_leumit',homeTeamId:T[r[2]],awayTeamId:T[r[3]],dateTime:new Date(r[1]+'T10:00:00.000Z'),homeScore:r[4],awayScore:r[5],status:'COMPLETED',statusShort:'FT',roundNameHe:`מחזור ${r[0]}`,venueNameHe:r[6],additionalInfo:{sources:['footballOrgIl'],ifaRef:'ifa-screenshot-r'+r[0]}};
  await p.$transaction(async tx=>{const g=await tx.game.create({data,select:{id:true}});await tx.dataImportChange.create({data:{source:SOURCE,batchId,table:'games',recordId:g.id,field:'*created*',newValue:{...data,dateTime:data.dateTime.toISOString()},basis:'created',sourceRef:data.additionalInfo.ifaRef}})});}
 console.log('done',batchId);await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
