import type {ReviewEvent} from './playlist-review-types';

export async function readReviewStream(response:Response,onEvent:(event:ReviewEvent)=>void,signal:AbortSignal){
  if(!response.ok){const body=await response.json() as {error?:string};throw new Error(body.error||'Comment analysis could not start.');}
  if(!response.body)throw new Error('The analysis response is empty.');
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let buffer='',complete=false;
  const abort=()=>{void reader.cancel();};
  signal.addEventListener('abort',abort,{once:true});
  try{
    while(true){
      signal.throwIfAborted();
      const {value,done}=await reader.read();
      signal.throwIfAborted();
      buffer+=decoder.decode(value,{stream:!done});
      if(buffer.length>100000)throw new Error('Analysis response is too large.');
      let newline;
      while((newline=buffer.indexOf('\n'))>=0){
        const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);
        if(!line.trim())continue;
        const event=JSON.parse(line) as ReviewEvent;
        if(!['progress','heartbeat','complete'].includes(event.type)||complete)throw new Error('Invalid analysis response.');
        if(event.type==='complete')complete=true;
        onEvent(event);
      }
      if(done)break;
    }
    if(!complete||buffer.trim())throw new Error('Comment analysis ended early. No incomplete playlist was saved.');
  }finally{signal.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock();}
}
