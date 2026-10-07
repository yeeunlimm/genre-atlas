const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};modules[name]=m.exports;new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return m.exports;}
const {inspectGenreDocument:inspect}=load('namu-genre'),namu=load('namu');
const link=t=>`<a class="wiki-link-internal" href="/w/${encodeURIComponent(t)}">${t}</a>`;
const note=t=>`<div class="wiki-paragraph">자세한 내용은 ${link(t)} 문서를 참고하십시오.</div>`;
const page=(t,body)=>`<title>${t} - 나무위키</title>${body}`;
const box=(ko,en)=>`<table><tr><td><b>${ko}<br>${en}</b></td></tr><tr><td>기원</td><td>음악</td></tr></table>`;
const detail=(t,en)=>page(t,box(t.replace(/ 음악$/,''),en));
const overview=(t,target)=>page(t,`<h2>1. 영국 음악의 한 장르</h2>${note(target)}<h2>2. 게임</h2>${note('GRIME')}<h2>3. 가수</h2>${note('그라임스')}`);
async function main(){
 assert.equal(inspect(overview('그라임','그라임 음악'),'그라임').detailTitle,'그라임 음악');
 assert.equal(inspect(detail('그라임 음악','Grime'),'그라임 음악').englishName,'Grime');
 assert.equal(inspect(detail('쟁글 팝','Jangle pop'),'쟁글 팝').englishName,'Jangle pop');
 assert.equal(inspect(page('없는 장르','<p>Some English</p>'+box('다른 장르','Wrong Genre')),'없는 장르').englishName,null);
 assert.equal(inspect(page('GRIME','<p>A game</p>'),'GRIME').englishName,null,'Latin game title is not a genre');
 assert.equal(inspect(page('그라임','<h2>게임</h2>'+note('그라임 음악')),'그라임').detailTitle,null);
 assert.equal(inspect(page('모호함','<h2>음악 장르</h2>'+note('후보 하나')+note('후보 둘')),'모호함').detailTitle,null);
 assert.equal(inspect(page('외부','<h2>음악 장르</h2><p>자세한 내용은 <a class="wiki-link-internal" href="https://evil.example/w/x">x</a> 문서를 참고하십시오.</p>'),'외부').detailTitle,null);
 const docs={'그라임':overview('그라임','그라임 음악'),'그라임 음악':detail('그라임 음악','Grime'),'첫 안내':overview('첫 안내','둘째 안내'),'둘째 안내':overview('둘째 안내','최종 음악'),'최종 음악':detail('최종 음악','Final Genre'),'순환 하나':overview('순환 하나','순환 둘'),'순환 둘':overview('순환 둘','순환 하나'),'제한 하나':overview('제한 하나','제한 둘'),'제한 둘':overview('제한 둘','제한 셋'),'제한 셋':overview('제한 셋','제한 넷')};
 const requested=[];let fail=false;
 global.fetch=async(input)=>{const title=decodeURIComponent(new URL(input).pathname.slice(3));requested.push(title);if(fail&&title==='그라임 음악')return new Response('',{status:403});assert.ok(title in docs,'unexpected fetch: '+title);return new Response(docs[title],{headers:{'content-type':'text/html'}});};
 fail=true;await assert.rejects(()=>namu.getNamu('그라임','genre-label'),e=>e instanceof namu.NamuError&&e.status===502&&e.upstreamStatus===403);fail=false;
 const resolved=await namu.getNamu('그라임','genre-label');assert.equal(resolved.englishName,'Grime');assert.equal(resolved.title,'그라임 음악');assert.deepEqual(resolved.resolutionPath,['그라임','그라임 음악']);assert.equal(resolved.requestedTitle,'그라임');assert(!requested.includes('GRIME'));
 const before=requested.length;await namu.getNamu('그라임','genre-label');assert.equal(requested.length,before,'verified resolution is cached');
 const collection=await namu.getNamu('그라임','genre');assert.equal(collection.title,'그라임 음악','genre collections resolve to the same document');
 assert.equal((await namu.getNamu('첫 안내','genre-label')).englishName,'Final Genre','two music-document hops');
 const cycle=await namu.getNamu('순환 하나','genre-label');assert.equal(cycle.englishName,null);assert.equal(cycle.title,'순환 하나');
 const limited=await namu.getNamu('제한 하나','genre-label');assert.equal(limited.englishName,null);assert(!requested.includes('제한 넷'),'at most two detail hops');
 const prior=requested.length;await namu.getNamu('순환 하나','genre-label');assert(requested.length>prior,'unresolved result is not cached as success');
 console.log('PASS: bilingual genre headings, scoped music detail links, ambiguity/game/external rejection, two-hop/cycle bounds, source path, retry/cache, collection resolution');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
