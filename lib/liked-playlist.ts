import {mergeCandidates,rankCandidates,songKey,type Candidate,type Memory} from './hybrid-station';
import {onePerArtist} from './discovery-station';
import {positiveReviewCandidates,type ReviewSummary} from './review-sentiment';
import type {StationTrack} from './station-catalog';
export const reviewKey=(track:{artist:string;title:string})=>JSON.stringify([track.artist.normalize('NFKC').toLowerCase().trim(),track.title.normalize('NFKC').toLowerCase().trim()]);
export const PLAYLIST_CANDIDATE_LIMIT=20;
export const PLAYLIST_TRACK_LIMIT=10;

// Rank from likes FIRST. Only this fixed shortlist is eligible for comment analysis.
// Filtering dislikes, repeats, liked recordings/albums and artist duplicates here
// avoids spending comment requests on songs that cannot enter the final playlist.
export function shortlistLikedCandidates(rows:Candidate[],liked:StationTrack[],memory:Memory,recent:Record<string,number>,now=Date.now(),score?:(row:Candidate)=>number){
  if(!liked.length)return [];
  return rankCandidates(rows,liked,{...memory,recent},[],now,score).slice(0,PLAYLIST_CANDIDATE_LIMIT);
}

// No station queue/current song is accepted by this API.
export async function collectLikedCandidates(liked:StationTrack[],lookup:(seed:StationTrack,route:'related-artists'|'similar-tracks'|'credits')=>Promise<Candidate[]>,signal:AbortSignal,onProgress?:(completed:number,total:number)=>void){
  const seeds=liked.slice(0,5),jobs=seeds.flatMap(seed=>(['related-artists','similar-tracks','credits'] as const).map(route=>({seed,route})));
  const rows:Candidate[]=[];let cursor=0,failed=0,completed=0;
  await Promise.all([0,1].map(async()=>{while(cursor<jobs.length){signal.throwIfAborted();const job=jobs[cursor++];try{rows.push(...await lookup(job.seed,job.route));}catch(e){signal.throwIfAborted();failed++;}finally{if(!signal.aborted)onProgress?.(++completed,jobs.length);}}}));
  return {rows:mergeCandidates(rows),failed,total:jobs.length};
}
export function selectLikedPlaylist(rows:Candidate[],liked:StationTrack[],memory:Memory,recent:Record<string,number>,reviews:Map<string,ReviewSummary>,now=Date.now(),score?:(row:Candidate)=>number){
  // Enforce the prerequisite in the selection layer too, not just the button.
  if(!liked.length)return [];
  // Validate every summary before sorting; missing/nonpositive/stale evidence
  // cannot fill an empty slot. Do not cap the gate before comparing all scores.
  const filtered=rows.filter(row=>positiveReviewCandidates([{trackId:reviewKey(row.track)}],reviews,now).length>0);
  // Reuse the usual exclusions and preference scores without its early artist
  // deduplication: the highest sentiment song must win within an artist too.
  const eligible=mergeCandidates(filtered).flatMap(row=>rankCandidates([row],liked,{...memory,recent},[],now,score));
  const ranked=eligible.sort((a,b)=>(reviews.get(reviewKey(b.track))!.score!-reviews.get(reviewKey(a.track))!.score!)||
    b.score-a.score||songKey(a.track).localeCompare(songKey(b.track)));
  return onePerArtist(ranked).slice(0,PLAYLIST_TRACK_LIMIT) as Candidate[];
}
