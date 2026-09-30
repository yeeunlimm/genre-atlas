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
const {recommend,connection,searchTracks,trackYouTubeUrl}=load("discovery-station");
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
