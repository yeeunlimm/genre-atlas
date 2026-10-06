const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const code=ts.transpileModule(fs.readFileSync('lib/music-diagnostics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('exports','require','module',code)(m.exports,require,m);const {classifyMusicFailure,inspectMusicFailure}=m.exports;
async function main(){
 const secret='NEVER_LOG_PRIVATE_TOKEN',privateText='user@example.test 192.0.2.1 https://example.test/?key='+secret;
 const body=JSON.stringify({error:{status:'PERMISSION_DENIED',message:privateText,errors:[{reason:'forbidden'},{reason:secret}],details:[{reason:'API_KEY_INVALID',metadata:{secret}}]}});
 const result=classifyMusicFailure(body,'application/json');assert.equal(result.apiStatus,'PERMISSION_DENIED');assert.deepEqual(result.apiReasons,['forbidden','API_KEY_INVALID']);assert(!JSON.stringify(result).includes(secret));
 assert.equal(classifyMusicFailure('Your client does not have permission to get URL '+privateText,'text/html').signals.googlePermission,true);
 const logs=[];const original=console.error;console.error=x=>logs.push(x);
 try{
  await inspectMusicFailure(new Response(body,{status:403,headers:{'Content-Type':'application/json','Server':'ESF','Set-Cookie':secret}}),'YouTube Music','browse');
  await inspectMusicFailure(new Response(privateText.repeat(2000),{status:429,headers:{'Content-Type':'text/plain','Retry-After':'60'}}),'Apple','search');
 }finally{console.error=original;}
 assert.equal(JSON.parse(logs[0]).serverFamily,'esf');assert.equal(JSON.parse(logs[1]).bytes,16384);assert.equal(JSON.parse(logs[1]).truncated,true);assert.equal(JSON.parse(logs[1]).retryAfterSeconds,60);
 assert(!logs.join('').includes(secret));assert(!logs.join('').includes('user@example.test'));assert(!logs.join('').includes('192.0.2.1'));
 console.log('PASS: bounded diagnostics, known reason categories, no raw bodies or private values.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
