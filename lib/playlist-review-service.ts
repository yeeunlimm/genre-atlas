// Server only: no comment text, credentials or model weights are sent to the browser.
import {reviewKey} from './liked-playlist';
import {summarizeScoredReviews,type ScoredReview} from './review-sentiment';
import {youtubeReviewComments,REVIEW_COMMENT_LIMIT} from './youtube-review-comments';
import {findReviewVideo} from './youtube-review-match';
import type {ReviewTrack,TrackReview,ReviewAvailability} from './playlist-review-types';

export function reviewAvailability(config:NodeJS.ProcessEnv=process.env):ReviewAvailability{
  if(!config.YOUTUBE_API_KEY?.trim())return {ready:false,reason:'Playlist creation is paused: the server YouTube key is not configured. No songs were analysed; your likes are unchanged.'};
  return {ready:true};
}

// Best-effort warm-worker cache, not a durable daily job or cross-instance quota lock.
const cache=new Map<string,{expires:number;result:TrackReview}>();
export async function analyzePlaylistTrack(track:ReviewTrack,signal:AbortSignal):Promise<TrackReview>{
  const key=process.env.YOUTUBE_API_KEY?.trim();
  if(!key)throw new Error('YouTube server key is not configured.');
  const id=reviewKey(track),cacheKey=JSON.stringify([id,track.primaryArtistName||'',track.durationMs||0,process.env.SENTIMENT_LEXICON_PATH||'']);
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
      const {analyzeReview}=await import('./review-analyzer.mjs');
      const predictions:ScoredReview[]=[];
      for(const row of batch.comments.slice(0,REVIEW_COMMENT_LIMIT)){
        signal.throwIfAborted();const prediction=await analyzeReview(row.text);
        if(prediction)predictions.push({commentId:row.id,relevantToSong:true,...prediction} as ScoredReview);
      }
      signal.throwIfAborted();
      const summary=summarizeScoredReviews(predictions);
      result={...source,status:summary.status,summary,...(summary.status==='no-evidence'?{reason:'No usable song-evaluation comments were found in the supported languages.'}:{})};
    }
  }
  for(const [key,value] of cache)if(value.expires<=Date.now())cache.delete(key);
  if(cache.size>=500)cache.delete(cache.keys().next().value!);
  cache.set(cacheKey,{expires:Date.now()+(result.status==='ready'?86400000:3600000),result});
  return result;
}
