const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};modules[name]=m.exports;new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return m.exports;}
const cloud=load('artist-discovery'),net=load('music-request');
const artist=(id,name='Test Artist',fans=100)=>({id,name,nb_fan:fans});
const ytId='UC'+'a'.repeat(22);
async function main(){
 assert.equal(cloud.parseDeezerArtist({id:1}),null);
 assert.equal(cloud.parseDeezerArtist(artist(1)).metric,'deezer-fans');
 assert.equal(cloud.parseDeezerArtist(artist(1,'A',undefined)).provider,'Deezer');
 global.fetch=async input=>{
  const u=new URL(input);
  if(u.hostname==='music.youtube.com')return new Response('',{status:403});
  if(u.pathname==='/search/artist'){
   const q=u.searchParams.get('q');return Response.json({data:q==='Ambiguous'?[artist(30,q),artist(31,q)]:q==='No Match'?[]:[artist(10,q)]});
  }
  if(u.pathname==='/artist/10')return Response.json(artist(10,'Unique Artist'));
  if(u.pathname.endsWith('/related'))return Response.json({data:[artist(10),artist(20,'Peer'),artist(20,'Peer'),{id:99}]});
  throw Error('Unexpected URL '+u.href);
 };
 const recovered=await net.musicRequest(()=>cloud.artistDiscovery('artist',ytId,'Unique Artist'));
 assert.equal(recovered.state,'ready');assert.equal(recovered.provider,'Deezer');assert.equal(recovered.related.length,1);assert.equal(recovered.related[0].id,'deezer:20');assert.match(recovered.notice,/not monthly listeners/);
 const ambiguous=await net.musicRequest(()=>cloud.artistDiscovery('artist',ytId,'Ambiguous'));
 assert.equal(ambiguous.state,'choose-artist');assert.equal(ambiguous.artists.length,2);assert.equal(ambiguous.related.length,0,'do not merge homonyms or choose by popularity');
 const search=await net.musicRequest(()=>cloud.artistDiscovery('search','Fallback Search'));
 assert.equal(search.provider,'Deezer');assert.equal(search.artists.length,1);
 await assert.rejects(()=>net.musicRequest(()=>cloud.artistDiscovery('artist',ytId,'No Match')),/could not load/,'source error must not become empty success');
 await assert.rejects(()=>cloud.artistDiscovery('artist','https://evil.test','Artist'),/Invalid artist/);
 const viaId=await net.musicRequest(()=>cloud.artistDiscovery('artist','deezer:10'));
 assert.equal(viaId.related.length,1,'Deezer cloud artists can be explored directly');
 console.log('PASS: 403 fallback, exact/ambiguous identities, source-vs-empty state, honest fan metric, dedup, direct artist exploration.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
