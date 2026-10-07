// Server only: no comment text, credentials or model weights are sent to the browser.
import {reviewKey} from './liked-playlist';
import {summarizeScoredReviews,type ScoredReview} from './review-sentiment';
import {youtubeReviewComments,REVIEW_COMMENT_LIMIT,YouTubeCommentError,type CommentBatch} from './youtube-review-comments';
import {findReviewVideos,ReviewProviderError} from './youtube-review-match';
import type {ReviewTrack,TrackReview,ReviewAvailability} from './playlist-review-types';

export function reviewAvailability(config:NodeJS.ProcessEnv=process.env):ReviewAvailability{
  if(!config.YOUTUBE_API_KEY?.trim())return {ready:false,reason:'Playlist creation is paused: the server YouTube key is not configured. No songs were analysed; your likes are unchanged.'};
  return {ready:true};
}

// Best-effort warm-worker cache, not a durable daily job or cross-instance quota lock.
const cache=new Map<string,{expires:number;result:TrackReview}>();
export const REVIEW_VIDEO_ATTEMPT_LIMIT=3;
export async function analyzePlaylistTrack(track:ReviewTrack,signal:AbortSignal):Promise<TrackReview>{
  const key=process.env.YOUTUBE_API_KEY?.trim();
  if(!key)throw new Error('YouTube server key is not configured.');
  signal.throwIfAborted();
  const id=reviewKey(track),cacheKey=JSON.stringify([id,track.primaryArtistName||'',track.durationMs||0,process.env.SENTIMENT_LEXICON_PATH||'']);
  const hit=cache.get(cacheKey);
  if(hit&&hit.expires>Date.now())return hit.result;
  signal.throwIfAborted();
  const videos=await findReviewVideos(track,key,signal);
  const attempted=new Set<string>();
  let alternateSearch=false,disabled=0,empty=0,missing=0,analysed=false;
  let result:TrackReview={key:id,status:'no-match',reason:'No sufficiently matched artist recording was found.'};
  while(attempted.size<REVIEW_VIDEO_ATTEMPT_LIMIT){
    signal.throwIfAborted();
    const video=videos.shift();
    if(!video){
      // Only unavailable comments justify a second search. Never search for a
      // more flattering audience after seeing a score or unusable review text.
      if(!attempted.size||alternateSearch)break;
      alternateSearch=true;
      videos.push(...(await findReviewVideos(track,key,signal,fetch,'video')).filter(v=>!attempted.has(v.id)));
      continue;
    }
    if(attempted.has(video.id))continue;
    attempted.add(video.id);
    const source={key:id,videoId:video.id,videoTitle:video.snippet.title};
    let batch:CommentBatch;
    try{
      batch=await youtubeReviewComments(video.id,key,(input,init)=>fetch(input,{...init,signal:AbortSignal.any([signal,init?.signal||AbortSignal.timeout(15000)])}));
    }catch(error){
      signal.throwIfAborted();
      if(error instanceof YouTubeCommentError&&error.kind==='video-unavailable'){
        missing++;result={...source,status:'unavailable',reason:'The matched recording is unavailable.'};continue;
      }
      // Quota, credentials and global provider trouble affect every video;
      // stop the batch instead of multiplying failed requests across songs.
      throw new ReviewProviderError(error instanceof YouTubeCommentError&&error.kind==='quota'?'quota':'provider');
    }
    signal.throwIfAborted();
    if(batch.status==='disabled'){
      disabled++;result={...source,status:'comments-disabled'};continue;
    }
    if(batch.status==='empty'){
      empty++;result={...source,status:'no-evidence'};continue;
    }
    {
      const {analyzeReview}=await import('./review-analyzer.mjs');
      const predictions:ScoredReview[]=[];
      for(const row of batch.comments.slice(0,REVIEW_COMMENT_LIMIT)){
        signal.throwIfAborted();const prediction=await analyzeReview(row.text);
        if(prediction)predictions.push({commentId:row.id,relevantToSong:true,...prediction} as ScoredReview);
      }
      signal.throwIfAborted();
      const summary=summarizeScoredReviews(predictions);
      result={...source,status:summary.status,summary,...(summary.status==='no-evidence'?{reason:'No usable song-evaluation comments were found in the supported languages.'}:{})};
      analysed=true;
      break;
    }
  }
  if(!analysed&&attempted.size){
    const count=attempted.size;
    result={...result,status:disabled===count?'comments-disabled':missing===count?'unavailable':'no-evidence',reason:
      disabled===count?`Comments are disabled on all ${count} matched recording(s) checked.`:
      `No accessible comments after checking ${count} matched recording(s): ${disabled} disabled, ${empty} empty, ${missing} unavailable.`};
  }
  result={...result,videosChecked:attempted.size};
  for(const [key,value] of cache)if(value.expires<=Date.now())cache.delete(key);
  if(cache.size>=500)cache.delete(cache.keys().next().value!);
  cache.set(cacheKey,{expires:Date.now()+(result.status==='ready'?86400000:3600000),result});
  return result;
}
