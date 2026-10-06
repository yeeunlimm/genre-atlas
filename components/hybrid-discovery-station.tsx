"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Radio,Play,SkipForward,ThumbsUp,ThumbsDown,RotateCcw,Search} from "lucide-react";
import {stationCatalog,type StationTrack} from "@/lib/station-catalog";
import {recommend,trackYouTubeUrl} from "@/lib/discovery-station";
import {blankMemory,cleanMemory,excluded,mergeCandidates,MEMORY_KEY,rankCandidates,recordVote,remember,routeLabels,routeWeights,routes,songKey,type Candidate,type Memory,type Route} from "@/lib/hybrid-station";
import type {LiveStationResult} from "@/lib/live-station";
import type {SourceResult} from "@/lib/hybrid-sources";
import {StationArtwork} from "./station-artwork";
import {addLiked,emptyProfile,profileKey,readProfile,stationSeeds} from "@/lib/station-profile";
import {attemptKey,emptyStationMessage,jobKey,recoveryJobs,type Job,type Progress} from "@/lib/station-recovery";
import {mergeSearch} from "@/lib/catalog-search";

const picks=[{title:"SKELETONS",artist:"Travis Scott"},{title:"Lifestyle",artist:"Rich Gang"},{title:"Victory Lap",artist:"Fred again.."},{title:"Boy's a liar",artist:"PinkPantheress"},{title:"Summer Gypsy",artist:"Nujabes"}];
const asCredits=(seed:StationTrack,rows:ReturnType<typeof recommend>):Candidate[]=>rows.filter(r=>r.reasons.some(x=>x.kind==="credit"||x.kind==="sample")).map(r=>({...r,paths:[{route:"credits",seedId:seed.id,confidence:Math.min(.95,.6+r.score*.035)}]}));

