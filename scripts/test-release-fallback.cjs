const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};let replies=[],calls=[];
const request=async(...args)=>{calls.push(args);const value=replies.shift();if(value instanceof Error)throw value;return value;};
new Function('exports','require','module',ts.transpileModule(fs.readFileSync('lib/release-fallback.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,()=>({artistReleases:request}),mod);
const empty={provider:'deezer',releases:[],choices:[],note:'empty'},alternate={provider:'musicbrainz',releases:[{id:'mb-album'}],choices:[],note:'verified'};
(async()=>{
 for(const primary of [empty,{...empty,choices:[{id:'one'},{id:'two'}]}]){
  calls=[];replies=[primary,alternate];const result=await mod.exports.catalogReleases('Artist','deezer','743');
  assert.equal(result.provider,'musicbrainz');assert.deepEqual(calls[1],['Artist','musicbrainz'],'never pass Deezer IDs into MusicBrainz');
 }
 const full={...empty,releases:[{id:'dz-album'}]};replies=[full];calls=[];assert.equal(await mod.exports.catalogReleases('Artist','deezer'),full);assert.equal(calls.length,1);
 replies=[empty,new Error('offline')];assert.match((await mod.exports.catalogReleases('Artist','deezer')).note,/temporarily unavailable/);
 replies=[empty];calls=[];await mod.exports.catalogReleases('Artist','deezer','',0,{choose:true});assert.equal(calls.length,1);
 replies=[empty];calls=[];await mod.exports.catalogReleases('Artist','deezer','743',100);assert.equal(calls.length,1);
 const ui=fs.readFileSync('components/artist-albums.tsx','utf8');assert.match(ui,/read\(data.artistId,data.nextOffset!,false,data.provider\)/);assert.match(ui,/read\(a.id,0,false,data.provider\)/);
 assert.match(fs.readFileSync('components/hybrid-discovery-station.tsx','utf8'),/title:"New Drug",artist:"Sunset Rollercoaster"/);
 console.log('PASS: empty and ambiguous catalog fallback, preserved source IDs, retryable failure, explicit choice, pagination and New Drug.');
})().catch(e=>{console.error(e);process.exitCode=1;});
