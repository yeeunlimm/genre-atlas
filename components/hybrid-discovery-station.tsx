"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Radio,Play,SkipForward,ThumbsUp,ThumbsDown,RotateCcw,Search} from "lucide-react";
import {stationCatalog,type StationTrack} from "@/lib/station-catalog";
import {recommend,trackYouTubeUrl} from "@/lib/discovery-station";
import {blankMemory,cleanMemory,excluded,mergeCandidates,MEMORY_KEY,rankCandidates,recordVote,remember,routeLabels,routeWeights,routes,songKey,type Candidate,type Memory,type Route} from "@/lib/hybrid-station";
import type {LiveStationResult} from "@/lib/live-station";
import type {SourceResult} from "@/lib/hybrid-sources";
import {StationArtwork} from "./station-artwork";

type Job={seed:StationTrack;route:Route;offset:number};
type Progress=Job & {state:"loading"|"ready"|"empty"|"disabled"|"partial"|"error";count:number;note:string;nextOffset:number|null};
const jobKey=(job:Job)=>job.seed.id+"|"+job.route;
const picks=[{title:"SKELETONS",artist:"Travis Scott"},{title:"Lifestyle",artist:"Rich Gang"},{title:"Victory Lap",artist:"Fred again.."},{title:"Boy's a liar",artist:"PinkPantheress"},{title:"Summer Gypsy",artist:"Nujabes"}];
const asCredits=(seed:StationTrack,rows:ReturnType<typeof recommend>):Candidate[]=>rows.filter(r=>r.reasons.some(x=>x.kind==="credit"||x.kind==="sample")).map(r=>({...r,paths:[{route:"credits",seedId:seed.id,confidence:Math.min(.95,.6+r.score*.035)}]}));