export function DiscoveryStation(){
  const [query,setQuery]=useState(""),[matches,setMatches]=useState<StationTrack[]>([]),[origin,setOrigin]=useState<StationTrack>(),[seeds,setSeeds]=useState<StationTrack[]>([]);
  const [userId,setUserId]=useState<string|null>(null),[liked,setLiked]=useState<StationTrack[]>([]),[liking,setLiking]=useState(false),[authError,setAuthError]=useState("");
  const identity=useRef<string|null|undefined>(undefined),mounted=useRef(false),likeRequest=useRef<AbortController|null>(null);
  const [searched,setSearched]=useState(""),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(""),[searchNote,setSearchNote]=useState(""),[limit,setLimit]=useState(40),[canExpand,setCanExpand]=useState(false);
  const [rows,setRows]=useState<Candidate[]>([]),[consumed,setConsumed]=useState<StationTrack[]>([]),[current,setCurrent]=useState<Candidate>();
  const [memory,setMemory]=useState<Memory>(blankMemory),[hydrated,setHydrated]=useState(false),[storageNote,setStorageNote]=useState("");
  const [progress,setProgress]=useState<Record<string,Progress>>({}),[notice,setNotice]=useState("");
  const searchRequest=useRef<AbortController|null>(null),stationRequest=useRef<AbortController|null>(null);
  const autoAttempts=useRef(new Set<string>()),recoveryLock=useRef(false);
  const [recoveryBusy,setRecoveryBusy]=useState(false);
  async function loadIdentity(){
    setHydrated(false);setAuthError("");let id:string|null=null;
    try{const response=await fetch("/api/station/session",{cache:"no-store"});if(!response.ok)throw new Error();const d=await response.json() as {userId?:string|null};id=typeof d.userId==="string"?d.userId:null;}catch{if(mounted.current)setAuthError("Sign-in could not be checked. Discovery still works; retry to use likes.");}
    if(!mounted.current)return null;
    let profile=emptyProfile();
    try{const raw=localStorage.getItem(profileKey(id));profile=readProfile(raw?JSON.parse(raw):!id?{memory:cleanMemory(JSON.parse(localStorage.getItem(MEMORY_KEY)||"null"))}:null,!!id);}catch{setStorageNote("Browser storage is unavailable. Your preferences will work in this tab only.");}
    if(identity.current!==undefined&&identity.current!==id){stationRequest.current?.abort();setRows([]);setSeeds([]);setCurrent(undefined);setConsumed([]);setProgress({});}
    identity.current=id;setUserId(id);setMemory(profile.memory);setLiked(profile.liked);setHydrated(true);return profile;
  }
  useEffect(()=>{mounted.current=true;let active=true;void(async()=>{const profile=await loadIdentity();if(!profile||!active)return;const id=new URLSearchParams(window.location.search).get("stationTrack");if(id&&id.length<=80){try{const response=await fetch("/api/station/track?"+new URLSearchParams({id}));if(!response.ok)throw new Error();const d=await response.json() as {track:StationTrack};if(active)void start(d.track,profile.liked);}catch{if(active)setNotice("Your previous song could not be restored. Search for it again.");}}})();return()=>{active=false;mounted.current=false;searchRequest.current?.abort();stationRequest.current?.abort();likeRequest.current?.abort();};},[]);
  useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(profileKey(userId),JSON.stringify({version:2,memory,liked:userId?liked:[]}));}catch{setStorageNote("Your browser could not save preferences. They remain in this tab only.");}},[memory,liked,userId,hydrated]);
  const ranked=useMemo(()=>rankCandidates(rows,seeds,memory,consumed),[rows,seeds,memory,consumed]);
  // Keep the visible song stable while slower sources reorder the upcoming queue.
  useEffect(()=>{if(hydrated&&!current&&ranked[0]){setCurrent(ranked[0]);setMemory(m=>remember(m,ranked[0].track));}},[ranked,current,hydrated]);
  useEffect(()=>{if(current&&excluded(current.track,seeds)){setCurrent(undefined);setNotice("An additional album match was found. Moving to another discovery.");}},[current,seeds]);
  const shown=current?(rows.find(r=>songKey(r.track)===songKey(current.track))||current):undefined;
  const queue=useMemo(()=>rankCandidates(rows,seeds,memory,current?[...consumed,current.track]:consumed),[rows,seeds,memory,current,consumed]);
  const weights=routeWeights(memory),loading=Object.values(progress).some(p=>p.state==="loading");
  const plan=recoveryJobs(Object.values(progress),autoAttempts.current);
  const finding=loading||recoveryBusy||(!current&&!ranked.length&&plan.length>0);
  const emptyMessage=emptyStationMessage(rows,seeds,memory,consumed,Object.values(progress));
  useEffect(()=>{
    const c=stationRequest.current;
    if(!hydrated||current||ranked.length||!seeds.length||loading||recoveryLock.current||!c||c.signal.aborted)return;
    const jobs=recoveryJobs(Object.values(progress),autoAttempts.current);if(!jobs.length)return;
    for(const job of jobs)autoAttempts.current.add(attemptKey(job));
    void recover(jobs,c);
  },[hydrated,current,ranked,seeds,progress,loading,recoveryBusy]);
  async function recover(jobs:Job[],controller:AbortController){
    if(recoveryLock.current||controller.signal.aborted)return;
    recoveryLock.current=true;setRecoveryBusy(true);setNotice("Looking further across your discovery sources…");
    try{let index=0;await Promise.all([0,1].map(async()=>{while(index<jobs.length&&!controller.signal.aborted)await runJob(jobs[index++],controller.signal);}));}
    finally{if(stationRequest.current===controller){recoveryLock.current=false;setRecoveryBusy(false);setNotice("");}}
  }
  async function api<T>(url:string,signal:AbortSignal,timeout=35000):Promise<T>{const response=await fetch(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(timeout)])});let data:T & {error?:string};try{data=await response.json();}catch{throw new Error("The music service returned an unexpected response. Please retry this source.");}if(!response.ok)throw new Error(data.error||"Music lookup failed. Please retry.");return data;}
  async function search(q=query,count=40,catalog="auto"){
    if(q.trim().length<2){setSearchError("Enter at least two characters.");return;}
    searchRequest.current?.abort();const c=new AbortController();searchRequest.current=c;setSearching(true);setSearchError("");setSearched(q);setMatches([]);setCanExpand(false);setLimit(count);
    setSearchNote("Checking music catalogs…");
    let combined:StationTrack[]=[],completed=0;const providers:string[]=[],failed:string[]=[];
    const fetchCatalog=async(name:string)=>{
      try{const d=await api<{tracks:StationTrack[];canExpand:boolean;warning:string;provider:string}>("/api/station?"+new URLSearchParams({q:q.trim(),limit:String(count),catalog:name}),c.signal,12000);
        if(c.signal.aborted)return;completed++;providers.push(d.provider);combined=mergeSearch([...combined,...d.tracks],q);setMatches(combined);setCanExpand(previous=>previous||d.canExpand);
        setSearchNote("Results from "+providers.join(" + ")+" · select a song while other sources finish.");
      }catch{if(!c.signal.aborted)failed.push(name==="apple-only"?"Apple":name==="deezer"?"Deezer":"MusicBrainz");}
    };
    try{
      await Promise.all((catalog==="auto"?["deezer","apple-only"]:[catalog]).map(fetchCatalog));
      if(!c.signal.aborted&&!combined.length&&catalog==="auto"){setSearchNote("Checking MusicBrainz for additional recordings…");await fetchCatalog("musicbrainz");}
      if(c.signal.aborted)return;
      setSearchNote((providers.length?"Results from "+providers.join(" + ")+".":"")+(failed.length?" Unavailable: "+failed.join(", ")+". You can retry or check other catalog versions.":" Select one song to start."));
      if(!completed)setSearchError("Music catalogs could not be reached. This does not mean your song is missing.");
    }finally{if(!c.signal.aborted)setSearching(false);}
  }
  async function runJob(job:Job,signal:AbortSignal){
    if(signal.aborted)return;
    const key=jobKey(job);setProgress(p=>({...p,[key]:{...job,state:"loading",count:p[key]?.count||0,note:"Loading…",nextOffset:null}}));
    try{
      let d:SourceResult;
      if(job.route==="credits"){
        const credit=await api<LiveStationResult>("/api/station?"+new URLSearchParams({id:job.seed.id,offset:String(job.offset)}),signal);
        if(signal.aborted)return;
        setSeeds(s=>s.map(t=>t.id===job.seed.id?{...credit.seed,id:t.id}:t));
        d={rows:asCredits(job.seed,credit.rows),state:credit.partial?"partial":credit.rows.length?"ready":"empty",note:credit.notes.join(" ")||"Documented credit and sample connections. Missing credits do not block other routes.",nextOffset:credit.nextOffset};
      }else d=await api<SourceResult>("/api/station/discover?"+new URLSearchParams({id:job.seed.id,route:job.route,offset:String(job.offset)}),signal);
      if(signal.aborted)return;
      setRows(previous=>mergeCandidates([...previous,...d.rows]));
      setProgress(p=>({...p,[key]:{...job,state:d.state,count:d.rows.length,note:d.note,nextOffset:d.nextOffset}}));
    }catch(e){if(!signal.aborted)setProgress(p=>({...p,[key]:{...job,state:"error",count:0,note:e instanceof Error?e.message:"Source unavailable.",nextOffset:null}}));}
  }
  async function start(track:StationTrack,saved=liked,preserve=false,consumedTrack?:StationTrack){
    const tracks=stationSeeds(track,saved);stationRequest.current?.abort();const controller=new AbortController();stationRequest.current=controller;
    autoAttempts.current=new Set();recoveryLock.current=false;setRecoveryBusy(false);
    setOrigin(track);setSeeds(tracks);if(!preserve||consumedTrack)setCurrent(undefined);setConsumed(previous=>preserve?(consumedTrack?[...previous,consumedTrack]:previous):[]);
    const starter=tracks.flatMap(t=>asCredits(t,recommend(t.id,stationCatalog)));
    setRows(previous=>mergeCandidates([...(preserve?previous.map(r=>({...r,paths:r.paths.filter(p=>tracks.some(t=>t.id===p.seedId))})).filter(r=>r.paths.length):[]),...starter]));
    setNotice(preserve?"Liked. Updating your recommendations automatically…":"Finding your next song…");
    const order:Route[]=["related-artists","similar-tracks","credits"];
    const jobs=order.flatMap(route=>tracks.map(seed=>({seed,route,offset:0})));
    setProgress(Object.fromEntries(jobs.map(j=>[jobKey(j),{...j,state:"loading",count:0,note:"Queued…",nextOffset:null}])));
    let index=0;await Promise.all([0,1].map(async()=>{while(index<jobs.length&&!controller.signal.aborted)await runJob(jobs[index++],controller.signal);}));
    if(!controller.signal.aborted)setNotice("");
  }
  function advance(vote?:"dislike"){
    if(!shown)return;if(vote)setMemory(m=>recordVote(m,shown,vote));
    setConsumed(s=>[...s,shown.track]);setCurrent(undefined);
    if(vote)setLiked(previous=>previous.filter(t=>songKey(t)!==songKey(shown.track)));
    setNotice(vote?"Hidden. Its discovery routes get less weight.":"Skipped. A skip does not count as a dislike.");
  }
  async function like(track:StationTrack,row?:Candidate){
    if(!userId||liking||!hydrated)return;const controller=new AbortController();likeRequest.current=controller;setLiking(true);
    try{const response=await fetch("/api/station/session",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({trackId:track.id}),signal:controller.signal});const data=await response.json() as {userId?:string;allowed?:boolean;error?:string};
      if(response.status===401||response.ok&&data.userId!==userId){await loadIdentity();setNotice("Please sign in again, then like this song.");return;}
      if(!response.ok||!data.allowed)throw new Error(data.error||"Your like could not be confirmed. Please retry.");
      if(controller.signal.aborted)return;
      const next=addLiked(liked,track);setLiked(next);
      if(row)setMemory(m=>recordVote(m,row,"like"));
      else setMemory(m=>{const votes={...m.votes};if(votes[songKey(track)]?.vote==="dislike")delete votes[songKey(track)];return {...m,votes};});
      void start(origin||track,next,true,row?.track);
    }catch(e){if(!controller.signal.aborted)setNotice(e instanceof Error?e.message:"Your like could not be saved. Try again.");}finally{if(!controller.signal.aborted)setLiking(false);}
  }
  function retry(p:Progress,more=false){const c=stationRequest.current;if(!c||c.signal.aborted)return;void runJob({...p,offset:more?(p.nextOffset??p.offset):p.offset},c.signal);}
  function retrySources(){const c=stationRequest.current;if(!c||c.signal.aborted)return;const jobs=Object.values(progress).filter(p=>p.state==="error"||p.state==="partial"||p.nextOffset!==null).map(p=>({...p,offset:p.state==="error"||p.state==="partial"?p.offset:p.nextOffset!}));void recover(jobs,c);}
  function reset(){stationRequest.current?.abort();likeRequest.current?.abort();setLiking(false);setMemory(blankMemory());setLiked([]);setCurrent(undefined);setRows([]);setSeeds([]);setOrigin(undefined);setConsumed([]);setProgress({});setNotice("This browser's preferences were cleared. Select one song to start again.");}
  const returnTo=(origin?"/?stationTrack="+encodeURIComponent(origin.id):"/")+"#discovery-station";
  const signIn="/signin-with-chatgpt?return_to="+encodeURIComponent(returnTo),signOut="/signout-with-chatgpt?return_to="+encodeURIComponent(returnTo);
  const likedSong=(track:StationTrack)=>liked.some(t=>songKey(t)===songKey(track));
  function likeControl(track:StationTrack,row?:Candidate){return userId?<button disabled={liking||!hydrated||likedSong(track)} aria-label={likedSong(track)?"Liked "+track.title:"Like "+track.title} onClick={()=>void like(track,row)}><ThumbsUp size={16} aria-hidden="true"/>{liking?"Saving…":likedSong(track)?"Liked":"Like"}</button>:<a className="station-signin" href={signIn} target="_top"><ThumbsUp size={16} aria-hidden="true"/>Sign in to like</a>;}
  const sources=shown?[...new Map(shown.reasons.flatMap(r=>r.sources).map(s=>[s.url,s])).values()]:[];
  return <section className="station" id="discovery-station" aria-labelledby="station-title">
    <header className="station-header"><div><span className="eyebrow">MORE WAYS INTO YOUR SOUND</span><h2 id="station-title"><Radio size={25} aria-hidden="true"/> Discovery Station</h2></div><span className="station-stamp">YOUR MIX</span></header>
    <p className="station-intro">One song is enough. Your likes shape what comes next.</p>
    <div className="station-layout"><div className="station-picker">
      <form onSubmit={e=>{e.preventDefault();void search();}}><label htmlFor="station-search">Find a starting song</label><div className="station-search"><Search size={18} aria-hidden="true"/><input id="station-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Song or artist" maxLength={120}/><button disabled={searching}>{searching?"Searching…":"Search"}</button></div></form>
      <p className="station-meta">Select one song. Recommendations start right away.</p>
      <div className="station-seeds">{picks.map(pick=><button key={pick.title} data-pick={pick.title} aria-label={pick.title+" by "+pick.artist} onClick={()=>{const q=pick.title+" "+pick.artist;setQuery(q);void search(q);}}>{pick.title}</button>)}</div>
      <div className="station-account">{!hydrated?<p className="station-meta">Checking sign-in…</p>:userId?<><span>Signed in · {liked.length} liked {liked.length===1?"song":"songs"}</span><a href={signOut} target="_top">Sign out</a></>:<><span>Discover freely. Sign in only to like.</span><a href={signIn} target="_top">Sign in with ChatGPT</a></>}{authError&&<div role="alert"><p>{authError}</p><button onClick={()=>void loadIdentity()}>Retry sign-in check</button></div>}</div>
      <p role="status" className="station-meta">{searchNote}</p>
      {searchError&&<div role="alert" className="station-error"><p>{searchError}</p><button onClick={()=>void search(searched||query,limit)}>Retry search</button></div>}
      <div className="station-catalog" aria-label="Starting tracks" aria-busy={searching}>{matches.map(t=><button key={t.id} disabled={!hydrated||liking} aria-pressed={origin?.id===t.id} onClick={()=>void start(t)}><b>{t.title}</b><span>{t.artist} · {t.album}{t.explicitness==="cleaned"?" · Clean edition":""}</span><small>{t.catalogKind==="deezer"?"Deezer":t.catalogKind==="apple"?"Apple":t.catalogKind==="musicbrainz"?"MusicBrainz":"Source-checked starter record"}</small></button>)}{searched&&!searching&&!searchError&&!matches.length&&<p>No matching recording in the catalogs checked. Try another spelling or other catalog versions; catalog coverage is not complete.</p>}</div>
      {canExpand&&!searching&&<button onClick={()=>void search(searched,limit===40?100:200)}>More search results</button>}
      {searched&&!searching&&<button onClick={()=>void search(searched,40,"musicbrainz")}>Other catalog versions</button>}
    </div><div className="station-output">
      <div className="station-status" role="status" aria-live="polite">{notice||(shown?"Like a song to shape what comes next.":seeds.length?finding?"Finding your next song…":"Source checks finished.":"Find one song you want to explore.")}</div>
      {finding&&<p className="station-meta" role="status">Checking live catalogs and credits independently. Available recommendations appear as soon as they arrive.</p>}
      {shown&&stationCatalog.some(t=>t.id===shown.track.id)&&<p className="station-meta">Source-checked starter collection · this connection was stored in advance, not found by a live lookup.</p>}
      {origin&&<div className="station-origin"><div className="station-origin-copy"><span>STARTING FROM</span><b>{origin.title} / {origin.artist}</b><small>Excluded album: {origin.album}</small><div className="station-feedback">{likeControl(origin)}</div>{seeds.length>1&&<small>Also shaped by {seeds.length-1} of your recent likes. Their albums are excluded too.</small>}</div><StationArtwork key={origin.id} track={origin} size="seed"/></div>}
      {shown?<><article className="station-current" key={shown.track.id}><div className="station-track-heading"><div className="station-track-copy"><span className="eyebrow">NEXT DISCOVERY</span><h3>{shown.track.title}</h3><p className="station-artist">{shown.track.artist}</p><p className="station-meta">{shown.track.album}</p><div className="station-tags">{[...new Set(shown.paths.map(p=>routeLabels[p.route]))].map(label=><span key={label}>{label}</span>)}</div></div><StationArtwork key={shown.track.id+shown.track.album} track={shown.track} size="recommendation"/></div>
        <div className="station-actions"><a className="primary" href={trackYouTubeUrl(shown.track)} target="_blank" rel="noreferrer"><Play size={17}/>Listen on YouTube</a><button disabled={liking} onClick={()=>advance()}><SkipForward size={17}/>Next track</button></div>
        <div className="station-feedback">{likeControl(shown.track,shown)}<button disabled={liking} onClick={()=>advance("dislike")}><ThumbsDown size={16}/>Not for me</button><button disabled={liking} onClick={()=>void start(shown.track)}>Explore this song</button></div>
        <details className="station-evidence"><summary>Why this track?</summary><ul>{shown.reasons.map((reason,i)=><li key={i}><b>{reason.label}</b><span>{reason.detail}</span></li>)}</ul><div className="station-sources">{sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}</div><small>Connections are discovery signals, not a guarantee of the same sound. Route weights reflect your saved feedback.</small></details>
      </article><details className="station-upnext"><summary>Up next · {queue.length}</summary>{queue.slice(0,4).map(row=><div key={row.track.id}><span><b>{row.track.title}</b><small>{row.track.artist}</small></span><span>{routeLabels[row.paths[0].route]}</span></div>)}</details></>:<div className="station-empty" role="status"><Radio size={42} strokeWidth={1}/><h3>{!seeds.length?"It starts with one song.":finding?"Finding your next discovery…":emptyMessage.title}</h3><p>{!seeds.length?"Search a song and select it. No playlist to prepare.":finding?"We’re checking more candidates before calling this mix finished. Your album and artist limits stay in place.":emptyMessage.detail}</p>{seeds.length>0&&!finding&&(emptyMessage.failed||emptyMessage.more)&&<button onClick={retrySources}>{emptyMessage.failed?"Retry unavailable sources":"Find more songs"}</button>}</div>}
      {seeds.length>0&&<details className="station-source-status"><summary>Discovery sources & your weights</summary><p className="station-meta">1.00× is neutral. Weights change after a like or dislike; skips do not change them.</p><div className="station-weights">{routes.map(route=><span key={route}>{routeLabels[route]} <b>{weights[route].toFixed(2)}×</b></span>)}</div>{Object.values(progress).map(p=><div className="station-source-row" key={jobKey(p)}><b>{routeLabels[p.route]} · {p.seed.title}</b><span>{p.state==="loading"?p.note:p.state+" · "+p.count+" candidates in this batch"}</span><small>{p.state!=="loading"&&p.note}</small>{(p.state==="error"||p.state==="partial")&&<button onClick={()=>retry(p)}>Retry source</button>}{p.nextOffset!==null&&p.state!=="loading"&&<button onClick={()=>retry(p,true)}>Load more {p.route==="credits"?"credit connections":"related artists"}</button>}</div>)}</details>}
    </div></div>
    <footer className="station-foot"><span>{storageNote||"Preferences stay in this browser. Likes are separated by sign-in; they do not sync between devices."}</span><button disabled={!hydrated||liking} onClick={reset}><RotateCcw size={15}/>Reset saved preferences</button></footer>
    <details className="station-method"><summary>How this station works</summary><p>Select one song to start. Likes require sign-in and shape discovery from this song and up to four recent likes. Search checks Deezer and Apple in parallel; MusicBrainz provides additional recordings. Related artists and their songs come from Deezer, with YouTube Music and other catalogs as fallbacks. Credits come from MusicBrainz and available Apple song pages. The source-checked starter collection is stored in advance and labelled separately. Last.fm is off without an API key. No Spotify, BPM scoring or audio analysis is used. Shared credits are not required. The same album, disliked songs, repeated artists and songs shown in the last three days are excluded. No provider guarantees every recording. Preferences stay in this browser, separately for each signed-in user; sign-in does not enable cross-device storage.</p></details>
  </section>;
}
