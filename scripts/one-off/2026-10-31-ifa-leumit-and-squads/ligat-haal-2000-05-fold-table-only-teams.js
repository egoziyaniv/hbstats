// Ligat Ha'Al 2000-05: a club held twice in a season — one team row has its games (Hebrew name),
// the other its table row (English name, no games). The table row moves to the team with the games,
// which takes the English name; the empty row is removed. Ledger source 'team-fold' (rollback.js --source team-fold).
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='team-fold';
const PAIRS=[ // [games team, table team]
 ['cmpif336m0005wyvd1i089bpk','cmpif2s5e0010l5qvm5kwclg0'],
 ['cmpif36vn000je0ghcinlvhf7','cmpif2vd0000s14kptzvl2b3o'],['cmpif36w9000pe0gh90cw0yns','cmpif2vea001414kp2gooz29n'],['cmpif36ur000be0ghme1wlok8','cmpif2vf4001c14kp5spdxjn3'],
 ['cmpif38180003x5lboegl8z5x','cmpif2vxj000cqrz6i13iuy9y'],['cmpif3840000lx5lb6i48tkk1','cmpif2w0w0014qrz68jolphq8'],['cmpif382p000bx5lbtukp5b32','cmpif2vyl000kqrz6ph72mnxt'],
 ['cmpif39ew000jlwtm506pn8sc','cmpif2wlh000w5cmi6nrmpwwh'],['cmpif39bz0003lwtmchjoqhod','cmpif2wno001c5cmiv0ik1x24'],['cmpif39ee000flwtmteq4fw6b','cmpif2wn700185cmipm7476m1'],
];
const C={homeGames:true,awayGames:true,homeEvents:true,lineupEntries:true,players:true,standings:true,leaderboardEntries:true,fetchJobs:true,uploads:true,injuries:true,coachAssignments:true,teamStats:true,sofascoreStats:true,clubSeasonDossiers:true};
(async()=>{
 const batchId=`${SOURCE}-tablerows-${new Date().toISOString().replace(/[:.]/g,'-')}`;
 for(const [keepId,dropId] of PAIRS){
  const keep=await p.team.findUnique({where:{id:keepId},include:{_count:{select:C}}});
  const drop=await p.team.findUnique({where:{id:dropId},include:{_count:{select:C}}});
  const MOVABLE=['standings','homeGames','awayGames','homeEvents','lineupEntries'];const other=Object.entries(drop._count).filter(([k,v])=>v&&!MOVABLE.includes(k));
  const ok=keep.seasonId===drop.seasonId&&!other.length&&keep._count.standings===0;
  console.log(ok?'OK  ':'SKIP',keep.nameHe,'/',keep.nameEn,'<=',drop.nameHe,'| standings',drop._count.standings,other.length?JSON.stringify(other):'');
  if(!APPLY||!ok)continue;
  const sts=await p.standing.findMany({where:{teamId:dropId},select:{id:true}});
  const full=await p.team.findUnique({where:{id:dropId}});
  const gs=await p.game.findMany({where:{OR:[{homeTeamId:dropId},{awayTeamId:dropId}]},select:{id:true,homeTeamId:true}});
  const gu=gs.map(g=>({id:g.id,field:g.homeTeamId===dropId?'homeTeamId':'awayTeamId'}));
  const evs=await p.gameEvent.findMany({where:{teamId:dropId},select:{id:true}});
  const lus=await p.gameLineupEntry.findMany({where:{teamId:dropId},select:{id:true}});
  const nameEn=/[֐-׿]/.test(keep.nameEn)?drop.nameEn:keep.nameEn;
  await p.$transaction([
   ...sts.map(s=>p.standing.update({where:{id:s.id},data:{teamId:keepId}})),
   ...gu.map(u=>p.game.update({where:{id:u.id},data:{[u.field]:keepId}})),
   ...evs.map(e=>p.gameEvent.update({where:{id:e.id},data:{teamId:keepId}})),
   ...lus.map(l=>p.gameLineupEntry.update({where:{id:l.id},data:{teamId:keepId}})),
   p.dataImportChange.createMany({data:[
    ...sts.map(s=>({source:SOURCE,batchId,table:'standings',recordId:s.id,field:'teamId',oldValue:dropId,newValue:keepId,basis:'table-vs-games-twin'})),
    ...gu.map(u=>({source:SOURCE,batchId,table:'games',recordId:u.id,field:u.field,oldValue:dropId,newValue:keepId,basis:'table-vs-games-twin'})),
    ...evs.map(e=>({source:SOURCE,batchId,table:'game_events',recordId:e.id,field:'teamId',oldValue:dropId,newValue:keepId,basis:'table-vs-games-twin'})),
    ...lus.map(l=>({source:SOURCE,batchId,table:'game_lineup_entries',recordId:l.id,field:'teamId',oldValue:dropId,newValue:keepId,basis:'table-vs-games-twin'})),
    ...(nameEn!==keep.nameEn?[{source:SOURCE,batchId,table:'teams',recordId:keepId,field:'nameEn',oldValue:keep.nameEn,newValue:nameEn,basis:'table-vs-games-twin'}]:[]),
    {source:SOURCE,batchId,table:'teams',recordId:dropId,field:'*deleted*',oldValue:full,basis:'table-vs-games-twin'}]}),
   p.team.delete({where:{id:dropId}}),
   ...(nameEn!==keep.nameEn?[p.team.update({where:{id:keepId},data:{nameEn}})]:[]),
  ]);
 }
 console.log(APPLY?'done '+batchId:'dry run');await p.$disconnect();
})().catch(e=>{console.error(e.message);process.exit(1)});
