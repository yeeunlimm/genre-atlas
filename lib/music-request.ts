import {AsyncLocalStorage} from "node:async_hooks";

// Workers may reuse completed data, but must not share in-flight I/O between requests.
type Scope={signal:AbortSignal;pending:Map<string,Promise<any>>};
const scopes=new AsyncLocalStorage<Scope>();
export function musicRequest<T>(fn:()=>Promise<T>,milliseconds=30000):Promise<T>{
  return scopes.run({signal:AbortSignal.timeout(milliseconds),pending:new Map()},fn);
}
export const musicPending=()=>scopes.getStore()?.pending;
export function musicSignal(milliseconds:number){
  const parent=scopes.getStore()?.signal;
  return parent?AbortSignal.any([parent,AbortSignal.timeout(milliseconds)]):AbortSignal.timeout(milliseconds);
}
export function musicAborted(){return scopes.getStore()?.signal.aborted||false;}
export class MusicLookupError extends Error{
  constructor(public provider:string,public stage:string,public code:string,public upstreamStatus?:number){
    super(`${provider} ${stage}: ${code}${upstreamStatus?` (HTTP ${upstreamStatus})`:""}. Try another source or retry shortly.`);
  }
}
export function logMusicError(provider:string,stage:string,error:unknown){
  const e=error instanceof MusicLookupError?error:undefined;
  // No queries, response bodies, headers, credentials or user identifiers in logs.
  console.error(JSON.stringify({event:"music_lookup_failed",provider:e?.provider||provider,stage:e?.stage||stage,code:e?.code||(error instanceof Error?error.name:"unknown"),status:e?.upstreamStatus}));
}
export async function musicJson(url:string,provider:string,stage:string,init:RequestInit={},timeout=6500):Promise<Record<string,any>>{
  try{
    const response=await fetch(url,{...init,signal:musicSignal(timeout)});
    if(!response.ok)throw new MusicLookupError(provider,stage,"upstream_error",response.status);
    try{return await response.json() as Record<string,any>;}catch(e){if(musicAborted()||(e instanceof Error&&/Abort|Timeout/.test(e.name)))throw e;throw new MusicLookupError(provider,stage,"invalid_response");}
  }catch(e){
    const error=e instanceof MusicLookupError?e:new MusicLookupError(provider,stage,e instanceof Error&&/Abort|Timeout/.test(e.name)?"timeout":"network_error");
    logMusicError(provider,stage,error);throw error;
  }
}
