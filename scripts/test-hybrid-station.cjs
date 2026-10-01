const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const h=load('hybrid-station'),live=load('live-station');
const now=Date.now();
function track(id,artist='Artist '+id,album='Album '+id){return {id:'itunes:'+id,recordingId:'itunes:'+id,title:'Song '+id,artist,artistId:'itunes:'+artist,album,albumFamily:artist+':'+album,credits:[],genres:[],source:{label:'Fixture',url:'https://example.com'},checkedAt:'2026-10-01'};}
function row(t,route='related-artists',confidence=.8,seedId='seed'){return {track:t,score:0,reasons:[],feedbackBoost:false,paths:[{route,confidence,seedId}]};}
const seed=track(1),seed2=track(2),a=row(track(3)),b=row(track(4),'credits',.82),c=row(track(5),'similar-tracks',.75);
let m=h.blankMemory();
assert.equal(h.rankCandidates([a,b,c],[seed],m).length,3,'no shared credits required');
assert.equal(h.rankCandidates([a,b],[seed],m)[0].track.id,b.track.id);
m=h.recordVote(m,a,'like',now);assert.ok(h.routeWeights(m)['related-artists']>1);
assert.equal(h.rankCandidates([a,b],[seed],m)[0].track.id,a.track.id,'source feedback reorders candidates');
assert.equal(h.routeWeights(m).credits,1);
m=h.recordVote(m,a,'dislike',now);assert.ok(h.routeWeights(m)['related-artists']<1);
assert.equal(h.rankCandidates([a,b],[seed],m).length,1,'disliked songs hidden');
const multiple={...a,paths:[...a.paths,{route:'credits',seedId:'other',confidence:.7}]};
const multi=h.recordVote(h.blankMemory(),multiple,'like',now);
assert.equal(h.routeWeights(multi).credits,h.routeWeights(multi)['related-artists']);
assert.ok(h.routeWeights(multi).credits<h.routeWeights(h.recordVote(h.blankMemory(),b,'like',now)).credits);
assert.deepEqual(h.recordVote(multi,multiple,'like',now),multi,'one vote per song');
const clone=structuredClone(a);h.mergeCandidates([a,{...a,paths:[{...a.paths[0],confidence:1}]}]);assert.deepEqual(a,clone,'merge does not mutate previous state');
assert.equal(h.mergeCandidates([a,{...b,track:{...a.track,id:'mb:other',recordingId:'mb:other'}}]).length,1);
assert.equal(h.mergeCandidates([a,{...b,track:a.track}])[0].paths.length,2);
const sameAlbum=track(7,seed.artist,seed.album+' (Deluxe Edition)');
assert.equal(h.rankCandidates([row(seed),row(seed2),row(sameAlbum),row({...track(8),albumGroups:['g']}),a],[{...seed,albumGroups:['g']},seed2],h.blankMemory()).length,1);
assert.equal(h.rankCandidates([a,row({...a.track,id:'itunes:9',title:'Another Song'}),b],[seed],h.blankMemory()).length,2,'one track per artist');
assert.equal(h.rankCandidates([a,b],[seed],h.blankMemory(),[a.track]).length,1,'cap across pagination/consumption');
const recent=h.remember(h.blankMemory(),a.track,now);
assert.equal(h.rankCandidates([a],[seed],recent,[],now).length,0);
assert.equal(h.rankCandidates([a],[seed],recent,[],now+h.COOLDOWN+1).length,1);
assert.equal(h.rankCandidates([a],[seed],h.blankMemory()).length,1,'reset restores eligibility');
assert.deepEqual(h.cleanMemory(null),h.blankMemory());assert.deepEqual(h.cleanMemory({version:1,votes:{bad:{vote:'bad',routes:['oops'],at:now}},recent:{old:0,future:now+1}},now),h.blankMemory());
assert.deepEqual(h.cleanMemory(JSON.parse(JSON.stringify(m))),m,'saved state round-trip');

async function main(){
  const sources=load('hybrid-sources');let calls=0;
  global.fetch=async()=>{calls++;throw new Error('should not fetch');};
  assert.equal((await sources.similarCandidates(seed)).state,'disabled');assert.equal(calls,0,'missing key makes no Last.fm request');
  global.fetch=async url=>{const u=new URL(url);if(u.hostname==='ws.audioscrobbler.com')return Response.json({similartracks:{track:[{name:'Song 3',artist:{name:'Artist 3'},match:'10.95'},{name:'Song 4',artist:{name:'Artist 4'},match:'4.5'}]}});return Response.json({results:[{kind:'song',trackId:3,artistId:3,trackName:'Song 3',artistName:'Artist 3',collectionName:'Album 3',collectionId:3},{kind:'song',trackId:99,artistId:99,trackName:'Song 4',artistName:'Cover Band',collectionName:'Covers',collectionId:99}]});};
  const similar=await sources.similarCandidates(seed,'fixture-key');assert.equal(similar.rows.length,1,'reject wrong artist even if title matches');assert.ok(Math.abs(similar.rows[0].paths[0].confidence-.95)<1e-9,'normalize unbounded Last.fm match scores');
  assert.equal(similar.rows[0].track.credits.length,0,'non-credit tracks remain eligible');
  global.fetch=async()=>Response.json({error:10,message:'invalid secret'});await assert.rejects(()=>sources.similarCandidates(seed,'fixture-key'),/Last.fm could not complete/);
  // Related-artist adapter: exact artist resolution, without static artist/song lists.
  modules['youtube-music'].music=async(kind)=>kind==='search'?{artists:[{id:'fixture',name:seed.artist,url:'https://music.youtube.com/channel/fixture'}]}:{related:[{name:'Fixture Peer',id:'peer'}]};
  global.fetch=async()=>Response.json({results:[{kind:'song',trackId:101,artistId:101,trackName:'Unknown Discovery',artistName:'Fixture Peer',collectionName:'Unknown Album',collectionId:101}]});
  const related=await sources.relatedCandidates(seed);assert.equal(related.rows.length,1);assert.equal(related.rows[0].paths[0].route,'related-artists');assert.equal(related.rows[0].track.credits.length,0);
  modules['youtube-music'].music=async()=>({artists:[{name:'Wrong Artist'}]});assert.equal((await sources.relatedCandidates(seed)).state,'empty');
  console.log('PASS hybrid station: multi-seed exclusions, artist cap, dedup/provenance, feedback ranking, cooldown, storage validation, keyless route, Last.fm disabled/error/exact match');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
