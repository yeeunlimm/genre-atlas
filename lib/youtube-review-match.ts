import type {ReviewTrack} from './playlist-review-types';

export type ReviewVideo={id:string;snippet:{title:string;channelTitle:string;categoryId?:string};contentDetails:{duration:string}};
const normalize=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replaceAll('$','s').replace(/&(?:amp;)?/g,' and ').replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
const compact=(value:string)=>normalize(value).replaceAll(' ','');
const presentation=/\b(?:official\s+)?(?:audio|music video|lyric video|lyrics|visualizer|video|hd|hq|4k)\b/gi;
const variants=/\b(?:remix|cover|karaoke|instrumental|live|sped up|slowed|nightcore|reaction|tutorial|remaster(?:ed)?|acoustic|clean|radio edit)\b/gi;
function seconds(duration:string){const m=/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/.exec(duration);return m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):0;}

// Conservative metadata match, not a claim that a channel is YouTube-verified.
// A song/artist mention in an unrelated uploader's title is not enough.
export function matchReviewVideo(track:ReviewTrack,videos:ReviewVideo[]):ReviewVideo|null{
  const artist=track.primaryArtistName||track.artist;
  const channelArtist=compact(artist);
  const title=normalize(track.title);
  if(!channelArtist||!title)return null;
  const matches=videos.filter(v=>{
    if(!/^[\w-]{11}$/.test(v.id)||v.snippet.categoryId!=='10')return false;
    const channel=compact(v.snippet.channelTitle.replace(/(?:\s*-\s*topic|vevo|official)\s*$/i,''));
    if(channel!==channelArtist)return false;
    const normalized=normalize(v.snippet.title);
    if([...(normalized.match(variants)||[])].some(word=>!title.includes(word)))return false;
    const stripped=normalize(v.snippet.title.replace(presentation,''));
    const artistTitle=normalize(artist+' '+track.title);
    const titleArtist=normalize(track.title+' '+artist);
    if(![title,artistTitle,titleArtist].includes(stripped))return false;
    const duration=seconds(v.contentDetails.duration);
    if(duration<30||duration>1800)return false;
    if(track.durationMs&&Math.abs(duration-track.durationMs/1000)>Math.max(12,track.durationMs/1000*.05))return false;
    return true;
  });
  // Prefer a Topic/official audio recording over a music video with a long intro.
  return matches.sort((a,b)=>Number(/topic|official audio/i.test(b.snippet.channelTitle+' '+b.snippet.title))-Number(/topic|official audio/i.test(a.snippet.channelTitle+' '+a.snippet.title)))[0]||null;
}

export class ReviewProviderError extends Error { constructor(public kind:'quota'|'provider'){super(kind==='quota'?'YouTube request quota is exhausted. Try again after it resets.':'YouTube lookup is unavailable. Try again later.');} }
export async function findReviewVideo(track:ReviewTrack,key:string,signal:AbortSignal,request:typeof fetch=fetch){
  async function get(resource:string,params:Record<string,string>){
    const response=await request('https://www.googleapis.com/youtube/v3/'+resource+'?'+new URLSearchParams(params),{headers:{'X-Goog-Api-Key':key},cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});
    const body=await response.json() as {error?:{errors?:{reason:string}[]};items?:unknown[]};
    if(!response.ok)throw new ReviewProviderError(body.error?.errors?.some((e:{reason:string})=>e.reason==='quotaExceeded')?'quota':'provider');
    return body;
  }
  const search=await get('search',{part:'snippet',type:'video',videoCategoryId:'10',maxResults:'5',q:track.artist+' '+track.title+' official audio',fields:'items(id/videoId)'});
  const ids=(search.items||[]).map(v=>(v as {id?:{videoId?:string}})?.id?.videoId).filter((id:unknown)=>typeof id==='string'&&/^[\w-]{11}$/.test(id)).slice(0,5);
  if(!ids.length)return null;
  const videos=await get('videos',{part:'snippet,contentDetails',id:ids.join(','),fields:'items(id,snippet(title,channelTitle,categoryId),contentDetails(duration))'});
  return matchReviewVideo(track,(Array.isArray(videos.items)?videos.items:[]) as ReviewVideo[]);
}
