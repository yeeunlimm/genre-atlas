const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};let request,namuRequest;
const live=process.argv.includes('--live');
function load(name){
 if(modules[name])return modules[name];
 const m={exports:{}};modules[name]=m.exports;
 const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 new Function('exports','require','module',code)(m.exports,p=>{
  if(!live&&p==='./live-station')return {normalize:s=>s.toLowerCase().replaceAll('$','s').replace(/[^\p{L}\p{N}]/gu,''),musicBrainzRequest:p=>request(p)};
  if(!live&&p==='./namu'){const n=load('namu');return {...n,getNamu:(...a)=>namuRequest(...a)};}
  return p.startsWith('./')?load(p.slice(2)):require(p);
 },m);return m.exports;
}
async function main(){
 const g=load('musicbrainz-genres');
 if(live){
  for(const name of ['Tame Impala','A$AP Rocky','Radiohead']){
   const result=await g.musicBrainzArtistGenres(name);
   assert.ok(result.genres.length,name+' has real genres');
   const page=await g.discoverMusicBrainzGenre(result.genres[0].title);
   assert.ok(page.artists.length,'Genre has source-matched artists');
   console.log(JSON.stringify({artist:name,provider:result.provider,genres:result.genres.map(x=>x.name),genreArtists:page.artists.length,examples:page.artists.slice(0,3).map(a=>a.name),nextOffset:page.nextOffset}));
  }return;
 }
 const aid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',gid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 const artist={id:aid,name:'A$AP Rocky',type:'Person',aliases:[{name:'ASAP Rocky'}],tags:[{name:'hip hop',count:4}]};
 assert.equal(g.exactMusicBrainzArtist([artist],'ASAP Rocky').id,aid);
 assert.throws(()=>g.exactMusicBrainzArtist([artist,{...artist,id:gid}],'A$AP Rocky'),/Several/);
 assert.throws(()=>g.exactMusicBrainzArtist([artist],'Unrelated artist'),/No exact/);
 assert.equal(g.exactMusicBrainzArtist([artist,{...artist,id:gid,name:'Old artist name',aliases:[{name:'A$AP Rocky'}]}],'A$AP Rocky').id,aid);
 const seen=[];
 request=async path=>{seen.push(path);if(path.startsWith('artist/?'))return {artists:[artist],count:25};if(path.startsWith('genre/'))return {id:gid,name:'hip hop'};return {genres:[{id:gid,name:'hip hop',count:4},{name:'location',count:10},{id:aid,name:'negative',count:-1}]};};
 namuRequest=async()=>{throw new Error('upstream 403');};
 const genres=await g.artistGenres('A$AP Rocky');
 assert.equal(genres.provider,'MusicBrainz');assert.equal(genres.genres.length,1);assert.match(genres.notice,/NamuWiki/);assert.equal(genres.genres[0].title,'musicbrainz:'+gid);
 assert.ok(seen[0].includes('query='));
 const page=await g.discoverMusicBrainzGenre(genres.genres[0].title);
 assert.equal(page.provider,'MusicBrainz');assert.equal(page.artists.length,1);assert.equal(page.artists[0].provider,'MusicBrainz');assert.equal(page.artists[0].stars,4);assert.equal(page.nextOffset,1);
 assert.equal(g.musicBrainzGenreArtists([{...artist,tags:[{name:'hip hop',count:0}]},{...artist,tags:[{name:'hip hop soul',count:9}]}],{id:gid,name:'hip hop'},'now').length,0);
 assert.equal(g.musicBrainzGenreArtists([{...artist,tags:[{name:'hip hop',count:1},{name:'grunge',count:67}]},{...artist,type:undefined}],{id:gid,name:'hip hop'},'now').length,0);
 await assert.rejects(g.discoverMusicBrainzGenre('musicbrainz:../secret'),/Invalid/);
 await assert.rejects(g.discoverMusicBrainzGenre('musicbrainz:'+gid,-1),/Invalid/);
 namuRequest=async()=>({title:'Artist',isMusician:true,genres:[{name:'록',title:'록'}]});
 assert.equal((await g.artistGenres('Artist')).provider,'NamuWiki');
 namuRequest=async()=>({title:'Artist',isMusician:false,genres:[]});
 assert.equal((await g.artistGenres('ASAP Rocky')).provider,'MusicBrainz');
 request=async()=>{throw new Error('upstream unavailable');};
 await assert.rejects(g.artistGenres('ASAP Rocky'),/upstream unavailable/);
 const ui=fs.readFileSync('app/page.tsx','utf8');
 assert.ok(ui.includes('/api/artist-genres?title='));assert.ok(ui.includes('setGenreSource(data.sourceUrl)'));assert.ok(ui.includes('Genre tag votes'));
 console.log('PASS: source fallback, exact artist/alias identity, ambiguity rejection, real genre IDs, exact positive tags, paging, source labels, failures, invalid input, NamuWiki success preservation.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
