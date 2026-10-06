const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
let responses=[],calls=[];
const uuid="11111111-1111-1111-1111-111111111111",edition="22222222-2222-2222-2222-222222222222";
async function request(path){calls.push(path);if(!responses.length)throw new Error("Unexpected fixture request: "+path);return responses.shift();}
const code=ts.transpileModule(fs.readFileSync("lib/releases.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const identity={exports:{}};new Function("exports","require","module",ts.transpileModule(fs.readFileSync("lib/release-identity.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(identity.exports,require,identity);
const m={exports:{}};new Function("exports","require","module",code)(m.exports,p=>p==="./release-identity"?identity.exports:p==="./live-station"?{musicBrainzRequest:request,normalize:s=>s.toLowerCase(),StationError:class extends Error{constructor(s,status){super(s);this.status=status;}}}:{deezer:request},m);
const r=m.exports;
(async()=>{
 assert.deepEqual(r.releaseTypes({"primary-type":"Album","secondary-types":["Compilation","Mixtape/Street"]}),["Album","Compilation","Mixtape"]);
 assert.deepEqual(r.releaseTypes({record_type:"ep"}),["EP"]);assert.deepEqual(r.releaseTypes({}),["Other"]);
 assert.equal(r.featuring("Song (feat. Guest)"),"Guest");assert.equal(r.featuring("Song"),null);
 assert.equal(r.featuring("Song",[{name:"Main",joinphrase:" feat. "},{name:"Guest"}]),"Guest");
 responses=[{artists:[{id:uuid,name:"Same"},{id:edition,name:"Same"}]}];calls=[];
 const ambiguous=await r.artistReleases("Same","musicbrainz");assert.equal(ambiguous.choices.length,2);assert.equal(calls.length,1,"do not guess artist identity");
 responses=[{"release-groups":[{id:uuid,title:"Record","first-release-date":"2020","primary-type":"Album"}],"release-group-count":101}];
 const list=await r.artistReleases("Artist","musicbrainz",uuid);assert.equal(list.nextOffset,100);assert.equal(list.releases[0].date,"2020");
 responses=[
  {id:uuid,title:"Record","first-release-date":"2000","primary-type":"Album"},
  {releases:[{id:edition,title:"Record",status:"Official",date:"2001",media:[{format:"Digital Media"}]}]},
  {id:edition,title:"Record",status:"Official",date:"2001","artist-credit":[{name:"Artist"}],media:[
   {position:1,"track-count":1,tracks:[{id:"a",number:"1",title:"Song (feat. Guest)",length:123000}]},
   {position:2,"track-count":1,tracks:[{id:"b",number:"1",title:"Second"}]}
  ]}
 ];
 const album=await r.albumDetail("musicbrainz",uuid);assert.equal(album.tracks.length,2);assert.equal(album.tracks[1].disc,2);assert.equal(album.tracks[1].durationMs,null);assert.equal(album.complete,true);assert.equal(album.release.date,"2000");assert.equal(album.editionDate,"2001");
 responses=[{id:1,title:"Album",artist:{name:"Artist"},release_date:"2022",nb_tracks:2,tracks:{data:[{id:1,title:"First",duration:60}],next:"more"}},{data:[{id:2,title:"Second",duration:75}]}];
 const dz=await r.albumDetail("deezer","1");assert.equal(dz.tracks.length,2);assert.equal(dz.complete,true);assert.equal(dz.tracks[1].durationMs,75000);
 responses=[{data:[{id:1,title:"Known",fans:42},{id:2,title:"Zero",fans:0},{id:3,title:"Missing"},{id:4,title:"Invalid",fans:-1}],total:4}];
 const counts=await r.artistReleases("Artist","deezer","1");assert.deepEqual(counts.releases.map(x=>x.fans),[42,0,null,null]);
 await assert.rejects(r.albumDetail("musicbrainz","../../secret"));await assert.rejects(r.artistReleases("Artist","evil"));
 console.log("PASS: release classifications, ambiguous identities, pagination, featuring, multidisc tracks, dates, unknown duration and validated IDs.");
})().catch(e=>{console.error(e);process.exit(1);});
