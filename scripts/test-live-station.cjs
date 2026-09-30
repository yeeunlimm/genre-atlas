const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),ts=require("typescript");
const modules={};
function load(name){
  if(modules[name])return modules[name];
  const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,"../lib/",name+".ts"),"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}};new Function("exports","require","module",code)(m.exports,p=>p.startsWith("./")?load(p.slice(2)):require(p),m);return modules[name]=m.exports;
}
const live=load("live-station"),{stationCatalog}=load("station-catalog");
const cover="https://is1-ssl.mzstatic.com/image/thumb/example/100x100bb.jpg";
assert.equal(live.appleArtworkUrl(cover),cover.replace("100x100","600x600"));
assert.equal(live.appleArtworkUrl("https://untrusted.example/cover.jpg"),undefined);
assert.equal(live.chooseAlbumArtwork([{collectionType:"Album",artistName:"Other Artist",collectionName:"Currents",artworkUrl100:cover}],"Tame Impala","Currents"),undefined);
assert.equal(live.chooseAlbumArtwork([{collectionType:"Album",artistName:"Tame Impala",collectionName:"Currents",artworkUrl100:cover}],"Tame Impala","Currents"),cover.replace("100x100","600x600"));
const t=live.parseApple({kind:"song",trackId:123,artistId:7,collectionId:8,artistName:"Tame Impala",trackName:"Let It Happen",collectionName:"Currents",trackTimeMillis:466000});
assert.equal(t.id,"itunes:123");assert.equal(t.credits.length,0);assert.equal(live.parseApple({kind:"podcast"}),null);
assert.ok(live.sameAlbum(t,{...t,id:"other",albumFamily:"other",album:"Currents (Deluxe Edition)"}));
assert.ok(!live.sameAlbum(t,{...t,albumFamily:"other",album:"The Slow Rush"}));
assert.ok(live.sameSong(t,{...t,id:"other",recordingId:"other"}));
const rows=[{id:"wrong",title:"Let It Happen (Live)","artist-credit":[{name:"Tame Impala"}],releases:[{title:"Currents"}]},{id:"right",title:t.title,length:466893,"artist-credit":[{name:t.artist}],releases:[{title:t.album,status:"Official"}]}];
assert.equal(live.chooseRecording(rows,t).id,"right");
assert.equal(live.chooseRecording([{...rows[1],length:200000}],t),undefined);
assert.equal(live.chooseRecording([{...rows[1],releases:[{title:"Unrelated Album"}]}],t),undefined);
assert.equal(live.chooseRecording([{...rows[1],disambiguation:"clean"}],{...t,explicitness:"explicit"}),undefined);
assert.equal(live.chooseRecording([{...rows[1],disambiguation:"demo"}],t),undefined);
const credits=live.parseCredits([{type:"producer",artist:{id:"person",name:"Kevin Parker"}},{type:"instrument",artist:{id:"performer",name:"Person"}},{type:"mix",artist:{id:"mixer",name:"Mixer"}}],"release","album-id");
assert.deepEqual(credits.map(c=>c.role),["producer","mixing"]);assert.ok(credits.every(c=>c.scope==="release"));
assert.equal(load("discovery-station").searchTracks("아이유",stationCatalog).length,0);
assert.ok(live.normalize("아이유").length>0);
console.log("PASS: live catalog parsing, identity/version safety, album exclusion, credit roles/scopes, Unicode search.");
if(process.argv.includes("--live")){
  (async()=>{
    for(const q of ["Tame Impala Let It Happen","Radiohead Karma Police","Kanye West Runaway"]){
      const d=await live.liveSearch(q);console.log("SEARCH",q,d.provider,d.tracks.length,d.tracks.slice(0,3).map(t=>t.title+" / "+t.album));
      assert.ok(d.tracks.some(t=>t.id.startsWith("itunes:")||t.id.startsWith("mb:")));
      const seed=d.tracks.find(t=>t.title==="Let It Happen"&&t.album==="Currents");
      if(seed){const r=await live.liveStation(seed.id);console.log("STATION",r.seed.title,r.totalConnections,r.rows.length,r.nextOffset,r.notes);console.log(r.rows.slice(0,5).map(x=>({song:x.track.title,artist:x.track.artist,reason:x.reasons[0]?.detail})));assert.ok(r.rows.some(x=>!stationCatalog.some(t=>t.id===x.track.id)));assert.ok(r.rows.every(x=>!live.sameAlbum(r.seed,x.track)&&!live.sameSong(r.seed,x.track)));}
    }
  })().catch(e=>{console.error(e);process.exitCode=1;});
}
