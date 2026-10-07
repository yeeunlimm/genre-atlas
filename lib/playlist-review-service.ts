// Server only: no comment text, credentials or model weights are sent to the browser.
import {reviewKey} from './liked-playlist';
import {summarizeReviews} from './review-sentiment';
import {youtubeReviewComments,assertYouTubeAnalysisApproved} from './youtube-review-comments';
import {findReviewVideo} from './youtube-review-match';
import type {ReviewTrack,TrackReview,ReviewAvailability} from './playlist-review-types';

export function reviewAvailability(config:NodeJS.ProcessEnv=process.env):ReviewAvailability{
  if(config.YOUTUBE_DERIVED_METRICS_APPROVED!=='true')return {ready:false,reason:'Your candidates are ready. YouTube comment analysis is paused until the site owner confirms the required analytics terms. No songs have passed the filter yet.'};
  if(!config.YOUTUBE_API_KEY)return {ready:false,reason:'Your candidates are ready, but the server YouTube key is not configured. No songs have been analysed.'};
  return {ready:true};
}

// Best-effort warm-worker cache, not a durable daily job or cross-instance quota lock.
const cache=new Map<string,{expires:number;result:TrackReview}>();
export async function analyzePlaylistTrack(track:ReviewTrack,signal:AbortSignal):Promise<TrackReview>{
  assertYouTubeAnalysisApproved();
  const key=process.env.YOUTUBE_API_KEY;
  if(!key)throw new Error('YouTube server key is not configured.');
  const id=reviewKey(track),cacheKey=JSON.stringify([id,track.primaryArtistName||'',track.durationMs||0]);
  const hit=cache.get(cacheKey);
  if(hit&&hit.expires>Date.now())return hit.result;
  signal.throwIfAborted();
  const video=await findReviewVideo(track,key,signal);
  let result:TrackReview;
  if(!video)result={key:id,status:'no-match',reason:'No sufficiently matched artist recording was found.'};
  else{
    const batch=await youtubeReviewComments(video.id,key,(input,init)=>fetch(input,{...init,signal:AbortSignal.any([signal,init?.signal||AbortSignal.timeout(15000)])}));
    signal.throwIfAborted();
    const source={key:id,videoId:video.id,videoTitle:video.snippet.title};
    if(batch.status==='disabled')result={...source,status:'comments-disabled',reason:'Comments are disabled on the matched recording.'};
    else{
      const {sentiment,reviewEligibility}=await import('./review-analyzer.mjs');
      const eligible=batch.comments.filter(row=>reviewEligibility(row.text)).slice(0,40);
      const predictions=[];
      for(const row of eligible){signal.throwIfAborted();predictions.push({commentId:row.id,relevantToSong:true,...await sentiment(row.text)});}
      signal.throwIfAborted();
      const summary=summarizeReviews(predictions);
      result={...source,status:summary.status,summary,...(summary.status==='no-evidence'?{reason:'No eligible English song-evaluation comments were found.'}:{})};
    }
  }
  for(const [key,value] of cache)if(value.expires<=Date.now())cache.delete(key);
  if(cache.size>=500)cache.delete(cache.keys().next().value!);
  cache.set(cacheKey,{expires:Date.now()+(result.status==='ready'?86400000:3600000),result});
  return result;
}
