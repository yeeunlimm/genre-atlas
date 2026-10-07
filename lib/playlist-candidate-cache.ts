import type {Candidate} from './hybrid-station';
import {reviewKey} from './liked-playlist';
import type {TrackReview} from './playlist-review-types';

// A display snapshot, never input to fresh recommendation or sentiment selection.
export type CandidateSnapshot={version:1;generatedAt:string;candidates:Candidate[];reviews:Record<string,TrackReview>;selectedKeys:string[]|null};
export const candidateCacheKey=(userId:string)=>'genre-atlas.playlist-candidates.v1:'+encodeURIComponent(userId);
const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=4000;
const date=(v:unknown):v is string=>text(v)&&Number.isFinite(Date.parse(v));
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=150;
export function readCandidateSnapshot(raw:string|null):CandidateSnapshot|null{
  try{
    if(!raw||raw.length>500000)return null;
    const v=JSON.parse(raw);
    if(!object(v)||v.version!==1||!date(v.generatedAt)||!Array.isArray(v.candidates)||!v.candidates.length||v.candidates.length>20)return null;
    const candidates:Candidate[]=[],reviews:Record<string,TrackReview>={};
    for(const row of v.candidates){
      const t=object(row)&&object(row.track)?row.track:null;
      if(!t||!['id','title','artist','album'].every(k=>text(t[k]))||!t.id||!t.title||!t.artist)return null;
      const track:Candidate['track']={id:t.id as string,title:t.title as string,artist:t.artist as string,album:t.album as string,
        recordingId:text(t.recordingId)?t.recordingId:t.id as string,artistId:text(t.artistId)?t.artistId:t.artist as string,
        albumFamily:text(t.albumFamily)?t.albumFamily:'',checkedAt:text(t.checkedAt)?t.checkedAt:'',source:{label:'Saved candidate',url:''},genres:[],credits:[]};
      for(const k of ['primaryArtistName','artworkUrl','artworkReleaseId'] as const)if(text(t[k]))track[k]=t[k];
      if(typeof t.durationMs==='number'&&Number.isFinite(t.durationMs)&&t.durationMs>0)track.durationMs=t.durationMs;
      const key=reviewKey(track);if(candidates.some(c=>reviewKey(c.track)===key))return null;
      candidates.push({track,score:0,feedbackBoost:false,reasons:[],paths:[]});
      const r=object(v.reviews)?v.reviews[key]:null;
      if(!object(r)||!['ready','no-match','comments-disabled','no-evidence','unavailable'].includes(String(r.status)))continue;
      const review:TrackReview={key,status:r.status as TrackReview['status']};
      if(text(r.reason))review.reason=r.reason;
      if(text(r.videoId)&&/^[\w-]{11}$/.test(r.videoId))review.videoId=r.videoId;
      if(count(r.videosChecked)&&r.videosChecked<=3)review.videosChecked=r.videosChecked;
      const s=r.summary;
      if(object(s)&&s.status==='ready'&&typeof s.score==='number'&&Number.isFinite(s.score)&&Math.abs(s.score)<=1&&count(s.sampleCount)&&s.sampleCount>0&&date(s.analyzedAt))
        review.summary={status:'ready',score:s.score,sampleCount:s.sampleCount,analyzedAt:s.analyzedAt};
      if(review.status==='ready'&&!review.summary)continue;
      const f=r.selectionFallback;
      if(object(f)&&f.status==='no-comments'&&f.score===0&&f.sampleCount===0&&date(f.checkedAt)&&count(f.videosChecked)&&f.videosChecked>=1&&f.videosChecked<=3&&count(f.disabled)&&count(f.empty)&&f.disabled+f.empty===f.videosChecked)
        review.selectionFallback={status:'no-comments',score:0,sampleCount:0,checkedAt:f.checkedAt,videosChecked:f.videosChecked,disabled:f.disabled,empty:f.empty};
      reviews[key]=review;
    }
    const keys=new Set(candidates.map(c=>reviewKey(c.track)));
    const selectedKeys=Array.isArray(v.selectedKeys)?[...new Set(v.selectedKeys.filter((k:unknown):k is string=>text(k)&&keys.has(k)))].slice(0,10) as string[]:null;
    return {version:1,generatedAt:v.generatedAt,candidates,reviews,selectedKeys};
  }catch{return null;}
}
export function saveCandidateSnapshot(storage:Pick<Storage,'setItem'>,key:string,snapshot:CandidateSnapshot):boolean{
  try{const safe=readCandidateSnapshot(JSON.stringify(snapshot));if(!safe)return false;storage.setItem(key,JSON.stringify(safe));return true;}catch{return false;}
}
