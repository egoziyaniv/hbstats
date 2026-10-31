// IFA photos of Be'er Sheva's 2003/04-2005/06 squads, from the owner's saved team pages; only where a player has none.
const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
const APPLY=process.argv.includes('--apply');const SOURCE='ifa-squads-bs';
const map=require('./bs-squad-photos-map.json');
(async()=>{
 const batchId=`${SOURCE}-photos-${new Date().toISOString().replace(/[:.]/g,'-')}`;let n=0,has=0,miss=0;
 for(const m of map){
  const pls=await p.player.findMany({where:{team:{season:{year:m.year},OR:[{apiFootballId:563},{nameHe:'הפועל באר שבע'}]},additionalInfo:{path:['ifaPlayerId'],equals:m.ifaId}},select:{id:true,photoUrl:true}});
  if(!pls.length){miss++;continue}
  for(const pl of pls){if(pl.photoUrl){has++;continue}n++;
   if(APPLY)await p.$transaction([p.player.update({where:{id:pl.id},data:{photoUrl:m.url}}),p.dataImportChange.create({data:{source:SOURCE,batchId,table:'players',recordId:pl.id,field:'photoUrl',newValue:m.url,basis:'ifa-squad-photo'}})]);}
 }
 console.log(`${APPLY?'APPLY':'DRY RUN'} photos ${map.length}: set ${n}, already had a photo ${has}, no player ${miss}`);await p.$disconnect();
})();
