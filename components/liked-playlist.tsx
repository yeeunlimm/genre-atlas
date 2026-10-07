"use client";
import {useEffect,useRef,useState} from 'react';
import type {StationTrack} from '@/lib/station-catalog';
import {songKey,type Candidate,type Memory} from '@/lib/hybrid-station';
import {collectLikedCandidates,shortlistLikedCandidates,selectLikedPlaylist,reviewKey,PLAYLIST_CANDIDATE_LIMIT} from '@/lib/liked-playlist';
import {featureVector,modelScore,trainRanker,type LearningData} from '@/lib/station-learning';
import type {PlaylistReviewEvidence} from '@/lib/review-sentiment';
import type {TrackReview,ReviewAvailability} from '@/lib/playlist-review-types';
import {readReviewStream} from '@/lib/read-review-stream';
import {trackYouTubeUrl} from '@/lib/discovery-station';
import {accountFetch} from '@/lib/supabase/browser';
import type {LiveStationResult} from '@/lib/live-station';
import {StationArtwork} from './station-artwork';
import {candidateCacheKey,readCandidateSnapshot,saveCandidateSnapshot,type CandidateSnapshot} from '@/lib/playlist-candidate-cache';

export function LikedPlaylist({userId,liked,memory,learning}:{userId:string;liked:StationTrack[];memory:Memory;learning:LearningData}){
  const [playlist,setPlaylist]=useState<Candidate[]|null>(null),[shortlist,setShortlist]=useState<Candidate[]>([]);
  const [reviews,setReviews]=useState<Record<string,TrackReview>>({}),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState('');
  const [candidatesOpen,setCandidatesOpen]=useState(false);
  const [generatedAt,setGeneratedAt]=useState(''),[cacheWarning,setCacheWarning]=useState('');
  const controller=useRef<AbortController|null>(null),recent=useRef<Record<string,number>>({});
  const storageKey='genre-atlas.liked-playlist.v1:'+encodeURIComponent(userId);
  const snapshotKey=candidateCacheKey(userId);
  const likesKey=JSON.stringify(liked.map(songKey));
  useEffect(()=>{
    controller.current?.abort();controller.current=null;
    setBusy(false);setPlaylist(null);setShortlist([]);setReviews({});setNote('');setError('');setGeneratedAt('');setCacheWarning('');
    recent.current={};
    try{const saved=JSON.parse(localStorage.getItem(storageKey)||'null');if(saved?.recent&&typeof saved.recent==='object')recent.current=saved.recent;}catch{}
    try{const saved=readCandidateSnapshot(localStorage.getItem(snapshotKey));if(saved){
      setShortlist(saved.candidates);setReviews(saved.reviews);setGeneratedAt(saved.generatedAt);
      setPlaylist(saved.selectedKeys===null?null:saved.selectedKeys.map(key=>saved.candidates.find(row=>reviewKey(row.track)===key)!));
      setNote('Saved candidates restored. Make a new playlist to refresh candidates and recheck comments.');
    }}catch{setCacheWarning('Browser storage is unavailable. Candidates may not survive a refresh.');}
    return()=>controller.current?.abort();
  },[storageKey,snapshotKey]);
  useEffect(()=>{
    if(controller.current)setNote('Likes changed. Collected candidates are kept; make a new playlist when ready.');
    controller.current?.abort();controller.current=null;
    setBusy(false);
  },[storageKey,likesKey]);
  async function build(){
    if(controller.current||!liked.length)return;
    const c=new AbortController();controller.current=c;setBusy(true);setError('');
    setNote('Checking comment-analysis availability…');
    try{
      async function json<T>(url:string,timeout=40000):Promise<T>{if(timeout<=0)throw new Error('Candidate collection time limit reached.');const response=await accountFetch(url,{signal:AbortSignal.any([c.signal,AbortSignal.timeout(timeout)])});const data=await response.json() as T & {error?:string};if(!response.ok)throw new Error(data.error||'A playlist source failed.');return data;}
      // Do not collect candidates or change repeat history if analysis cannot run.
      const availability=await json<ReviewAvailability>('/api/station/reviews',15000);
      c.signal.throwIfAborted();
      if(!availability.ready)throw new Error(availability.reason||'Comment analysis is not available. No playlist was created.');
      setNote('Choosing up to '+PLAYLIST_CANDIDATE_LIMIT+' candidates from your five most recent likes…');
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
      setShortlist(candidates);setPlaylist(null);setReviews({});
      const snapshot:CandidateSnapshot={version:1,generatedAt:new Date().toISOString(),candidates,reviews:{},selectedKeys:null};
      const persist=()=>{let saved=false;try{saved=saveCandidateSnapshot(localStorage,snapshotKey,snapshot);}catch{}setCacheWarning(saved?'':'Candidates could not be saved in this browser. Keep this tab open.');};
      setGeneratedAt(snapshot.generatedAt);persist();
      setNote('Analysing YouTube comments · 0 / '+candidates.length+'. The first model load can take longer.');
      const summaries=new Map<string,PlaylistReviewEvidence>(),checked=new Set<string>(),wanted=new Set(candidates.map(r=>reviewKey(r.track)));
      let unavailableCount=0;
      const response=await accountFetch('/api/station/reviews',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([c.signal,AbortSignal.timeout(270000)]),body:JSON.stringify({tracks:candidates.map(({track:t})=>({title:t.title,artist:t.artist,primaryArtistName:t.primaryArtistName,durationMs:t.durationMs}))})});
      await readReviewStream(response,event=>{
        c.signal.throwIfAborted();
        if(event.type==='heartbeat')return;
        if(event.type==='complete'){if(event.total!==candidates.length||checked.size!==candidates.length)throw new Error('Some candidates were not checked. Retry to complete the playlist.');return;}
        const row=event.result;
        if(!row||!wanted.has(row.key)||checked.has(row.key)||event.total!==candidates.length||event.completed!==checked.size+1)throw new Error('Invalid candidate analysis response.');
        checked.add(row.key);
        snapshot.reviews[row.key]=row;persist();
        if(row.status==='unavailable')unavailableCount++;
        if(row.status==='ready'&&row.summary)summaries.set(row.key,row.summary);
        else if(row.selectionFallback)summaries.set(row.key,row.selectionFallback);
        setReviews(old=>({...old,[row.key]:row}));setNote('Analysing YouTube comments · '+checked.size+' / '+candidates.length);
      },c.signal);
      c.signal.throwIfAborted();
      // ONLY the previously shown shortlist can enter the final playlist.
      const selection=selectLikedPlaylist(candidates,liked,memory,recent.current,summaries,Date.now(),score);
      setPlaylist(selection);
      snapshot.selectedKeys=selection.map(row=>reviewKey(row.track));persist();
      const now=Date.now();recent.current=Object.fromEntries(Object.entries(recent.current).filter(([,at])=>Number.isFinite(at)&&at>now-3*86400000&&at<=now));
      for(const row of selection)recent.current[songKey(row.track)]=now;
      let saved=true;try{localStorage.setItem(storageKey,JSON.stringify({recent:recent.current}));}catch{saved=false;}
      setNote(candidates.length+' candidate results → '+selection.length+' tracks selected, positive scores first, no-comment fallbacks next. '+(unavailableCount?unavailableCount+' candidates could not be analysed because lookup or analysis was unavailable. ':'')+(result.failed?result.failed+' candidate sources failed. ':'')+(saved?'':'Repeat history could not be saved.'));
    }catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'Playlist creation failed.');setNote('');}}
    finally{if(controller.current===c){controller.current=null;setBusy(false);}}
  }
  function cancel(){controller.current?.abort();controller.current=null;setBusy(false);setNote('Stopped. Collected candidates are kept; no incomplete playlist was created.');}
  const selected=new Set(playlist?.map(row=>reviewKey(row.track))||[]);
  function reviewLabel(result?:TrackReview){
    if(!result)return 'Not analysed';
    if(result.selectionFallback)return 'No comments · selection fallback 0 · not analysed';
    if(result.status==='ready'&&result.summary?.score!==null&&result.summary?.score!==undefined)return (result.summary.score>0?'Positive':'Not positive')+' · '+result.summary.score.toFixed(3)+' · '+result.summary.sampleCount+' comments'+(result.videosChecked&&result.videosChecked>1?' · matched video retry':'');
    return result.reason||'No usable comment evidence';
  }
  return <section className="station-playlist" aria-label="Playlist from my likes" aria-busy={busy}>
    <h3>Playlist from your likes</h3>
    <p>Your likes → up to {PLAYLIST_CANDIDATE_LIMIT} recommended candidates → up to 10 tracks, positive sentiment first.</p>
    <p>If every matched video checked has no comments or has comments disabled, the song may follow with a selection score of 0 (not analysed). Other failures and non-positive analysed songs stay out. One song per artist. Separate from song discovery.</p>
    <div className="playlist-build-actions"><button disabled={busy||!liked.length} onClick={()=>void build()}>{busy?'Building your personal playlist…':'Make a 10-track playlist'}</button>{busy&&<button onClick={cancel}>Cancel</button>}</div>
    {!liked.length&&<p>Like at least one song to start.</p>}
    <p role="status" aria-atomic="true">{note}</p>{error&&<p role="alert">{error}</p>}
    {generatedAt&&<small>Saved candidates · {new Date(generatedAt).toLocaleString()} · Previous results, not a live analysis.</small>}
    {cacheWarning&&<p role="alert">{cacheWarning}</p>}
    {shortlist.length>0&&<details className="playlist-candidates" onToggle={event=>setCandidatesOpen(event.currentTarget.open)}><summary>Candidates · {shortlist.length} · Results {Object.keys(reviews).length}/{shortlist.length}</summary>
      <ol>{shortlist.map(({track})=>{const key=reviewKey(track),review=reviews[key];return <li key={key}><div><b>{track.title}</b><small>{track.artist}</small><small>{selected.has(key)?'Selected · ':''}{reviewLabel(review)}</small>{review?.videoId&&/^[\w-]{11}$/.test(review.videoId)&&<a href={'https://www.youtube.com/watch?v='+review.videoId} target="_blank" rel="noreferrer">Comment source ↗</a>}</div>{candidatesOpen&&<StationArtwork track={track} size="recommendation"/>}</li>;})}</ol>
    </details>}
    {playlist&&<><h3>Your playlist · {playlist.length} tracks</h3>{playlist.length<10&&<p>Only {playlist.length} candidates qualified. Unmatched recordings and analysis errors were not used to fill 10 slots.</p>}<ol className="playlist-selected-tracks">{playlist.map(r=><li key={songKey(r.track)}><div><b>{r.track.title}</b><small>{r.track.artist} · {r.track.album}</small><small>{reviewLabel(reviews[reviewKey(r.track)])}</small></div><div className="playlist-track-cover"><StationArtwork track={r.track} size="recommendation"/><a href={trackYouTubeUrl(r.track)} target="_blank" rel="noreferrer" aria-label={'Listen to '+r.track.title}>Listen ↗</a></div></li>)}</ol></>}
    <small>Up to 50 comments per video. If comments are disabled or absent, another matching video is tried (up to three total). Experimental English-model scoring and optional Korean-dictionary scoring, not a guarantee of your taste. Likes, candidates and repeat history stay in this browser for your account, not across devices. This does not save to YouTube.</small>
  </section>;
}
