// Temporary diagnosis: allowlisted categories only, never raw text, IDs, URLs or headers.
const statuses=new Set(['PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAUTHENTICATED','INVALID_ARGUMENT','NOT_FOUND','FAILED_PRECONDITION','UNAVAILABLE']);
const reasons=new Set(['forbidden','quotaExceeded','dailyLimitExceeded','rateLimitExceeded','userRateLimitExceeded','keyInvalid','accessNotConfigured','authError','insufficientPermissions','ipRefererBlocked','API_KEY_INVALID','API_KEY_SERVICE_BLOCKED','API_KEY_HTTP_REFERRER_BLOCKED','API_KEY_IP_ADDRESS_BLOCKED','SERVICE_DISABLED','RATE_LIMIT_EXCEEDED']);
export function classifyMusicFailure(body:string,contentType:string){
 const lower=body.toLowerCase();
 let apiStatus:string|undefined,apiReasons:string[]=[];
 try{const value=JSON.parse(body),error=value?.error;if(statuses.has(error?.status))apiStatus=error.status;
  const entries=[...(Array.isArray(error?.errors)?error.errors:[]),...(Array.isArray(error?.details)?error.details:[])].slice(0,12);
  apiReasons=[...new Set(entries.map(x=>x?.reason).filter(x=>reasons.has(x)))];
 }catch{/* HTML/plain-text rejection pages are not JSON. */}
 return {
  format:/json/i.test(contentType)?'json':/html/i.test(contentType)?'html':/text\/plain/i.test(contentType)?'text':'other',
  apiStatus,apiReasons,
  signals:{
   googlePermission:lower.includes('your client does not have permission'),
   unusualTraffic:lower.includes('unusual traffic'),
   automatedQueries:lower.includes('automated queries')||lower.includes('automated requests'),
   botCheck:/not a bot|captcha/.test(lower),
   rateLimit:/too many requests|rate.?limit|quota.?exceeded/.test(lower),
   loginRequired:/sign in|login required|unauthenticated/.test(lower),
   cloudflare:lower.includes('cloudflare'),
   proxyPolicy:/egress|blocked by policy|robots_denied|proxy access/.test(lower),
   ipBlocked:/ip address.{0,100}(?:blocked|denied|restricted)|(?:blocked|denied|restricted).{0,100}ip address/.test(lower),
   locationBlocked:/not available in your country|not available in your region/.test(lower),
   clientUnsupported:/client is no longer supported|unsupported client/.test(lower),
   apiKeyRejected:/api key not valid|invalid api key|api key expired|unregistered callers/.test(lower),
   callerPermission:lower.includes('the caller does not have permission'),
   accessDenied:/access denied|forbidden/.test(lower),
  },
 };
}
export async function inspectMusicFailure(response:Response,provider:string,stage:string){
 const reader=response.body?.getReader();let text='',bytes=0,truncated=false,readState='complete';
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  if(reader){
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('deadline')),800);});
   const decoder=new TextDecoder();
   while(bytes<16384){const item=await Promise.race([reader.read(),deadline]);if(item.done)break;
    const keep=item.value.subarray(0,16384-bytes);bytes+=keep.byteLength;text+=decoder.decode(keep,{stream:true});
    if(bytes>=16384){truncated=true;break;}
   }
   text+=decoder.decode();
  }
 }catch{readState='incomplete';}
 finally{if(timer)clearTimeout(timer);if(reader)void reader.cancel().catch(()=>{});}
 const server=(response.headers.get('server')||'').toLowerCase();
 const serverFamily=['cloudflare','envoy','nginx','gws','esf','ats','varnish'].find(s=>server===s||server.startsWith(s+'/'))||'other';
 const retry=response.headers.get('retry-after')||'';
 console.error(JSON.stringify({event:'music_upstream_diagnostic_v1',provider,stage,status:response.status,
  bytes,truncated,readState,serverFamily,retryAfterPresent:!!retry,retryAfterSeconds:/^\d{1,6}$/.test(retry)?Number(retry):undefined,
  challengeHeader:response.headers.get('cf-mitigated')==='challenge',...classifyMusicFailure(text,response.headers.get('content-type')||'')}));
}
