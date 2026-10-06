// Anonymous request setup adapted from ytmusicapi 1.12.3 (MIT).
// See THIRD_PARTY_NOTICES.txt. No account cookies, API keys or proxy fallback.
import {musicJson,musicPending,musicSignal,MusicLookupError,logMusicError} from "./music-request";
import {YOUTUBE_TIMEOUT_MS} from "./music-timeouts";

const ORIGIN="https://music.youtube.com";
const BOOTSTRAP_TIMEOUT_MS=5000;
const MAX_HTML_BYTES=4*1024*1024;
const headers={
 "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0",
 Accept:"*/*",Origin:ORIGIN,
};
type ClientConfig={visitorData?:string;clientVersion?:string};
// Only completed values cross Worker request boundaries, never pending fetches.
let cached:{value:ClientConfig;expires:number}|undefined;

export function parseClientConfig(html:string):ClientConfig{
 const config:ClientConfig={};
 for(const match of html.matchAll(/ytcfg\.set\s*\(\s*({[\s\S]*?})\s*\)\s*;/g)){
  try{
   const raw=JSON.parse(match[1]),client=raw.INNERTUBE_CONTEXT?.client;
   const visitor=raw.VISITOR_DATA||client?.visitorData;
   const version=raw.INNERTUBE_CLIENT_VERSION||client?.clientVersion;
   if(typeof visitor==="string"&&visitor.length<=4096&&/^[\x21-\x7e]+$/.test(visitor))config.visitorData=visitor;
   if(typeof version==="string"&&/^1\.\d{8}\.\d{2}\.\d{2}$/.test(version))config.clientVersion=version;
  }catch{/* Public page data is parsed as JSON, never evaluated. */}
 }
 return config;
}

async function readHtml(response:Response){
 if(!response.body)throw new MusicLookupError("YouTube Music","bootstrap","invalid_response");
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,html="";
 try{
  while(true){const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>MAX_HTML_BYTES){await reader.cancel();throw new MusicLookupError("YouTube Music","bootstrap","response_too_large");}
   html+=decoder.decode(value,{stream:true});
  }
  return html+decoder.decode();
 }finally{reader.releaseLock();}
}

async function clientConfig():Promise<ClientConfig>{
 if(cached&&cached.expires>Date.now())return cached.value;
 const jobs=musicPending(),key="youtube:anonymous-client";
 if(jobs?.has(key))return jobs.get(key)!;
 const job=(async()=>{
  try{
   // Workers supports manual/follow redirects; never forward these headers to another host.
   const response=await fetch(ORIGIN,{headers,signal:musicSignal(BOOTSTRAP_TIMEOUT_MS),redirect:"manual"});
   if(!response.ok)throw new MusicLookupError("YouTube Music","bootstrap","upstream_error",response.status);
   const value=parseClientConfig(await readHtml(response));
   cached={value,expires:Date.now()+30*60*1000};
   console.info(JSON.stringify({event:"youtube_client_ready",adapter:"ytmusicapi-1.12.3-js",visitorConfigured:!!value.visitorData,versionSource:value.clientVersion?"page":"date"}));
   return value;
  }catch(e){
   const error=e instanceof MusicLookupError?e:new MusicLookupError("YouTube Music","bootstrap",e instanceof Error&&/Abort|Timeout/.test(e.name)?"timeout":"network_error");
   logMusicError("YouTube Music","bootstrap",error);throw error;
  }finally{jobs?.delete(key);}
 })();
 jobs?.set(key,job);return job;
}

export async function youtubeRequest(endpoint:"search"|"browse",body:Record<string,unknown>){
 const config=await clientConfig();
 const clientVersion=config.clientVersion||"1."+new Date().toISOString().slice(0,10).replaceAll("-","")+".01.00";
 const context={client:{clientName:"WEB_REMIX",clientVersion,hl:"en",gl:"KR"},user:{}};
 const data=await musicJson(ORIGIN+"/youtubei/v1/"+endpoint+"?alt=json","YouTube Music",endpoint,{
  method:"POST",headers:{...headers,"Content-Type":"application/json",...(config.visitorData?{"X-Goog-Visitor-Id":config.visitorData}:{})},
  body:JSON.stringify({...body,context}),
 },YOUTUBE_TIMEOUT_MS);
 if(data.error){
  const error=new MusicLookupError("YouTube Music",endpoint,"api_error",Number.isInteger(data.error.code)?data.error.code:undefined);
  logMusicError("YouTube Music",endpoint,error);throw error;
 }
 return data;
}
