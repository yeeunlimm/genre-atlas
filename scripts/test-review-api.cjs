const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
let signedIn=false,store={version:1,items:[]};
function load(file){file=path.resolve(file);const m={exports:{}};new Function('exports','module','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,id=>{
 if(id==='@/lib/supabase/server')return {verifiedAccount:async()=>signedIn?{id:'test-user'}:null};
 if(id==='node:fs/promises')return {readFile:async()=>JSON.stringify(store)};
 if(id.startsWith('@/'))return load(id.slice(2)+'.ts');
 if(id.startsWith('.'))return load(path.resolve(path.dirname(file),id+'.ts'));
 return require(id);
});return m.exports;}
const {GET,POST}=load('app/api/station/reviews/route.ts');
const request=(origin='https://test.invalid',tracks=[])=>new Request('https://test.invalid/api/station/reviews',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({tracks})});
(async()=>{
 const oldMode=process.env.NODE_ENV,oldApproval=process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
 try{
  process.env.NODE_ENV='development';
  assert.equal((await POST(request())).status,401);
  signedIn=true;assert.equal((await POST(request('https://evil.invalid'))).status,403);
  assert.equal((await POST(request('https://test.invalid',Array(101).fill({title:'x',artist:'a'})))).status,400);
  assert.equal((await GET(new Request('https://test.invalid/api/station/reviews'))).status,503);
  const song={title:'fixture song',artist:'fixture artist'};
  store.items=[{...song,status:'ready',score:.5,sampleCount:2,analyzedAt:new Date().toISOString()}];
  assert.equal((await GET(new Request('https://test.invalid/api/station/reviews'))).status,200);
  const response=await POST(request('https://test.invalid',[song]));
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(Object.keys((await response.json()).summaries).length,1);
  store.items[0].score=0;
  assert.equal(Object.keys((await (await POST(request('https://test.invalid',[song]))).json()).summaries).length,0);
  process.env.NODE_ENV='production';delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
  assert.equal((await POST(request())).status,503);
  console.log('PASS: review API sign-in, origin, request bounds, private cache, fresh/positive gate and production guard. Auth/data mocked, not a live login test.');
 }finally{if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;if(oldApproval===undefined)delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;else process.env.YOUTUBE_DERIVED_METRICS_APPROVED=oldApproval;}
})().catch(e=>{console.error(e);process.exitCode=1;});
