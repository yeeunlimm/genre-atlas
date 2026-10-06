const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function modules(){const memo={};function load(name){if(memo[name])return memo[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};memo[name]=m.exports;new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return m.exports;}return load;}
const originalFetch=global.fetch;
const claim=id=>({rank:'normal',mainsnak:{snaktype:'value',datavalue:{value:{id}}}});
function entity(id='Q100',name='테스트 장르',label='Test Genre',type='Q188451'){return {id,labels:{ko:{value:name},en:{value:label}},claims:{P31:[claim(type)]}};}
async function main(){
 const load=modules(),web=load('genre-web-search');
 if(process.argv.includes('--live')){for(const name of ['스키플','아마피아노'])console.log(name,await web.searchWebGenre(name));return;}
 let mode='wikidata',calls=[];
 global.fetch=async(input)=>{
  const u=new URL(input),p=u.searchParams;calls.push(u);
  assert(['www.wikidata.org','ko.wikipedia.org','namu.wiki'].includes(u.hostname));
  if(mode==='unavailable')return new Response('',{status:503});
  if(u.hostname==='namu.wiki'){
   const body=mode==='namu'?'<table><tr><td>테스트 장르<br>Test Genre</td></tr><tr><td>기원</td><td>음악</td></tr></table>':'<p>No English heading</p>';
   return new Response('<title>테스트 장르 - 나무위키</title>'+body,{headers:{'content-type':'text/html'}});
  }
  if(u.hostname==='ko.wikipedia.org')return Response.json({query:{pages:mode==='none'?[]:[{title:mode==='wrongWiki'?'다른 장르':'테스트 장르',pageprops:{wikibase_item:'Q100'}}]}});
  if(p.get('action')==='wbsearchentities')return Response.json({search:['wikipedia','wrongWiki','none'].includes(mode)?[]:mode==='ambiguous'?[{id:'Q100'},{id:'Q101'}]:[{id:'Q100'}]});
  if(p.get('action')==='wbgetentities'){
   const e=entity();if(mode==='game')e.claims.P31=[claim('Q7889')];
   if(mode==='wrongName')e.labels.ko.value='다른 장르';
   if(mode==='noEnglish')e.labels.en.value='한국어';
   if(mode==='subclass')e.claims={P31:[claim('Q555')]};
   return Response.json({entities:{Q100:e,Q101:entity('Q101'),Q555:{claims:{P279:[claim('Q188451')]}}}});
  }
  throw new Error('Unexpected request '+u);
 };
 let r=await web.searchWebGenre('테스트 장르');assert.equal(r.englishName,'Test Genre');assert.equal(r.provider,'Wikidata');assert(!calls.some(u=>u.hostname==='ko.wikipedia.org'));
 mode='wikipedia';r=await web.searchWebGenre('테스트 장르');assert.equal(r.provider,'Wikipedia');assert(r.sourceUrl.includes('ko.wikipedia.org/wiki/'));
 mode='wrongWiki';assert.equal((await web.searchWebGenre('테스트 장르')).englishName,null);
 mode='ambiguous';assert.equal((await web.searchWebGenre('테스트 장르')).englishName,null,'never pick between valid namesakes');
 mode='game';assert.equal((await web.searchWebGenre('테스트 장르')).englishName,null);
 mode='wrongName';assert.equal((await web.searchWebGenre('원래 이름')).englishName,null);
 mode='noEnglish';assert.equal((await web.searchWebGenre('테스트 장르')).englishName,null);
 mode='subclass';assert.equal((await web.searchWebGenre('테스트 장르')).englishName,'Test Genre');
 mode='unavailable';assert.equal((await web.searchWebGenre('테스트 장르')).unavailable,true);
 mode='none';assert.equal((await web.searchWebGenre('테스트 장르')).unavailable,false);
 mode='namu';calls=[];r=await modules()('genre-label').resolveGenreLabel('테스트 장르');assert.equal(r.provider,'NamuWiki');assert(calls.every(u=>u.hostname==='namu.wiki'));
 mode='wikidata';const resolver=modules()('genre-label');r=await resolver.resolveGenreLabel('테스트 장르');assert.equal(r.provider,'Wikidata');assert.equal(r.title,'테스트 장르','original NamuWiki lookup title preserved');
 const before=calls.length;await resolver.resolveGenreLabel('테스트 장르');assert.equal(calls.length,before,'verified result cached');
 mode='unavailable';const retry=modules()('genre-label');assert.equal((await retry.resolveGenreLabel('테스트 장르')).status,'unavailable');
 mode='wikidata';assert.equal((await retry.resolveGenreLabel('테스트 장르')).status,'verified','failure not permanently cached');
 mode='none';assert.equal((await modules()('genre-label').resolveGenreLabel('테스트 장르')).status,'unresolved');
 const view=load('genre-view');const list=[{name:'재즈',title:'재즈'},{name:'테스트 장르',title:'테스트 장르'},{name:'미확인',title:'미확인',resolutionStatus:'unresolved'},{name:'찾음',title:'찾음',englishName:'Found Genre',resolutionStatus:'verified'}];
 const state=view.genreDisplayState(list);assert.deepEqual(state.visible.map(g=>view.genreLabel(g)),['Jazz','Found Genre']);assert.equal(state.pending,1);assert.equal(state.hidden,1);assert.equal(list.length,4,'source genres never deleted');
 console.log('PASS: ordered reference fallbacks, exact genre identity, type/subclass validation, ambiguity/game/no-English rejection, source provenance, bounded errors/retry/cache, English-only visible genres without deleting originals');
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{global.fetch=originalFetch;});
