// Read-only, bounded checks. No keys, cookies, response bodies or visitor tokens are printed.
const fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};modules[name]=m.exports;new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return m.exports;}
const nativeFetch=global.fetch;
global.fetch=async(input,init)=>{
 const url=new URL(input),started=Date.now();const response=await nativeFetch(input,init);
 const info={host:url.hostname,path:url.pathname,status:response.status,ms:Date.now()-started,type:response.headers.get('content-type')?.split(';')[0]};
 if(!response.ok){
  const body=(await response.clone().text()).slice(0,32768);
  info.bodyBytes=body.length;
  info.signals={googlePermission:/Your client does not have permission/i.test(body),unusualTraffic:/unusual traffic/i.test(body),automatedQueries:/automated queries/i.test(body),botCheck:/not a bot|captcha/i.test(body),rateLimit:/too many requests|rate.?limit|quota.?exceeded/i.test(body),loginRequired:/sign in|login required|unauthenticated/i.test(body),cloudflare:/cloudflare/i.test(body),proxyPolicy:/proxy|egress|blocked by policy|robots_denied/i.test(body),accessDenied:/access denied|forbidden/i.test(body)};
  try{const d=JSON.parse(body);info.jsonKeys=Object.keys(d).filter(k=>['error','errors','message','status','code'].includes(k));info.errorCode=Number.isInteger(d.error?.code)?d.error.code:undefined;info.errorStatus=['PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAUTHENTICATED','INVALID_ARGUMENT','NOT_FOUND'].includes(d.error?.status)?d.error.status:undefined;}catch{}
 }
 console.log(JSON.stringify({request:info}));return response;
};
async function main(){
 if(process.argv[2]==='youtube'){
  const net=load('music-request'),yt=load('youtube-music');
  const found=await net.musicRequest(()=>yt.music('search','Tame Impala'));
  const artist=found.artists.find(a=>a.name.toLowerCase()==='tame impala');
  console.log(JSON.stringify({artistFound:!!artist,count:found.artists.length}));
  if(artist){const result=await net.musicRequest(()=>yt.music('artist',artist.id));console.log(JSON.stringify({artist:result.artist.name,related:result.related.length,id:artist.id}));}
 }else if(process.argv[2]==='catalog'){
  for(const q of ["Boy's a liar PinkPantheress",'artist:"PinkPantheress" track:"Boy\'s a liar"']){
   const r=await fetch('https://api.deezer.com/search?'+new URLSearchParams({q,limit:'25'}),{signal:AbortSignal.timeout(10000)});const d=await r.json();
   console.log(JSON.stringify({query:q,total:d.total,rows:(d.data||[]).slice(0,8).map(t=>({id:t.id,title:t.title,artist:t.artist.name,artistId:t.artist.id,album:t.album.title,readable:t.readable}))}));
  }
 }
}
main().catch(e=>{console.error(JSON.stringify({failed:e.provider||'probe',code:e.code||e.name,status:e.upstreamStatus}));process.exitCode=1;});
