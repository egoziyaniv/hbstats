jest.mock('@/lib/prisma', () => ({__esModule:true,default:{}}));
import prisma from '@/lib/prisma';
import { executeMerge, rollbackMerge } from '@/lib/merge-engine';

function setup(failSnapshot = false) {
  let events: any[] = [], lineups: any[] = [];
  let merge: any = {id:'m',status:'approved',previewJson:{changes:[{entity:'game',type:'update',matchedId:'g',scrapedName:'match',fields:{_events:{new:true},_lineups:{new:true}},meta:{sourceId:'source',homeTeamId:'A',awayTeamId:'B'}}]}};
  const model = (kind: 'event'|'lineup') => ({
    create: jest.fn(async ({data}:any)=>{const row={id:kind+'-1',...data};(kind==='event'?events:lineups).push(row);return row;}),
    count: jest.fn(async()=> (kind==='event'?events:lineups).length),
    deleteMany: jest.fn(async({where}:any)=>{const rows=kind==='event'?events:lineups;const kept=rows.filter(r=>!Object.entries(where).every(([k,v])=>r[k]===v));const count=rows.length-kept.length;if(kind==='event')events=kept;else lineups=kept;return {count};}),
  });
  Object.assign(prisma, {
    game:{findUnique:jest.fn(async()=>({id:'g'}))},
    player:{findMany:jest.fn(async()=>[])},
    gameEvent:model('event'),gameLineupEntry:model('lineup'),
    scrapedMatchEvent:{findMany:jest.fn(async()=>[{type:'goal',minute:10,teamSide:'home',teamName:'A',playerName:'p',secondPlayerName:null}])},
    scrapedMatchLineup:{findMany:jest.fn(async()=>[{role:'starter',teamSide:'home',playerName:'p',playerNumber:9,positionMarker:null}])},
    mergeOperation:{
      updateMany:jest.fn(async()=>{merge.status='executing';return {count:1};}),
      findUnique:jest.fn(async()=>merge),
      update:jest.fn(async({data}:any)=>{if(failSnapshot&&data.snapshotJson)throw Error('snapshot write failed');merge={...merge,...JSON.parse(JSON.stringify(data))};return merge;}),
    },
    $transaction:jest.fn(async(fn:any)=>{const before=JSON.stringify({events,lineups,merge});try{return await fn(prisma);}catch(e){({events,lineups,merge}=JSON.parse(before));throw e;}}),
  });
  return {events:()=>events,lineups:()=>lineups,merge:()=>merge,addLater:()=>{events.push({id:'later-event',gameId:'g'});lineups.push({id:'later-lineup',gameId:'g'});}};
}

it('rolls back only the children created by the merge, preserving later additions',async()=>{
 const state=setup();await executeMerge('m');state.addLater();
 await rollbackMerge('m');
 expect(state.events().map(r=>r.id)).toEqual(['later-event']);
 expect(state.lineups().map(r=>r.id)).toEqual(['later-lineup']);
});
it('does not delete an imported child edited after the merge',async()=>{
 const state=setup();await executeMerge('m');state.events()[0].minute=20;
 const result=await rollbackMerge('m');
 expect(state.events()).toHaveLength(1);
 expect(result.errors.length).toBeGreaterThan(0);
});
it('does not commit imported children when their rollback snapshot cannot be persisted',async()=>{
 const state=setup(true);await executeMerge('m').catch(()=>null);
 expect(state.events()).toHaveLength(0);
 expect(state.lineups()).toHaveLength(0);
});
it('does not cascade-delete a newly created game when a later child remains',async()=>{
 const state=setup();
 (prisma.mergeOperation.findUnique as jest.Mock).mockResolvedValue({status:'executed',snapshotJson:{snapshots:[{id:'g',entity:'game',action:'create',original:{}}]}});
 (prisma.game as any).delete=jest.fn(async()=>{throw Error('unsafe cascade');});
 (prisma.game as any).deleteMany=jest.fn(async({where}:any)=>{
   expect(where.events).toEqual({none:{}});
   expect(where.lineupEntries).toEqual({none:{}});
   return {count:0};
 });
 const result=await rollbackMerge('m');
 expect(prisma.game.delete).not.toHaveBeenCalled();
 expect((prisma.game as any).deleteMany).toHaveBeenCalled();
 expect(result.errors).toHaveLength(1);
});
