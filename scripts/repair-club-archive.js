#!/usr/bin/env node
'use strict';
/** Dry run: node scripts/repair-club-archive.js --plan /tmp/repair.json
 * Execute reviewed current plan: --execute --approve HASH --snapshot /safe/repair-snapshot.json
 * Snapshot records inverse operations; rollback must verify no subsequent edits or new team relations.
 */
const crypto = require('crypto');
const fs = require('fs');
const LEAGUES = ['comp_liga_haal', 'comp_liga_leumit'];
const VERIFIED = { '2000/2001': 'cmptc9kev00u86pymp91l10c0', '2005/2006': 'cmptc9ovy00wb6pym6e30oasw' };
const normalize = s => String(s || '').replace(/["'׳״.]/g, '').replace(/[-־]/g, ' ').replace(/\s+/g, ' ').trim();
// Deliberate exact aliases only. Do not add substring or token/fuzzy matching.
const groups = [
 ['הפועל באר שבע','הפועל ב"ש'], ['מכבי פתח תקווה','מכבי פתח תקוה','מכבי פ"ת'],
 ['הפועל פתח תקווה','הפועל פתח תקוה','הפועל פ"ת'], ['הפועל תל אביב','הפועל ת"א'], ['מכבי תל אביב','מכבי ת"א'],
 ['בית"ר ירושלים','בית"ר י-ם'], ['הפועל ירושלים','הפועל י-ם'], ['עירוני קריית שמונה','עירוני קרית שמונה','הפועל קריית שמונה','הפועל ק"ש','עירוני ק"ש'],
 ['הפועל רמת גן','הפועל ר"ג'], ['הפועל כפר סבא','הפועל כפ"ס'], ['מ.ס. אשדוד','אשדוד'], ['בני יהודה','בני יהודה ת"א','בני יהודה תל אביב'],
 ['הפועל ניר רמת השרון','הפועל ניר רמה"ש'], ['הפועל ראשון לציון','הפועל ר"ל','הפועל ראשל"צ'], ['הפועל בני לוד','הפ\' בני לוד רכבת'],
 ['הפועל נצרת עילית','הפועל נוף הגליל'], ['מכבי קריית גת','מכבי ק"ג'], ['הפועל קריית גת','הפועל ק"ג'],
];
const aliases = new Map(groups.flatMap(g => g.map(n => [normalize(n), normalize(g[0])])));
const nameKey = n => aliases.get(normalize(n)) || normalize(n);
const club = n => nameKey(n) === normalize('הפועל באר שבע');
const day = d => d && Number.isFinite(new Date(d).getTime()) ? new Date(d).toISOString().slice(0,10) : null;
function planRepair(data) {
 const actions=[], review=[];
 for(const [label,id] of Object.entries(VERIFIED)) {
  const season=data.seasons.find(s=>s.year===Number(label.slice(0,4)));
  const raw=data.scrapedStandings.find(s=>s.id===id && s.source==='walla' && s.season===label && club(s.teamNameHe) && s.leagueNameHe==='ליגה לאומית');
  if(!season || !raw || !data.competitions.some(c=>c.id==='comp_liga_leumit')) continue;
  const teams=data.teams.filter(t=>t.seasonId===season.id && club(t.nameHe));
  if(teams.length) continue; // Existing teams/standings always preserved, including empty rows.
  const fields=['position','played','wins','draws','losses','goalsFor','goalsAgainst','points'];
  if(fields.some(k=>!Number.isInteger(raw[k])) || raw.played!==raw.wins+raw.draws+raw.losses) {review.push({sourceId:id,reason:'INVALID_STANDING'});continue;}
  const standing=Object.fromEntries(fields.map(k=>[k,raw[k]]));
  Object.assign(standing,{goalsDiff:raw.goalsFor-raw.goalsAgainst,competitionId:'comp_liga_leumit',pointsAdjustment:raw.pointsAdjustment||0,pointsAdjustmentNoteHe:raw.pointsAdjustmentNoteHe||null});
  actions.push({kind:'createSeasonTeam',seasonId:season.id,year:season.year,sourceId:id,standing});
 }
 for(const g of data.games) {
  const year=data.seasons.find(s=>s.id===g.seasonId)?.year;
  const teams=data.teams.filter(t=>t.seasonId===g.seasonId && club(t.nameHe));
  if(!teams.some(t=>t.id===g.homeTeamId || t.id===g.awayTeamId)) continue;
  const leagues=[...new Set(teams.flatMap(t=>t.standings||[]).map(s=>s.competitionId).filter(c=>LEAGUES.includes(c)))];
  if(leagues.length!==1 || !data.competitions.some(c=>c.id===leagues[0])) continue;
  if(!day(g.dateTime) || !Number.isInteger(g.homeScore) || !Number.isInteger(g.awayScore)) continue;
  const matches=data.scrapedMatches.filter(r=>r.source==='footballOrgIl' && r.framework==='league' && r.season===`${year}/${year+1}` && day(r.dateTime)===day(g.dateTime) && nameKey(r.homeTeamName)===nameKey(g.homeTeam.nameHe) && nameKey(r.awayTeamName)===nameKey(g.awayTeam.nameHe) && r.homeScore===g.homeScore && r.awayScore===g.awayScore);
  if(matches.length!==1) continue;
  if(g.competitionId!==null) { if(g.competitionId!==leagues[0]) review.push({gameId:g.id,currentCompetitionId:g.competitionId,proposedCompetitionId:leagues[0],sourceId:matches[0].id,reason:'NON_NULL_COMPETITION'});continue; }
  actions.push({kind:'setCompetition',gameId:g.id,competitionId:leagues[0],sourceId:matches[0].id,year});
 }
 actions.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));review.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return {actions,review,approvalHash:crypto.createHash('sha256').update(JSON.stringify(actions)).digest('hex')};
}
async function collectRepairData(p) {
 const teams=await p.team.findMany({where:{OR:[{nameHe:'הפועל באר שבע'},{nameHe:'הפועל ב"ש'}]},include:{standings:true}});
 const ids=teams.map(t=>t.id);
 const [seasons,competitions,games,scrapedStandings,scrapedMatches]=await Promise.all([
 p.season.findMany(),p.competition.findMany({where:{id:{in:LEAGUES}}}),
 p.game.findMany({where:{OR:[{homeTeamId:{in:ids}},{awayTeamId:{in:ids}}]},include:{homeTeam:{select:{nameHe:true}},awayTeam:{select:{nameHe:true}}}}),
 p.scrapedStanding.findMany({where:{id:{in:Object.values(VERIFIED)}}}),
 p.scrapedMatch.findMany({where:{source:'footballOrgIl',framework:'league'}}),
 ]);return {teams,seasons,competitions,games,scrapedStandings,scrapedMatches};
}
async function main() {
 const args=process.argv.slice(2), arg=k=>args[args.indexOf(k)+1];
 const execute=args.includes('--execute');
 if(execute && (!args.includes('--approve') || !args.includes('--snapshot'))) throw Error('--execute requires --approve HASH and --snapshot PATH');
 const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();
 try {
  const plan=planRepair(await collectRepairData(p));
  if(args.includes('--plan')) fs.writeFileSync(arg('--plan'),JSON.stringify(plan,null,2)+'\n');
  if(execute) {
   if(arg('--approve')!==plan.approvalHash) throw Error('Plan changed or approval hash incorrect; review a new dry run');
   await p.$transaction(async tx=>{
    const fresh=planRepair(await collectRepairData(tx));
    if(fresh.approvalHash!==plan.approvalHash) throw Error('Concurrent changes; review again');
    const operations=fresh.actions.map(a=>a.kind==='createSeasonTeam'?{...a,teamId:crypto.randomUUID(),standingId:crypto.randomUUID()}:a);
    // Write BEFORE mutation. Transaction rollback leaves a harmless intent snapshot if execution fails.
    fs.writeFileSync(arg('--snapshot'),JSON.stringify({format:1,createdAt:new Date().toISOString(),approvalHash:plan.approvalHash,operations,rollbackNotes:'For setCompetition: restore null only if current competition matches. For created rows: delete standing and team only after checking no later edits or dependent records; never cascade-delete a team blindly.'},null,2)+'\n',{flag:'wx',mode:0o600});
    for(const a of operations) {
     if(a.kind==='setCompetition') {const result=await tx.game.updateMany({where:{id:a.gameId,competitionId:null},data:{competitionId:a.competitionId}});if(result.count!==1) throw Error('Game changed concurrently');}
     else {await tx.team.create({data:{id:a.teamId,seasonId:a.seasonId,nameHe:'הפועל באר שבע',nameEn:'Hapoel Beer Sheva'}});await tx.standing.create({data:{id:a.standingId,teamId:a.teamId,seasonId:a.seasonId,...a.standing,additionalInfo:{archiveRepairSourceId:a.sourceId}}});}
    }
   },{isolationLevel:'Serializable',timeout:60000});
  }
  console.log(JSON.stringify({...plan,executed:execute},null,2));
 }finally{await p.$disconnect();}
}
module.exports={planRepair,collectRepairData,main};
if(require.main===module) main().catch(e=>{console.error(e.message);process.exitCode=1;});
