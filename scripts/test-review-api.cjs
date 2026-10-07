const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
let signedIn=false,analyseCalls=0,failAuth=false;
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);
 new Function('exports','module','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,id=>{
 if(id==='@/lib/supabase/server')return {verifiedAccount:async()=>{if(failAuth)throw new Error('private auth error');return signedIn?{id:'test-user'}:null;}};
 if(id==='@/lib/playlist-review-service')return {reviewAvailability:()=>({ready:process.env.YOUTUBE_DERIVED_METRICS_APPROVED==='true',reason:'Terms not confirmed'}),analyzePlaylistTrack:async(track)=>{analyseCalls++;return {key:JSON.stringify([track.artist.toLowerCase(),track.title.toLowerCase()]),status:'ready',summary:{status:'ready',score:track.title.startsWith('negative')?-.4:.4,sampleCount:3,analyzedAt:new Date().toISOString()}};}};
 if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
 if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));
 return require(id);
 });return m.exports;}
const {GET,POST}=load('app/api/station/reviews/route.ts');
const {readReviewStream}=load('lib/read-review-stream.ts');
const request=(tracks=[{title:'song',artist:'artist'}],origin='https://test.invalid')=>new Request('https://test.invalid/api/station/reviews',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({tracks})});
(async()=>{
 const old=process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
 try{
  delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
  assert.equal((await POST(request())).status,401);
  signedIn=true;
  assert.equal((await POST(request(undefined,'https://evil.invalid'))).status,403);
  for(const invalid of [[],Array.from({length:21},(_,i)=>({title:String(i),artist:'a'})),[{title:' ',artist:'a'}],[{title:'a',artist:'a',durationMs:NaN}],[{title:'a',artist:'a'},{title:'a',artist:'a'}]]){
   assert.equal((await POST(request(invalid))).status,400);
  }
  const status=await GET(new Request('https://test.invalid/api/station/reviews'));
  assert.equal(status.status,200);assert.equal((await status.json()).ready,false);
  assert.equal((await POST(request())).status,503);assert.equal(analyseCalls,0);
  process.env.YOUTUBE_DERIVED_METRICS_APPROVED='true';
  const candidates=Array.from({length:20},(_,i)=>({title:(i<4?'negative':'positive')+i,artist:'artist'+i}));
  const response=await POST(request(candidates));assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.ok(response.headers.get('content-type').includes('ndjson'));
  const events=[];await readReviewStream(response,e=>events.push(e),new AbortController().signal);
  assert.equal(analyseCalls,20);assert.equal(events.filter(e=>e.type==='progress').length,20);
  assert.equal(events.at(-1).type,'complete');assert.equal(events.at(-1).total,20);
  assert.equal(events[0].result.summary.score,-.4);
  assert.equal((await POST(request())).status,429);
  failAuth=true;const failed=await GET(new Request('https://test.invalid/api/station/reviews'));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private auth error'));
  console.log('PASS: authenticated 20-track stream, exact cap, request validation, origin, disabled-provider no analysis, private response, throttling and auth outage. Mock auth/model only.');
 }finally{if(old===undefined)delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;else process.env.YOUTUBE_DERIVED_METRICS_APPROVED=old;}
})().catch(e=>{console.error(e);process.exitCode=1;});
