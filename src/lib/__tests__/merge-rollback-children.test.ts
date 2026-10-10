jest.mock('@/lib/prisma', () => ({__esModule:true,default:{}}));
import prisma from '@/lib/prisma';
import { executeMerge, rollbackMerge } from '@/lib/merge-engine';

function setup(failSnapshot = false) {
  let events: any[] = [], lineups: any[] = [];
  let merge: any = {id:'m',status:'approved',previewJson:{changes:[{entity:'game',type:'update',matchedId:'g',scrapedName:'match',fields:{_events:{new:true},_lineups:{new:true}},meta:{sourceId:'source',homeTeamId:'A',awayTeamId:'B'}}]}};
  const model = (kind: 'event'|'lineup') => ({
    create: jest.fn(async ({data}:any)=>{const row={id:kind+'-1',...data};(kind==='event'?events:lineups).push(row);return row;}),
    findUnique: jest.fn(async ({where}:any)=>(kind==='event'?events:lineups).find(row=>row.id===where.id) || null),
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
      updateMany:jest.fn(async({where,data}:any)=>{
        if (where.status && merge.status !== where.status) return {count:0};
        merge={...merge,...data};return {count:1};
      }),
      findUnique:jest.fn(async()=>merge),
      update:jest.fn(async({data}:any)=>{if(failSnapshot&&data.snapshotJson)throw Error('snapshot write failed');merge={...merge,...JSON.parse(JSON.stringify(data))};return merge;}),
    },
    $transaction:jest.fn(async(fn:any)=>{const before=JSON.stringify({events,lineups,merge});try{return await fn(prisma);}catch(e){({events,lineups,merge}=JSON.parse(before));throw e;}}),
  });
  return {
    events:()=>events,
    lineups:()=>lineups,
    merge:()=>merge,
    setMerge:(next:any)=>{merge=next;},
    addLater:()=>{events.push({id:'later-event',gameId:'g'});lineups.push({id:'later-lineup',gameId:'g'});},
  };
}

it('rolls back only the children created by the merge, preserving later additions',async()=>{
 const state=setup();await executeMerge('m');state.addLater();
 await rollbackMerge('m');
 expect(state.events().map(r=>r.id)).toEqual(['later-event']);
 expect(state.lineups().map(r=>r.id)).toEqual(['later-lineup']);
});
it('does not delete an imported child edited after the merge',async()=>{
 const state=setup();await executeMerge('m');state.events()[0].minute=20;
 await expect(rollbackMerge('m')).rejects.toThrow(/changed after the merge/);
 expect(state.events()).toHaveLength(1);
 expect(state.merge().status).toBe('executed');
});
it('does not commit imported children when their rollback snapshot cannot be persisted',async()=>{
 const state=setup(true);await executeMerge('m').catch(()=>null);
 expect(state.events()).toHaveLength(0);
 expect(state.lineups()).toHaveLength(0);
});
it('rolls back no children when one imported child changed later',async()=>{
 const state=setup();await executeMerge('m');state.lineups()[0].positionName='changed later';
 await expect(rollbackMerge('m')).rejects.toThrow(/changed after the merge/);
 expect(state.events()).toHaveLength(1);
 expect(state.lineups()).toHaveLength(1);
 expect(state.merge().status).toBe('executed');
});
it('allows only one concurrent rollback claim',async()=>{
 const state=setup();await executeMerge('m');
 const results=await Promise.allSettled([rollbackMerge('m'),rollbackMerge('m')]);
 expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1);
 expect(results.filter(result=>result.status==='rejected')).toHaveLength(1);
 expect(state.merge().status).toBe('rolled_back');
});
