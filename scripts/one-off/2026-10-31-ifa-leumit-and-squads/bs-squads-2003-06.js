// Be'er Sheva squads 2003/04-2005/06 from IFA team pages the owner saved (docs/2003-4 ... 2005-6).
// A squad name that is a player we hold that season (the archive's scorers) gets IFA's id; the rest are created.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-squads-bs';
const squads=require('./bs-squads-2003-06.json');
// Same man, spellings too far apart for the rule above (checked by hand).
const MANUAL={'רמיגיוס יזרסקי':"רמיק יז'רסקי",'דרקו דוגיץ':"דרקו ג'וקיץ'"};
const YEAR={'2003-4':2003,'2004-5':2004,'2005-6':2005};
// "/זר/ וייס מירוסלב" (foreigner, surname first) → "מירוסלב וייס"; "דרקו - זר דוגיץ", "רוגריו זר דה אוליביריה" → drop the marker.
function clean(n){n=n.trim();if(n.startsWith('/זר/')){const w=n.replace('/זר/','').trim().split(' ');return w.length===2?w[1]+' '+w[0]:w.join(' ')}return n.replace(/\s*-\s*זר\s*/,' ').replace(/ זר /,' ').replace(/\s+/g,' ').trim()}
// Spelling-tolerant: within one season's squad only (the squad-scoped rule), so a close name is the same man.
const toks=s=>String(s||'').replace(/['"׳״]/g,'').replace(/-/g,' ').replace(/\s+/g,' ').trim().split(' ').filter(Boolean);
const skel=t=>t.replace(/[אויה]/g,'').replace(/(.)\1+/g,'$1');
function dist(a,b){const d=Array.from({length:a.length+1},(_,i)=>[i,...Array(b.length).fill(0)]);for(let j=1;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));return d[a.length][b.length]}
const tokOk=(x,y)=>x===y||skel(x)===skel(y)||(skel(x).length>=3&&dist(skel(x),skel(y))<=1);
// every token of the shorter name has a close token in the longer one, and at least two tokens agree
function same(a,b){const A=toks(a),B=toks(b);const [S,L]=A.length<=B.length?[A,B]:[B,A];const used=new Set();let n=0;for(const t of S){const k=L.findIndex((u,i)=>!used.has(i)&&tokOk(t,u));if(k<0)return false;used.add(k);n++}return n>=2}
(async()=>{
 const batchId=`${SOURCE}-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(const [label,list] of Object.entries(squads)){
  const y=YEAR[label];
  const teams=await p.team.findMany({where:{season:{year:y},OR:[{apiFootballId:563},{nameHe:'הפועל באר שבע'}]},select:{id:true,seasonId:true,players:{select:{id:true,nameHe:true,additionalInfo:true}}}});
  const team=teams.sort((a,b)=>b.players.length-a.players.length)[0];
  const matched=[],create=[];const taken=new Set();
  for(const [ifaId,raw] of Object.entries(list)){const name=clean(raw);const hits=team.players.filter(pl=>!taken.has(pl.id)&&(same(pl.nameHe,name)||MANUAL[name]===pl.nameHe));
   if(hits.length===1){taken.add(hits[0].id);matched.push({pl:hits[0],ifaId,name})}else create.push({ifaId,name,amb:hits.length>1})}
  const unmatchedOurs=team.players.filter(pl=>!matched.some(m=>m.pl.id===pl.id)).map(pl=>pl.nameHe);
  console.log(`${label}: team rows ${teams.length}, ours ${team.players.length}, squad ${Object.keys(list).length} → matched ${matched.length}, new ${create.length}; ours not in squad: ${unmatchedOurs.join(', ')||'—'}`);
  console.log('   pairs:',matched.filter(m=>m.pl.nameHe!==m.name).map(m=>m.pl.nameHe+' = '+m.name).join(' | '));
  console.log('   new:',create.map(c=>c.name+(c.amb?' (AMBIGUOUS)':'')).join(', '));
  if(!APPLY)continue;
  for(const m of matched){const info=m.pl.additionalInfo&&typeof m.pl.additionalInfo==='object'?m.pl.additionalInfo:{};const nv={...info,ifaPlayerId:Number(m.ifaId),sources:[...new Set([...(info.sources||[]),SOURCE])]};
   await p.$transaction([p.player.update({where:{id:m.pl.id},data:{additionalInfo:nv}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'players',recordId:m.pl.id,field:'additionalInfo',oldValue:m.pl.additionalInfo??undefined,newValue:nv,basis:'ifa-squad'}})]);}
  for(const c of create){const sp=c.name.indexOf(' ');const data={teamId:team.id,nameHe:c.name,nameEn:c.name,...(sp>0?{firstNameHe:c.name.slice(0,sp),lastNameHe:c.name.slice(sp+1)}:{}),additionalInfo:{sources:[SOURCE],ifaPlayerId:Number(c.ifaId)}};
   const pl=await p.player.create({data,select:{id:true}});
   await p.dataImportChange.create({data:{source:SOURCE,batchId,table:'players',recordId:pl.id,field:'*created*',newValue:data,basis:'ifa-squad'}});}
 }
 console.log(APPLY?'done '+batchId:'dry run');await p.$disconnect();
})().catch(e=>{console.error(e);process.exit(1)});
