const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
function load(name) {
  const source=fs.readFileSync(path.join(__dirname,"../lib/",name+".ts"),"utf8");
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}}; new Function("exports","require","module",compiled)(m.exports,require,m); return m.exports;
}
const {stationCatalog:c}=load("station-catalog");
const {recommend,connection,searchTracks,trackYouTubeUrl,onePerArtist,stationQueue}=load("discovery-station");
assert.equal(new Set(c.map(t=>t.id)).size,c.length);
assert.equal(searchTracks("2hollis star",c).length,4);
assert.equal(searchTracks("asap",c)[0].id,"sundress");
assert.equal(searchTracks("animal",c)[0].id,"rosa");
assert.equal(searchTracks("MISSING-TRACK",c).length,0);
for(const seed of c){
  const rows=recommend(seed.id,c);
  let reachedGenreOnly=false;
  for(const row of rows){const credited=row.reasons.some(r=>r.kind!=="genre");if(!credited)reachedGenreOnly=true;else assert.equal(reachedGenreOnly,false);}
  assert.equal(new Set(rows.map(r=>r.track.id)).size,rows.length);
  for(const r of rows){
    assert.notEqual(r.track.albumFamily,seed.albumFamily);
    assert.notEqual(r.track.recordingId,seed.recordingId);
    assert.ok(r.reasons.length);
    assert.ok(r.reasons.every(reason=>reason.sources.every(s=>s.url.startsWith("https://"))));
    assert.equal(new URL(trackYouTubeUrl(r.track)).hostname,"www.youtube.com");
  }
}
const effie=recommend("makgeolli-banger",c);
assert.ok(effie.length>=5);
assert.ok(effie.every(r=>r.track.artist==="Nate Sib"));
const rosa=recommend("rosa",c);
assert.ok(rosa.some(r=>r.track.id==="girl"&&r.reasons.some(x=>x.label==="Connected credits")));
assert.ok(!rosa.some(r=>r.track.id==="makgeolli-banger")); // no invented kimj link
const tame=recommend("new-person",c);
for(const id of ["skeletons","sundress","bandit","houdini"])assert.ok(tame.some(r=>r.track.id===id));
assert.ok(tame.find(r=>r.track.id==="bandit").reasons.some(r=>r.kind==="sample"));
assert.ok(!tame.find(r=>r.track.id==="sundress").reasons.some(r=>r.label==="Shared production"));
assert.ok(!recommend("makgeolli-banger",c,{"nate-only1":"dislike"},["nate-go"]).some(r=>["nate-only1","nate-go"].includes(r.track.id)));
assert.deepEqual(recommend("unknown",c),[]);
assert.deepEqual(recommend("new-person",c,{},tame.map(r=>r.track.id)),[]);
const seed=c[0],deluxe={...c[3],id:"deluxe",album:"Deluxe",albumFamily:seed.albumFamily};
const duplicate={...c[3],id:"duplicate",recordingId:seed.recordingId};
assert.deepEqual(recommend(seed.id,[seed,deluxe,duplicate]),[]);
const before=recommend("new-person",c),after=recommend("new-person",c,{houdini:"like"});
assert.ok(after.some(r=>r.feedbackBoost));
const ranking=rows=>rows.map(r=>({id:r.track.id,score:r.score,reasons:r.reasons}));
assert.deepEqual(ranking(recommend("new-person",c.map((t,i)=>({...t,bpm:40+i*17})))),ranking(before));
console.log("PASS: catalog identity, search, album/recording exclusion, credit roles, samples, dislike, skips, exhaustion, likes.");
// Synthetic artists cover all catalog results, not a hand-picked song exception.
const row=(id,artist,artistId,score=5,extra={})=>({track:{...c[0],id,recordingId:id,artist,artistId,...extra},score,reasons:[{kind:"credit",label:"Shared production",detail:"",sources:[]}],feedbackBoost:false});
const a=row("a1","Artist A","mb-a",9), a2=row("a2","Artist A","mb-a",8), b=row("b1","Artist B","mb-b",7);
assert.deepEqual(stationQueue([a,a2,b]).map(r=>r.track.id),["a1","b1"]);
assert.deepEqual(stationQueue([a,a2,b],{},[a.track]).map(r=>r.track.id),["b1"]);
for(const vote of ["like","dislike"])assert.deepEqual(stationQueue([a,a2,b],{a1:vote},[a.track]).map(r=>r.track.id),["b1"]);
const featured=row("a3","Artist A feat. Guest","apple-a",20);
assert.equal(onePerArtist([featured],[a.track]).length,0);
assert.equal(onePerArtist([row("a4","Artist A (feat. Guest)","apple-a")],[a.track]).length,0);
const collaboration=row("a5","Artist A & Another","mb-a",10,{primaryArtistName:"Artist A"});
assert.equal(onePerArtist([collaboration],[featured.track]).length,0);
// A later batch cannot replace a chosen artist's song or revive a skipped artist.
const merged=onePerArtist([...onePerArtist([a,a2,b]),featured,collaboration,row("c1","Artist C","mb-c")]);
assert.deepEqual(merged.map(r=>r.track.id),["a1","b1","c1"]);
assert.deepEqual(stationQueue(merged,{},[a.track,b.track]).map(r=>r.track.id),["c1"]);
assert.equal(stationQueue(merged,{},merged.map(r=>r.track)).length,0);
assert.equal(stationQueue(merged).length,3); // Explicit replay/new station resets consumed artists.
assert.equal(onePerArtist([row("x","Artist X","itunes:undefined"),row("y","Artist Y","itunes:undefined")]).length,2);
assert.equal(onePerArtist([row("band","Earth, Wind & Fire","band-id"),row("earth","Earth","earth-id")]).length,2);
assert.equal(onePerArtist([row("rocky1","A$AP Rocky","apple-rocky"),row("rocky2","ASAP ROCKY","mb-rocky")]).length,1);
assert.equal(onePerArtist([row("alias","A stage alias","mb-a"),row("named","Artist A","mb-a"),featured]).length,1);
for(const t of c){const q=stationQueue(recommend(t.id,c));assert.equal(onePerArtist(q).length,q.length);}
console.log("PASS: one track per primary artist, cross-source names/IDs, features, bands, skip/like/dislike, paging, exhaustion and replay.");
