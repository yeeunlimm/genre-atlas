const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,dependencies){const m={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,name=>{if(!(name in dependencies))throw new Error(name);return dependencies[name]},m);return m.exports;}
const {safeAuthReturn}=load('lib/auth-return.ts',{});
for(const value of ['https://evil.example','//evil.example','/\\evil.example','/auth/callback','/\n/evil.example',null])assert.equal(safeAuthReturn(value),'/');
assert.equal(safeAuthReturn('/?stationTrack=deezer:123#discovery-station'),'/?stationTrack=deezer%3A123#discovery-station');
let verifiedToken,reply={data:{user:{id:'verified-user'}},error:null};
process.env.NEXT_PUBLIC_SUPABASE_URL='https://example.supabase.co';process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='test-public-key';
const auth=load('lib/supabase/server.ts',{'@supabase/supabase-js':{createClient:()=>({auth:{getUser:async token=>{verifiedToken=token;return reply;}}})}});
const route=load('app/api/station/session/route.ts',{'@/lib/supabase/server':auth,'@/lib/station-catalog':{stationCatalog:[]}});
const req=(method='GET',headers={},body)=>new Request('https://example.test/api/station/session',{method,headers,...(body?{body:JSON.stringify(body)}:{})});
(async()=>{
 assert.equal((await (await route.GET(req('GET',{'oai-authenticated-user-id':'spoof','oai-authenticated-user-email':'spoof@example.test'}))).json()).userId,null);
 assert.equal((await route.POST(req('POST',{}, {trackId:'deezer:1',userId:'spoof'}))).status,401);
 const h={Authorization:'Bearer verified-token',Origin:'https://example.test','Content-Type':'application/json'};
 const ok=await route.POST(req('POST',h,{trackId:'deezer:1',userId:'spoof'}));
 assert.equal(ok.status,200);assert.equal((await ok.json()).userId,'verified-user');assert.equal(verifiedToken,'verified-token');
 assert.equal((await route.POST(req('POST',{...h,Origin:'https://evil.example'},{trackId:'deezer:1'}))).status,403);
 assert.equal((await route.POST(req('POST',h,{trackId:'bad'}))).status,400);
 reply={data:{user:null},error:{status:401}};assert.equal((await route.POST(req('POST',h,{trackId:'deezer:1'}))).status,401);
 reply={data:{user:null},error:{status:503}};assert.equal((await route.POST(req('POST',h,{trackId:'deezer:1'}))).status,503);
 console.log('PASS: safe login return, forged identity ignored, verified bearer ownership, anonymous/invalid/cross-origin denied, outages fail closed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
