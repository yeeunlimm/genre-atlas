const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
let signedIn=false,analyseCalls=0,failAuth=false,accountId='test-user';
const cache=new Map();
function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const m={exports:{}};cache.set(file,m.exports);
 new Function('exports','module','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,id=>{
 if(id==='@/lib/supabase/server')return {verifiedAccount:async()=>{if(failAuth)throw new Error('private auth error');return signedIn?{id:accountId}:null;}};
 if(id==='@/lib/playlist-review-service')return {...load('lib/playlist-review-service.ts'),analyzePlaylistTrack:async(track)=>{analyseCalls++;return {key:JSON.stringify([track.artist.toLowerCase(),track.title.toLowerCase()]),status:'ready',summary:{status:'ready',score:track.title.startsWith('negative')?-.4:.4,sampleCount:3,analyzedAt:new Date().toISOString()}};}};
 if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
 if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));
 return require(id);
 });return m.exports;}
const {GET,POST}=load('app/api/station/reviews/route.ts');
const {readReviewStream}=load('lib/read-review-stream.ts');
const request=(tracks=[{title:'song',artist:'artist'}],origin='https://test.invalid')=>new Request('https://test.invalid/api/station/reviews',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({tracks})});
(async()=>{
 const oldKey=process.env.YOUTUBE_API_KEY,oldApproval=process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
 try{
  delete process.env.YOUTUBE_API_KEY;
  delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
  assert.equal((await GET(new Request('https://test.invalid/api/station/reviews'))).status,401);
  assert.equal((await POST(request())).status,401);
  signedIn=true;
  assert.equal((await POST(request(undefined,'https://evil.invalid'))).status,403);
  for(const invalid of [[],Array.from({length:31},(_,i)=>({title:String(i),artist:'a'})),[{title:' ',artist:'a'}],[{title:'a',artist:'a',durationMs:NaN}],[{title:'a',artist:'a'},{title:'a',artist:'a'}]]){
   const rejected=await POST(request(invalid));assert.equal(rejected.status,400);assert.ok((await rejected.json()).error.includes('1 and 30'));
  }
  const status=await GET(new Request('https://test.invalid/api/station/reviews'));
  assert.equal(status.status,200);const availability=await status.json();assert.equal(availability.ready,false);assert.equal(availability.candidateLimit,30);assert.equal(availability.playlistLimit,10);
  assert.equal((await POST(request())).status,503);assert.equal(analyseCalls,0);
  process.env.YOUTUBE_DERIVED_METRICS_APPROVED='true';
  process.env.YOUTUBE_API_KEY=' \t\n ';
  assert.equal((await (await GET(new Request('https://test.invalid/api/station/reviews'))).json()).ready,false);
  assert.equal((await POST(request())).status,503);assert.equal(analyseCalls,0);
  process.env.YOUTUBE_API_KEY='fixture-key';
  delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
  assert.equal((await (await GET(new Request('https://test.invalid/api/station/reviews'))).json()).ready,true);
  process.env.YOUTUBE_DERIVED_METRICS_APPROVED='false';
  assert.equal((await (await GET(new Request('https://test.invalid/api/station/reviews'))).json()).ready,true);
  // Thirty tracks with ordinary metadata at every supported field-length limit
  // must fit the existing request body guard, without increasing that guard.
  const candidates=Array.from({length:30},(_,i)=>({title:((i<4?'negative':'positive')+i).padEnd(300,'t'),artist:('artist'+i).padEnd(300,'a'),primaryArtistName:('primary'+i).padEnd(300,'p'),durationMs:180000}));
  assert.ok(JSON.stringify({tracks:candidates}).length<=30000);
  const response=await POST(request(candidates));assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.ok(response.headers.get('content-type').includes('ndjson'));
  const events=[];await readReviewStream(response,e=>events.push(e),new AbortController().signal);
  assert.equal(analyseCalls,30);assert.equal(events.filter(e=>e.type==='progress').length,30);
  assert.equal(events.at(-1).type,'complete');assert.equal(events.at(-1).total,30);
  assert.equal(events[0].result.summary.score,-.4);
  assert.equal((await POST(request())).status,429);
  accountId='another-test-user';delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
  const withoutApproval=await POST(request());assert.equal(withoutApproval.status,200);
  const additional=[];await readReviewStream(withoutApproval,e=>additional.push(e),new AbortController().signal);
  assert.equal(analyseCalls,31);assert.equal(additional.at(-1).type,'complete');assert.equal(additional.at(-1).total,1);
  failAuth=true;const failed=await GET(new Request('https://test.invalid/api/station/reviews'));assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private auth error'));
  console.log('PASS: authenticated 30-track stream with full-length metadata, 31-track rejection, shared availability limits, request validation, origin, missing/blank-key no analysis, absent/false legacy approval does not block, private response, throttling and auth outage. Mock auth/model only.');
 }finally{for(const [key,value] of [['YOUTUBE_API_KEY',oldKey],['YOUTUBE_DERIVED_METRICS_APPROVED',oldApproval]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
})().catch(e=>{console.error(e);process.exitCode=1;});
