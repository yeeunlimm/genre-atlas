"use client";
import {useEffect,useRef,useState} from 'react';
import type {StationTrack} from '@/lib/station-catalog';
import {songKey,type Candidate,type Memory} from '@/lib/hybrid-station';
import {collectLikedCandidates,shortlistLikedCandidates,selectLikedPlaylist,reviewKey} from '@/lib/liked-playlist';
import {featureVector,modelScore,trainRanker,type LearningData} from '@/lib/station-learning';
import type {ReviewSummary} from '@/lib/review-sentiment';
import type {TrackReview,ReviewAvailability} from '@/lib/playlist-review-types';
import {readReviewStream} from '@/lib/read-review-stream';
import {trackYouTubeUrl} from '@/lib/discovery-station';
import {accountFetch} from '@/lib/supabase/browser';
import type {LiveStationResult} from '@/lib/live-station';

export function LikedPlaylist({userId,liked,memory,learning}:{userId:string;liked:StationTrack[];memory:Memory;learning:LearningData}){
  const [playlist,setPlaylist]=useState<Candidate[]|null>(null),[shortlist,setShortlist]=useState<Candidate[]>([]);
  const [reviews,setReviews]=useState<Record<string,TrackReview>>({}),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
  const controller=useRef<AbortController|null>(null),recent=useRef<Record<string,number>>({});
  const storageKey='genre-atlas.liked-playlist.v1:'+encodeURIComponent(userId);
  const likesKey=JSON.stringify(liked.map(songKey));
  useEffect(()=>{
    recent.current={};
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.recent&&typeof saved.recent==='object')recent.current=saved.recent;}catch{}
    return()=>controller.current?.abort();
  },[storageKey]);
  useEffect(()=>{
    controller.current?.abort();controller.current=null;
    setBusy(false);setPlaylist(null);setShortlist([]);setReviews({});setNote('');setError('');
  },[storageKey,likesKey]);
  async function build(){
    if(controller.current||!liked.length)return;
    const c=new AbortController();controller.current=c;setBusy(true);setError('');setPlaylist(null);setShortlist([]);setReviews({});
    setNote('Choosing up to 20 candidates from your five most recent likes…');
    try{
      async function json<T>(url:string,timeout=40000):Promise<T>{if(timeout<=0)throw new Error('Candidate collection time limit reached.');const response=await accountFetch(url,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(timeout)])});const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error||'A playlist source failed.');return data;}
      const candidateDeadline=Date.now()+90000;
      const result=await collectLikedCandidates(liked,async(seed,route)=>{
        if(route==='credits'){
          const data:LiveStationResult=await json('/api/station?'+new URLSearchParams({id:seed.id,offset:'0'}),Math.min(40000,candidateDeadline-Date.now()));
          return data.rows.filter(r=>r.reasons.some(x=>x.kind==='credit'||x.kind==='sample')).map(row=>({...row,paths:[{route:'credits' as const,seedId:seed.id,confidence:Math.min(.95,.6+row.score*.035)}]}));
        }
        return (await json<{rows:Candidate[]}>('/api/station/discover?'+new URLSearchParams({id:seed.id,route,offset:'0'}),Math.min(40000,candidateDeadline-Date.now()))).rows;
      },c.signal,(completed,total)=>setNote('Choosing candidates · '+completed+' / '+total+' sources checked…'));
      c.signal.throwIfAborted();
      const model=trainRanker(learning);
      const score=model.active?(row:Candidate)=>modelScore(model,featureVector(row,liked,learning)):undefined;
      const candidates=shortlistLikedCandidates(result.rows,liked,memory,recent.current,Date.now(),score);
      if(!candidates.length)throw new Error(result.failed?'Candidate sources could not provide new songs. Retry later.':'No new connected candidates were found for your likes. Try adding another liked song.');
      setShortlist(candidates);setNote(candidates.length+' candidates selected. Checking comment-analysis availability…');
      const availability=await json<ReviewAvailability>('/api/station/reviews');
      c.signal.throwIfAborted();
      if(!availability.ready)throw new Error(availability.reason||'Comment analysis is not available. No candidates were added to the playlist.');
      setNote('Analysing YouTube comments · 0 / '+candidates.length+'. The first model load can take longer.');
      const summaries=new Map<string,ReviewSummary>(),checked=new Set<string>(),wanted=new Set(candidates.map(r=>reviewKey(r.track)));
      const response=await accountFetch('/api/station/reviews',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([c.signal,AbortSignal.timeout(270000)]),body:JSON.stringify({tracks:candidates.map(({track:t})=>({title:t.title,artist:t.artist,primaryArtistName:t.primaryArtistName,durationMs:t.durationMs}))})});
      await readReviewStream(response,event=>{
        if(event.type==='heartbeat')return;
        if(event.type==='complete'){if(event.total!==candidates.length||checked.size!==candidates.length)throw new Error('Some candidates were not checked. Retry to complete the playlist.');return;}
        const row=event.result;
        if(!row||!wanted.has(row.key)||checked.has(row.key)||event.total!==candidates.length||event.completed!==checked.size+1)throw new Error('Invalid candidate analysis response.');
        checked.add(row.key);
        if(row.status==='ready'&&row.summary)summaries.set(row.key,row.summary);
        setReviews(old=>({...old,[row.key]:row}));setNote('Analysing YouTube comments · '+checked.size+' / '+candidates.length);
      },c.signal);
      c.signal.throwIfAborted();
      // ONLY the previously shown shortlist can enter the final playlist.
      const selection=selectLikedPlaylist(candidates,liked,memory,recent.current,summaries,Date.now(),score);
      setPlaylist(selection);
      const now=Date.now();recent.current=Object.fromEntries(Object.entries(recent.current).filter(([,at])=>Number.isFinite(at)&&at>now-3*86400000&&at<=now));
      for(const row of selection)recent.current[songKey(row.track)]=now;
      let saved=true;try{localStorage.setItem(storageKey,JSON.stringify({recent:recent.current}));}catch{saved=false;}
      setNote(candidates.length+' candidates checked → '+selection.length+' tracks selected with sentiment > 0. '+(result.failed?result.failed+' candidate sources failed. ':'')+(saved?'':'Repeat history could not be saved.'));
    }catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'Playlist creation failed.');setNote('');}}
    finally{if(controller.current===c){controller.current=null;setBusy(false);}}
  }
  function cancel(){controller.current?.abort();controller.current=null;setBusy(false);setNote('Stopped. No incomplete playlist was saved.');}
  const selected=new Set(playlist?.map(row=>reviewKey(row.track))||[]);
  function reviewLabel(result?:TrackReview){
    if(!result)return 'Not analysed';
    if(result.status==='ready'&&result.summary?.score!==null&&result.summary?.score!==undefined)return (result.summary.score>0?'Positive':'Not positive')+' · '+result.summary.score.toFixed(3)+' · '+result.summary.sampleCount+' comments';
    return result.reason||'No usable comment evidence';
  }
  return <section className="station-playlist" aria-label="Playlist from my likes" aria-busy={busy}>
    <h3>Playlist from your likes</h3>
    <p>Your likes → up to 20 recommended candidates → YouTube comment sentiment → up to 10 tracks.</p>
    <p>Only scores above zero pass. One song per artist. Separate from song discovery.</p>
    <div className="playlist-build-actions"><button disabled={busy||!liked.length} onClick={()=>void build()}>{busy?'Building your personal playlist…':'Make a 10-track playlist'}</button>{busy&&<button onClick={cancel}>Cancel</button>}</div>
    {!liked.length&&<p>Like at least one song to start.</p>}
    <p role="status" aria-atomic="true">{note}</p>{error&&<p role="alert">{error}</p>}
    {shortlist.length>0&&<details className="playlist-candidates"><summary>Candidates · {shortlist.length} · Comments checked {Object.keys(reviews).length}/{shortlist.length}</summary>
      <ol>{shortlist.map(({track})=>{const key=reviewKey(track),review=reviews[key];return <li key={key}><div><b>{track.title}</b><small>{track.artist}</small><small>{selected.has(key)?'Selected · ':''}{reviewLabel(review)}</small>{review?.videoId&&/^[\w-]{11}$/.test(review.videoId)&&<a href={'https://www.youtube.com/watch?v='+review.videoId} target="_blank" rel="noreferrer">Comment source ↗</a>}</div></li>;})}</ol>
    </details>}
    {playlist&&<><h3>Your playlist · {playlist.length} tracks</h3>{playlist.length<10&&<p>Only {playlist.length} candidates passed all checks. No unanalysed or non-positive songs were added to fill 10 slots.</p>}<ol>{playlist.map(r=><li key={songKey(r.track)}><div><b>{r.track.title}</b><small>{r.track.artist} · {r.track.album}</small></div><a href={trackYouTubeUrl(r.track)} target="_blank" rel="noreferrer">Listen ↗</a></li>)}</ol></>}
    <small>Experimental English-comment analysis, not a guarantee of your taste. Likes and repeat history stay in this browser for your account. This does not save to YouTube.</small>
  </section>;
}