export function DiscoveryStation(){
  const [query,setQuery]=useState(""),[matches,setMatches]=useState<StationTrack[]>([]),[selected,setSelected]=useState<StationTrack[]>([]),[seeds,setSeeds]=useState<StationTrack[]>([]);
  const [searched,setSearched]=useState(""),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(""),[searchNote,setSearchNote]=useState(""),[limit,setLimit]=useState(40),[canExpand,setCanExpand]=useState(false);
  const [rows,setRows]=useState<Candidate[]>([]),[consumed,setConsumed]=useState<StationTrack[]>([]),[current,setCurrent]=useState<Candidate>();
  const [memory,setMemory]=useState<Memory>(blankMemory),[hydrated,setHydrated]=useState(false),[storageNote,setStorageNote]=useState("");
  const [progress,setProgress]=useState<Record<string,Progress>>({}),[notice,setNotice]=useState("");
  const searchRequest=useRef<AbortController|null>(null),stationRequest=useRef<AbortController|null>(null);
  useEffect(()=>{try{const stored=localStorage.getItem(MEMORY_KEY);if(stored)setMemory(cleanMemory(JSON.parse(stored)));}catch{setStorageNote("Browser storage is unavailable or unreadable. Preferences will work in this tab only.");}setHydrated(true);return()=>{searchRequest.current?.abort();stationRequest.current?.abort();};},[]);
  useEffect(()=>{if(!hydrated)return;try{localStorage.setItem(MEMORY_KEY,JSON.stringify(memory));}catch{setStorageNote("Your browser could not save preferences. They remain in this tab only.");}},[memory,hydrated]);
  const ranked=useMemo(()=>rankCandidates(rows,seeds,memory,consumed),[rows,seeds,memory,consumed]);
  // Keep the visible song stable while slower sources reorder the upcoming queue.
  useEffect(()=>{if(hydrated&&!current&&ranked[0]){setCurrent(ranked[0]);setMemory(m=>remember(m,ranked[0].track));}},[ranked,current,hydrated]);
  useEffect(()=>{if(current&&excluded(current.track,seeds)){setCurrent(undefined);setNotice("An additional album match was found. Moving to another discovery.");}},[current,seeds]);
  const shown=current?(rows.find(r=>songKey(r.track)===songKey(current.track))||current):undefined;
  const queue=useMemo(()=>rankCandidates(rows,seeds,memory,current?[...consumed,current.track]:consumed),[rows,seeds,memory,current,consumed]);
  const weights=routeWeights(memory),loading=Object.values(progress).some(p=>p.state==="loading");
  async function api<T>(url:string,signal:AbortSignal):Promise<T>{const response=await fetch(url,{signal});let data:T & {error?:string};try{data=await response.json();}catch{throw new Error("The music service returned an unexpected response. Please retry this source.");}if(!response.ok)throw new Error(data.error||"Music lookup failed. Please retry.");return data;}
  async function search(q=query,count=40,catalog="apple"){
    if(q.trim().length<2){setSearchError("Enter at least two characters.");return;}
    searchRequest.current?.abort();const c=new AbortController();searchRequest.current=c;setSearching(true);setSearchError("");setSearched(q);setMatches([]);setCanExpand(false);setLimit(count);
    try{const d=await api<{tracks:StationTrack[];canExpand:boolean;warning:string;provider:string}>("/api/station?"+new URLSearchParams({q:q.trim(),limit:String(count),catalog}),c.signal);if(c.signal.aborted)return;setMatches(d.tracks);setCanExpand(d.canExpand);setSearchNote(d.warning||"Results from "+d.provider+" · select up to five songs.");}
    catch(e){if(!c.signal.aborted)setSearchError(e instanceof Error?e.message:"Search failed.");}finally{if(!c.signal.aborted)setSearching(false);}
  }
  function toggle(t:StationTrack){if(!selected.some(s=>songKey(s)===songKey(t))&&selected.length>=5){setNotice("Choose up to five starting songs. Remove one to add another.");return;}setSelected(previous=>previous.some(s=>songKey(s)===songKey(t))?previous.filter(s=>songKey(s)!==songKey(t)):[...previous,t]);}
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
  async function start(tracks=selected){
    if(!tracks.length)return;stationRequest.current?.abort();const controller=new AbortController();stationRequest.current=controller;
    setSeeds(tracks);setCurrent(undefined);setConsumed([]);setRows(mergeCandidates(tracks.flatMap(t=>asCredits(t,recommend(t.id,stationCatalog)))));setNotice("Building your mix. Recommendations arrive as each source responds.");
    const order:Route[]=["related-artists","similar-tracks","credits"];
    const jobs=order.flatMap(route=>tracks.map(seed=>({seed,route,offset:0})));
    setProgress(Object.fromEntries(jobs.map(j=>[jobKey(j),{...j,state:"loading",count:0,note:"Queued…",nextOffset:null}])));
    let index=0;await Promise.all([0,1].map(async()=>{while(index<jobs.length&&!controller.signal.aborted)await runJob(jobs[index++],controller.signal);}));
    if(!controller.signal.aborted)setNotice("Your mix is ready. Feedback adjusts the upcoming queue; the visible suggestion stays put.");
  }
  function advance(vote?:"like"|"dislike"){
    if(!shown)return;if(vote)setMemory(m=>recordVote(m,shown,vote));
    setConsumed(s=>[...s,shown.track]);setCurrent(undefined);
    setNotice(vote?(vote==="like"?"Liked. Its discovery routes get more weight.":"Hidden. Its discovery routes get less weight."):"Skipped. A skip does not count as a dislike.");
  }
  function retry(p:Progress,more=false){const c=stationRequest.current;if(!c||c.signal.aborted)return;void runJob({...p,offset:more?(p.nextOffset??p.offset):p.offset},c.signal);}
  function reset(){stationRequest.current?.abort();setMemory(blankMemory());setCurrent(undefined);setRows([]);setSeeds([]);setConsumed([]);setProgress({});setNotice("Saved feedback and recent recommendations cleared. Build a new station when ready.");}
  const sources=shown?[...new Map(shown.reasons.flatMap(r=>r.sources).map(s=>[s.url,s])).values()]:[];
  return <section className="station" id="discovery-station" aria-labelledby="station-title">
    <header className="station-header"><div><span className="eyebrow">MORE WAYS INTO YOUR SOUND</span><h2 id="station-title"><Radio size={25} aria-hidden="true"/> Discovery Station</h2></div><span className="station-stamp">YOUR MIX</span></header>
    <p className="station-intro">Start with a few favorites. Follow songs, artists and the people behind them. Shape the next discovery.</p>
    <div className="station-layout"><div className="station-picker">
      <form onSubmit={e=>{e.preventDefault();void search();}}><label htmlFor="station-search">Find your starting songs</label><div className="station-search"><Search size={18} aria-hidden="true"/><input id="station-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Song or artist" maxLength={120}/><button disabled={searching}>{searching?"Searching…":"Search"}</button></div></form>
      <p className="station-meta">Choose 1–5 favorites. No account or listening history needed. No BPM filter.</p>
      <div className="station-seeds">{picks.map(pick=><button key={pick.title} data-pick={pick.title} aria-label={pick.title+" by "+pick.artist} onClick={()=>{const q=pick.title+" "+pick.artist;setQuery(q);void search(q);}}>{pick.title}</button>)}</div>
      <div className="station-selected"><h3>YOUR STARTING POINTS <span>{selected.length}/5</span></h3>{selected.length===0?<p className="station-meta">Select songs below, then build your station.</p>:selected.map(t=><div key={t.id}><span><b>{t.title}</b><small>{t.artist}</small></span><button aria-label={"Remove "+t.title} onClick={()=>toggle(t)}>×</button></div>)}<button className="station-build" disabled={!selected.length||!hydrated} onClick={()=>void start()}>Build my station →</button></div>
      <p role="status" className="station-meta">{searching?"Searching the live catalog…":searchNote}</p>
      {searchError&&<div role="alert" className="station-error"><p>{searchError}</p><button onClick={()=>void search(searched||query,limit)}>Retry search</button></div>}
      <div className="station-catalog" aria-label="Starting tracks" aria-busy={searching}>{matches.map(t=><button key={t.id} aria-pressed={selected.some(s=>songKey(s)===songKey(t))} onClick={()=>toggle(t)}><b>{t.title}</b><span>{t.artist} · {t.album}{t.explicitness==="cleaned"?" · Clean edition":""}</span></button>)}{searched&&!searching&&!searchError&&!matches.length&&<p>No songs found. Try the artist and song title.</p>}</div>
      {canExpand&&!searching&&<button onClick={()=>void search(searched,limit===40?100:200)}>More search results</button>}
      {searched&&!searching&&<button onClick={()=>void search(searched,40,"musicbrainz")}>Other catalog versions</button>}
    </div><div className="station-output">
      <div className="station-status" role="status" aria-live="polite">{notice||"Choose your favorites to start."}</div>
      {loading&&<p className="station-meta" role="status">Gathering independent sources… Credits can take a minute; other recommendations can arrive sooner.</p>}
      {seeds.length>0&&<div className="station-origin"><div className="station-origin-copy"><span>STARTING FROM · {seeds.length} {seeds.length===1?"SONG":"SONGS"}</span>{seeds.map(t=><div key={t.id}><b>{t.title} / {t.artist}</b><small>Excluded album: {t.album}</small></div>)}</div><StationArtwork key={seeds[0].id} track={seeds[0]} size="seed"/></div>}
      {shown?<><article className="station-current" key={shown.track.id}><div className="station-track-heading"><div className="station-track-copy"><span className="eyebrow">NEXT DISCOVERY</span><h3>{shown.track.title}</h3><p className="station-artist">{shown.track.artist}</p><p className="station-meta">{shown.track.album}</p><div className="station-tags">{[...new Set(shown.paths.map(p=>routeLabels[p.route]))].map(label=><span key={label}>{label}</span>)}</div></div><StationArtwork key={shown.track.id+shown.track.album} track={shown.track} size="recommendation"/></div>
        <div className="station-actions"><a className="primary" href={trackYouTubeUrl(shown.track)} target="_blank" rel="noreferrer"><Play size={17}/>Listen on YouTube</a><button onClick={()=>advance()}><SkipForward size={17}/>Next track</button></div>
        <div className="station-feedback"><button onClick={()=>advance("like")}><ThumbsUp size={16}/>More like this</button><button onClick={()=>advance("dislike")}><ThumbsDown size={16}/>Not for me</button><button onClick={()=>{setSelected([shown.track]);void start([shown.track]);}}>Start from this track ↗</button></div>
        <details className="station-evidence"><summary>Why this track?</summary><ul>{shown.reasons.map((reason,i)=><li key={i}><b>{reason.label}</b><span>{reason.detail}</span></li>)}</ul><div className="station-sources">{sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}</div><small>Connections are discovery signals, not a guarantee of the same sound. Route weights reflect your saved feedback.</small></details>
      </article><div className="station-upnext"><h4>IN THE QUEUE <span>{queue.length}</span></h4>{queue.slice(0,4).map(row=><div key={row.track.id}><span><b>{row.track.title}</b><small>{row.track.artist}</small></span><span>{routeLabels[row.paths[0].route]}</span></div>)}</div></>:<div className="station-empty"><Radio size={42} strokeWidth={1}/><h3>{!seeds.length?"A few favorites. More possibilities.":loading?"Finding your next discovery…":"This mix needs another starting point."}</h3><p>{!seeds.length?"Pick songs you love. Shared credits are one path, not an entry requirement.":loading?"Each source is checked separately. You can use the station while other sources finish.":"No eligible songs remain in the loaded pool after album, artist, dislike and three-day repeat filters. Load more sources below or add another favorite."}</p></div>}
      {seeds.length>0&&<details className="station-source-status" open><summary>Discovery sources & your weights</summary><p className="station-meta">1.00× is neutral. Weights change after a like or dislike; skips do not change them.</p><div className="station-weights">{routes.map(route=><span key={route}>{routeLabels[route]} <b>{weights[route].toFixed(2)}×</b></span>)}</div>{Object.values(progress).map(p=><div className="station-source-row" key={jobKey(p)}><b>{routeLabels[p.route]} · {p.seed.title}</b><span>{p.state==="loading"?p.note:p.state+" · "+p.count+" candidates in this batch"}</span><small>{p.state!=="loading"&&p.note}</small>{(p.state==="error"||p.state==="partial")&&<button onClick={()=>retry(p)}>Retry source</button>}{p.nextOffset!==null&&p.state!=="loading"&&<button onClick={()=>retry(p,true)}>Load more {p.route==="credits"?"credit connections":"related artists"}</button>}</div>)}</details>}
    </div></div>
    <footer className="station-foot"><span>{storageNote||"Feedback and three-day recommendation history are saved in this browser only. No account sync."}</span><button onClick={reset}><RotateCcw size={15}/>Reset saved preferences</button></footer>
    <details className="station-method"><summary>How this station works</summary><p>Search uses Apple’s public US catalog, with MusicBrainz as a fallback. Each starting song opens independent paths: documented production, mixing, mastering, writing and sample connections; YouTube Music’s related artists resolved to songs in Apple’s catalog; and Last.fm track similarity when the site owner configures a server API key. Artist similarity is not track similarity. Candidates are combined and deduplicated; shared credits are never required across all routes. Each route starts at neutral weight. Likes and dislikes adjust its smoothed weight; a song found through several routes shares its vote between those routes. Matching several starting points adds a small boost. The top eligible song per primary artist is kept, and artists already recommended in this station are excluded. Starting songs, known starting album editions, disliked songs and songs shown in the past three days are excluded. Alternate releases may have incomplete album metadata. The last 500 song votes and up to 1,000 recent recommendations stay in this browser; clearing browser data or changing devices loses them. No BPM, audio analysis, proprietary Apple algorithm or pre-trained personal model is used. External sources can be incomplete or unavailable.</p></details>
  </section>;
}
