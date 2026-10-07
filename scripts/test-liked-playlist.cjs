const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);new Function('exports','module','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id));return m.exports;}
const {collectLikedCandidates,selectLikedPlaylist,reviewKey}=load('lib/liked-playlist.ts');
const {blankMemory,songKey}=load('lib/hybrid-station.ts');
const {stationCatalog}=load('lib/station-catalog.ts');
const seed=stationCatalog[0];
const track=(id,artist=id)=>({...seed,id,recordingId:id,title:id,artist,primaryArtistName:artist,artistId:artist,album:id,albumFamily:id});
const row=(id,artist=id,confidence=.8)=>({track:track(id,artist),score:0,reasons:[],paths:[{route:'credits',seedId:seed.id,confidence}]});
const now=Date.now(),summary=score=>({status:'ready',score,sampleCount:3,analyzedAt:new Date(now).toISOString()});
(async()=>{
 const rows=[row('no-score','same',.99),row('good','same',.8),row('bad'),row('zero'),row('stale'),row('recent'),row('disliked')];
 const scores=new Map(rows.slice(1).map(r=>[reviewKey(r.track),summary(r.track.id==='bad'?-.5:r.track.id==='zero'?0:.5)]));
 scores.set(reviewKey(track('stale')),{...summary(.5),analyzedAt:new Date(now-86400000).toISOString()});
 const memory=blankMemory();memory.votes[songKey(track('disliked'))]={vote:'dislike',routes:['credits'],at:now};
 const picked=selectLikedPlaylist(rows,[seed],memory,{[songKey(track('recent'))]:now},scores,now);
 assert.deepEqual(picked.map(r=>r.track.id),['good']); // gate BEFORE artist diversity
 const all=Array.from({length:15},(_,i)=>row('song'+i));
 assert.equal(selectLikedPlaylist(all,[seed],blankMemory(),{},new Map(all.map(r=>[reviewKey(r.track),summary(.2)])),now).length,10);
 let calls=0;const result=await collectLikedCandidates([seed],async(s,route)=>{calls++;assert.equal(s.id,seed.id);if(route==='credits')throw new Error('fixture failure');return [row('live')];},new AbortController().signal);
 assert.equal(calls,3);assert.equal(result.failed,1);assert.equal(result.rows.length,1);
 const aborted=new AbortController();aborted.abort();await assert.rejects(collectLikedCandidates([seed],async()=>[],aborted.signal));
 const component=fs.readFileSync('components/liked-playlist.tsx','utf8');
 assert.ok(!component.includes('...queue'));assert.ok(component.includes("await json('/api/station/reviews')"));
 const station=fs.readFileSync('components/hybrid-discovery-station.tsx','utf8');assert.ok(!station.includes('function buildPlaylist'));assert.ok(station.includes('userId&&hydrated&&<LikedPlaylist'));
 const {reviewEligibility}=await import('../lib/review-analyzer.mjs');
 assert.equal(reviewEligibility('I love this song and its beautiful melody.'),true);
 assert.equal(reviewEligibility('The song is terrible and I hate the vocals.'),true);
 assert.equal(reviewEligibility('Who is here in 2026?'),false);
 assert.equal(reviewEligibility('I love his jacket.'),false);
 assert.equal(reviewEligibility('노래 좋아요'),false);
 console.log('PASS: independent liked candidate fetch, positive-only gate before diversity, missing/zero/negative/stale/recent/dislike exclusions, cap, partial errors, cancellation, relevance rules.');
})().catch(e=>{console.error(e);process.exitCode=1;});
