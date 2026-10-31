// Liga Leumit 2006/07 table from its 198 games (IFA), with IFA's deductions: Be'er Sheva -1, Hapoel Jerusalem -2.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-leumit-2006';
const DED={'הפועל באר שבע':[-1,'הופחתה נקודה אחת'],'הפועל ירושלים':[-2,'הופחתו 2 נקודות']};
(async()=>{
 const st=await p.standing.findMany({where:{competitionId:'comp_liga_leumit',season:{year:2006}},include:{team:{select:{nameHe:true}}}});
 const g=await p.game.findMany({where:{competitionId:'comp_liga_leumit',seasonId:st[0].seasonId,homeScore:{not:null}}});
 if(g.length!==198) throw new Error('games '+g.length);
 const t={};for(const s of st)t[s.teamId]={played:0,wins:0,draws:0,losses:0,goalsFor:0,goalsAgainst:0,points:0};
 for(const x of g)for(const [id,f,a] of [[x.homeTeamId,x.homeScore,x.awayScore],[x.awayTeamId,x.awayScore,x.homeScore]]){const r=t[id];if(!r)throw new Error('team not in table '+id);r.played++;r.goalsFor+=f;r.goalsAgainst+=a;if(f>a){r.wins++;r.points+=3}else if(f<a)r.losses++;else{r.draws++;r.points++}}
 const rows=st.map(s=>{const d=DED[s.team.nameHe]||[0,null];return {s,data:{...t[s.teamId],goalsDiff:t[s.teamId].goalsFor-t[s.teamId].goalsAgainst,pointsAdjustment:d[0],pointsAdjustmentNoteHe:d[1]}}});
 rows.sort((a,b)=>(b.data.points+b.data.pointsAdjustment)-(a.data.points+a.data.pointsAdjustment)||b.data.goalsDiff-a.data.goalsDiff||b.data.goalsFor-a.data.goalsFor);
 rows.forEach((r,i)=>r.data.position=i+1);
 for(const r of rows) console.log(String(r.data.position).padStart(2),r.s.team.nameHe.padEnd(22),r.data.played,`${r.data.wins}-${r.data.draws}-${r.data.losses}`,`${r.data.goalsFor}:${r.data.goalsAgainst}`,r.data.points+r.data.pointsAdjustment,'| was',r.s.position,`${r.s.goalsFor}:${r.s.goalsAgainst}`,r.s.points+r.s.pointsAdjustment);
 if(!APPLY)return p.$disconnect();
 const batchId=`${SOURCE}-table-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(const r of rows){const ch=Object.keys(r.data).filter(k=>r.s[k]!==r.data[k]);if(!ch.length)continue;
  await p.$transaction([p.standing.update({where:{id:r.s.id},data:r.data}),p.dataImportChange.createMany({data:ch.map(k=>({source:SOURCE,batchId,table:'standings',recordId:r.s.id,field:k,oldValue:r.s[k]??undefined,newValue:r.data[k]??undefined,basis:'from-games'}))})]);}
 console.log('done',batchId);await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
