import {reviewKey} from './liked-playlist';
import {PLAYLIST_CANDIDATE_LIMIT} from './liked-playlist';
import {ReviewProviderError} from './youtube-review-match';
import type {ReviewTrack,TrackReview,ReviewEvent} from './playlist-review-types';

// Serial and bounded: never analyse outside the submitted candidate shortlist.
export function playlistReviewStream(tracks:ReviewTrack[],analyze:(track:ReviewTrack,signal:AbortSignal)=>Promise<TrackReview>,requestSignal:AbortSignal,release:()=>void){
  if(!tracks.length||tracks.length>PLAYLIST_CANDIDATE_LIMIT)throw new Error('Expected 1–'+PLAYLIST_CANDIDATE_LIMIT+' candidates.');
  const cancel=new AbortController();
  const signal=AbortSignal.any([cancel.signal,requestSignal,AbortSignal.timeout(235000)]);
  const encoder=new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller){
      let open=true;
      const send=(event:ReviewEvent)=>{if(open)controller.enqueue(encoder.encode(JSON.stringify(event)+'\n'));};
      const heartbeat=setInterval(()=>{if(!signal.aborted)send({type:'heartbeat'});},10000);
      let stopReason='';
      try{
        for(let index=0;index<tracks.length;index++){
          if(cancel.signal.aborted||requestSignal.aborted)break;
          const track=tracks[index];let result:TrackReview;
          if(signal.aborted)stopReason='The analysis time limit was reached. This song was not analysed.';
          if(stopReason)result={key:reviewKey(track),status:'unavailable',reason:stopReason};
          else try{result=await analyze(track,signal);}catch(error){
            if(error instanceof ReviewProviderError)stopReason=error.message;
            result={key:reviewKey(track),status:'unavailable',reason:stopReason||'Analysis could not finish for this recording. No positive score was assumed.'};
          }
          if(!cancel.signal.aborted&&!requestSignal.aborted)send({type:'progress',completed:index+1,total:tracks.length,result});
        }
        if(!cancel.signal.aborted&&!requestSignal.aborted){send({type:'complete',total:tracks.length});controller.close();}
      }catch{if(!cancel.signal.aborted)controller.error(new Error('Comment analysis stream ended early.'));}
      finally{open=false;clearInterval(heartbeat);release();}
    },
    cancel(){cancel.abort();},
  });
}
