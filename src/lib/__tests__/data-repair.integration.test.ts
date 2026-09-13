import prisma from '@/lib/prisma';
import { executeMerge, rollbackMerge } from '@/lib/merge-engine';
import { recomputeStoredStandings } from '@/lib/standings-from-games';
import { buildGoalTimingForTeam } from '@/lib/goal-timing';
import { randomUUID } from 'crypto';

// Explicit opt-in, restricted to the disposable review database.
const enabled = process.env.STATSAI_DATA_INTEGRATION === '1';
const integration = enabled ? describe : describe.skip;
integration('data repair with PostgreSQL', () => {
  const suffix = randomUUID();
  let seasonId: string, competitionId: string, homeTeamId: string, awayTeamId: string;
  const mergeIds: string[] = [];
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/statsai_review') throw Error('Use the isolated statsai_review database');
    const season = await prisma.season.create({data:{year:100000+Math.floor(Math.random()*1000000000),name:suffix,startDate:new Date(),endDate:new Date()}});
    seasonId=season.id;
    const competition=await prisma.competition.create({data:{nameEn:suffix,nameHe:suffix}});competitionId=competition.id;
    const home=await prisma.team.create({data:{nameEn:'Home '+suffix,nameHe:'בית '+suffix,seasonId}});homeTeamId=home.id;
    const away=await prisma.team.create({data:{nameEn:'Away '+suffix,nameHe:'חוץ '+suffix,seasonId}});awayTeamId=away.id;
  });
  afterAll(async()=>{
    if (seasonId) {
      await prisma.game.deleteMany({where:{seasonId}});
      await prisma.season.delete({where:{id:seasonId}});
    }
    if (competitionId) await prisma.competition.delete({where:{id:competitionId}});
    await prisma.mergeOperation.deleteMany({where:{id:{in:mergeIds}}});
    await prisma.scrapedMatchEvent.deleteMany({where:{matchSourceId:suffix}});
    await prisma.scrapedMatchLineup.deleteMany({where:{matchSourceId:suffix}});
    await prisma.$disconnect();
  });
  it('persists undo records with timestamps and removes only imported children',async()=>{
    const game=await prisma.game.create({data:{dateTime:new Date(),seasonId,competitionId,homeTeamId,awayTeamId}});
    await prisma.scrapedMatchEvent.create({data:{source:'footballOrgIl',matchSourceId:suffix,minute:10,type:'goal',playerName:'p',teamSide:'home'}});
    await prisma.scrapedMatchLineup.create({data:{source:'footballOrgIl',matchSourceId:suffix,role:'starter',playerName:'p',teamSide:'home'}});
    const merge=await prisma.mergeOperation.create({data:{source:'footballOrgIl',mergeType:'games',status:'approved',previewJson:{changes:[{entity:'game',type:'update',matchedId:game.id,scrapedName:suffix,fields:{_events:{new:true},_lineups:{new:true}},meta:{sourceId:suffix,homeTeamId,awayTeamId}}]}}});mergeIds.push(merge.id);
    expect(await executeMerge(merge.id)).toMatchObject({updated:1,errors:[]});
    expect(await prisma.gameEvent.count({where:{gameId:game.id}})).toBe(1);
    const later=await prisma.gameEvent.create({data:{gameId:game.id,minute:30,type:'GOAL',team:'later',teamId:homeTeamId}});
    expect(await rollbackMerge(merge.id)).toMatchObject({reverted:2,errors:[]});
    expect((await prisma.gameEvent.findMany({where:{gameId:game.id}})).map(e=>e.id)).toEqual([later.id]);
    expect(await prisma.gameLineupEntry.count({where:{gameId:game.id}})).toBe(0);
    await prisma.game.delete({where:{id:game.id}});
  });
  it('preserves a new game when later data would otherwise be cascaded away',async()=>{
    const merge=await prisma.mergeOperation.create({data:{source:'footballOrgIl',mergeType:'games',status:'approved',previewJson:{changes:[{entity:'game',type:'create',scrapedName:suffix,fields:{homeScore:{new:1},awayScore:{new:0}},meta:{sourceId:suffix,seasonId,competitionId,homeTeamId,awayTeamId,dateTime:new Date().toISOString()}}]}}});mergeIds.push(merge.id);
    expect(await executeMerge(merge.id)).toMatchObject({updated:1,errors:[]});
    const stored=await prisma.mergeOperation.findUniqueOrThrow({where:{id:merge.id}});
    const gameId=(stored.snapshotJson as any).snapshots.find((r:any)=>r.entity==='game').id;
    const later=await prisma.gameEvent.create({data:{gameId,minute:30,type:'GOAL',team:'later',teamId:homeTeamId}});
    const result=await rollbackMerge(merge.id);
    expect(result.errors).toHaveLength(1);
    expect(await prisma.game.findUnique({where:{id:gameId}})).not.toBeNull();
    expect((await prisma.gameEvent.findMany({where:{gameId}})).map(e=>e.id)).toEqual([later.id]);
    await prisma.game.delete({where:{id:gameId}});
  });
  it('removes a cancelled result from a complete table in the mutation transaction',async()=>{
    const game=await prisma.game.create({data:{dateTime:new Date(),seasonId,competitionId,homeTeamId,awayTeamId,status:'COMPLETED',homeScore:2,awayScore:0}});
    await prisma.standing.createMany({data:[{seasonId,competitionId,teamId:homeTeamId,position:1,played:1,wins:1,points:3},{seasonId,competitionId,teamId:awayTeamId,position:2,played:1,losses:1}]});
    await prisma.$transaction(async tx=>{
      await tx.game.update({where:{id:game.id},data:{status:'CANCELLED'}});
      expect(await recomputeStoredStandings(tx,seasonId,competitionId,game)).toBe(2);
    });
    expect((await prisma.standing.findMany({where:{seasonId}})).every(s=>s.played===0&&s.points===0)).toBe(true);
    await prisma.game.delete({where:{id:game.id}});
  });
  it('queries linked identities and credits own goals to the opponent',async()=>{
    const game=await prisma.game.create({data:{dateTime:new Date(),seasonId,competitionId,homeTeamId,awayTeamId}});
    await prisma.gameEvent.createMany({data:[{gameId:game.id,minute:10,type:'GOAL',team:'unrelated label',teamId:homeTeamId},{gameId:game.id,minute:10,type:'OWN_GOAL',team:'unrelated label',teamId:awayTeamId}]});
    expect((await buildGoalTimingForTeam(homeTeamId))[0]).toMatchObject({scored:2,conceded:0});
  });
});
