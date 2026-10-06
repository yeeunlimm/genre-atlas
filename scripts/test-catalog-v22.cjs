const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};modules[name]=m.exports;new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return m.exports;}
const dz=load('deezer-catalog'),sources=load('hybrid-sources'),net=load('music-request'),genre=load('genre-view'),search=load('catalog-search'),h=load('hybrid-station');
const row=(id,artist=20)=>({id,title:'Song '+id,artist:{id:artist,name:'Artist '+artist},album:{id,title:'Album '+id,cover_big:'https://cdn-images.dzcdn.net/images/cover/test/500.jpg'},duration:150});
async function main(){
  const seed=dz.parseDeezer(row(1,10));assert.equal(seed.catalogKind,'deezer');assert.equal(dz.parseDeezer({id:1}),null);
  let requests=0;
  global.fetch=async(input)=>{requests++;const url=new URL(input);if(url.pathname.endsWith('/related'))return Response.json({data:[{id:20,name:'Artist 20'},{id:30,name:'Artist 30'}],total:2});if(url.pathname.includes('/20/'))return Response.json({data:[row(2),row(3),row(4,999)]});return Response.json({data:[row(5,30)]});};
  const result=await net.musicRequest(()=>sources.deezerRelated(seed));assert.equal(result.state,'ready');assert.equal(result.rows.length,3);assert(!result.rows.some(r=>r.track.artistId==='deezer:999'));
  assert.equal(h.rankCandidates(result.rows,[seed],h.blankMemory()).length,2,'one song per artist');
  const mbId='11111111-1111-1111-1111-111111111111';
  global.fetch=async()=>Response.json({relations:[{url:{resource:'https://www.deezer.com/artist/12345'}},{url:{resource:'https://evil.example/artist/999'}}]});
  assert.equal(await net.musicRequest(()=>load('live-station').musicBrainzDeezerArtist(mbId)),'12345','use only explicit trusted artist cross-links');
  const duplicate={...seed,id:'itunes:1',recordingId:'itunes:1',catalogKind:'apple'};
  assert.equal(search.mergeSearch([seed,duplicate],'Song 1').length,1);
  assert.equal(search.mergeSearch([seed,{...duplicate,album:'Different Album'}],'Song 1').length,2,'preserve real album editions');
  assert.equal(genre.genreLabel({name:'쟁글 팝',title:'쟁글 팝'}),'Jangle Pop');
  assert.equal(genre.genreLabel({name:'UK 드릴',title:'UK 드릴'}),'UK Drill');
  assert.equal(genre.genreLabel({name:'영국 힙합',title:'영국 힙합'}),'UK Hip-Hop');
  assert.equal(genre.genreLabel({name:'알 수 없는 장르',title:'알 수 없는 장르'}),'알 수 없는 장르','unknown must not become fake English');
  assert.equal(genre.genreLabel({name:'쟁글 팝',title:'쟁글 팝',englishName:'Jangle pop'}),'Jangle pop','source heading has priority');
  const namu=load('namu');const html='<title>쟁글 팝 - 나무위키</title><table><tr><td><div class="wiki-paragraph"><b>쟁글 팝<br>Jangle pop</b></div></td></tr><tr><td>기원</td><td>Post-punk</td></tr></table>';
  assert.equal(namu.parseDocument(html,'쟁글 팝','genre-label').englishName,'Jangle pop');
  assert.equal(namu.parseDocument('<title>없는 장르 - 나무위키</title><p>Jangle Pop</p>','없는 장르','genre-label').englishName,null,'unrelated Latin text not used');
  const [one,two]=await Promise.all([net.musicRequest(async()=>{const p=net.musicPending();await new Promise(r=>setTimeout(r,5));return p;}),net.musicRequest(async()=>net.musicPending())]);assert.notEqual(one,two,'no cross-request pending IO');
  global.fetch=async()=>new Response('',{status:403});await assert.rejects(()=>net.musicJson('https://example.com','Fixture','search'),e=>e.upstreamStatus===403&&e.provider==='Fixture');
  console.log('PASS: live Deezer provenance, strict artist identity, dedup/album editions, diversity, source English headings/no romanization, isolated request IO, provider-specific errors');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
