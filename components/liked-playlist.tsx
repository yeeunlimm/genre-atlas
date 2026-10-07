"use client";
import {useEffect,useRef,useState} from 'react';
import type {StationTrack} from '@/lib/station-catalog';
import {songKey,type Candidate,type Memory} from '@/lib/hybrid-station';
import {collectLikedCandidates,selectLikedPlaylist} from '@/lib/liked-playlist';
import {featureVector,modelScore,trainRanker,type LearningData} from '@/lib/station-learning';
import type {ReviewSummary} from '@/lib/review-sentiment';
import {trackYouTubeUrl} from '@/lib/discovery-station';
import {accountFetch} from '@/lib/supabase/browser';
import type {LiveStationResult} from '@/lib/live-station';

export function LikedPlaylist({userId,liked,memory,learning}:{userId:string;liked:StationTrack[];memory:Memory;learning:LearningData}){
  const [playlist,setPlaylist]=useState<Candidate[]|null>(null),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null),recent=useRef<Record<string,number>>({});
  const storageKey='genre-atlas.liked-playlist.v1:'+encodeURIComponent(userId);
  useEffect(()=>{try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved&&typeof saved.recent==='object')recent.current=saved.recent;}catch{}return()=>controller.current?.abort();},[storageKey]);
  async function build(){
    if(busy||!liked.length)return;
    const c=new AbortController();controller.current=c;setBusy(true);setError('');setPlaylist(null);setNote('Finding new candidates from your five most recent likes…');
    try{
      async function json<T>(url:string,init?:RequestInit):Promise<T>{const response=await accountFetch(url,{...init,signal:AbortSignal.any([c.signal,AbortSignal.timeout(40000)])});const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error||'A playlist source failed.');return data;}
      await json('/api/station/reviews');
      const result=await collectLikedCandidates(liked,async(seed,route)=>{
        if(route==='credits'){
          const data:LiveStationResult=await json('/api/station?'+new URLSearchParams({id:seed.id,offset:'0'}));
          return data.rows.filter(r=>r.reasons.some(x=>x.kind==='credit'||x.kind==='sample')).map(row=>({...row,paths:[{route:'credits' as const,seedId:seed.id,confidence:Math.min(.95,.6+row.score*.035)}]}));
        }
        return (await json<{rows:Candidate[]}>('/api/station/discover?'+new URLSearchParams({id:seed.id,route,offset:'0'}))).rows;
      },c.signal);
      if(!result.rows.length)throw new Error(result.failed?'Candidate sources could not provide songs. Retry later.':'No connected candidates were found for your likes.');
      const candidates=result.rows.slice(0,100);
      setNote('Checking fresh comment sentiment for '+candidates.length+' candidates…');
      const {summaries}=await json<{summaries:Record<string,ReviewSummary>}>('/api/station/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tracks:candidates.map(r=>({title:r.track.title,artist:r.track.artist}))})});
      c.signal.throwIfAborted();
      const model=trainRanker(learning);
      const selection=selectLikedPlaylist(candidates,liked,memory,recent.current,new Map(Object.entries(summaries) as [string,ReviewSummary][]),Date.now(),model.active?row=>modelScore(model,featureVector(row,liked,learning)):undefined);
      setPlaylist(selection);
      const now=Date.now();recent.current=Object.fromEntries(Object.entries(recent.current).filter(([,at])=>Number.isFinite(at)&&at>now-3*86400000&&at<=now));
      for(const row of selection)recent.current[songKey(row.track)]=now;
      let saved=true;try{localStorage.setItem(storageKey,JSON.stringify({recent:recent.current}));}catch{saved=false;}
      setNote(`${selection.length} tracks passed score > 0. Unanalysed, stale, disliked and recent playlist songs were excluded. ${result.failed?result.failed+' sources failed. ':''}${saved?'':'Repeat history could not be saved.'}`);
    }catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'Playlist creation failed.');setNote('');}}
    finally{if(!c.signal.aborted)setBusy(false);}
  }
  return <section className="station-playlist" aria-label="Playlist from my likes" aria-busy={busy}>
    <h3>Playlist from your likes</h3><p>Separate from song discovery. Uses up to five recent likes and experimental English comment sentiment strictly above zero. One song per artist; at most 10 songs.</p>
    <button disabled={busy||!liked.length} onClick={()=>void build()}>{busy?'Building your personal playlist…':'Make a 10-track playlist'}</button>
    {!liked.length&&<p>Like at least one song to start.</p>}<p role="status">{note}</p>{error&&<p role="alert">{error}</p>}
    {playlist&&<><h3>Your playlist · {playlist.length} tracks</h3>{playlist.length<10&&<p>Not enough eligible, analysed songs to fill 10 slots. No filler tracks were added.</p>}<ol>{playlist.map(r=><li key={songKey(r.track)}><div><b>{r.track.title}</b><small>{r.track.artist} · {r.track.album}</small></div><a href={trackYouTubeUrl(r.track)} target="_blank" rel="noreferrer">Listen ↗</a></li>)}</ol></>}
    <small>Likes and playlist repeat history stay in this browser, separately for your account. This does not save to YouTube.</small>
  </section>;
}
