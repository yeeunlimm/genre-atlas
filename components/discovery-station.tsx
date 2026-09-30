"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Radio,Play,SkipForward,ThumbsUp,ThumbsDown,RotateCcw,Search} from "lucide-react";
import {stationCatalog, type StationTrack} from "@/lib/station-catalog";
import {onePerArtist,stationQueue,recommend,trackYouTubeUrl,type Feedback,type Recommendation} from "@/lib/discovery-station";
import type {LiveStationResult} from "@/lib/live-station";
import {StationArtwork} from "./station-artwork";
function Evidence({row}:{row:Recommendation}) {
  const sources=[...new Map(row.reasons.flatMap(r=>r.sources).map(s=>[s.url,s])).values()];
  return <details className="station-evidence"><summary>Why this track?</summary>
    <ul>{row.reasons.map((r,i)=><li key={i}><b>{r.label}</b><span>{r.detail}</span></li>)}</ul>
    {row.feedbackBoost&&<p>Your likes in this session also influenced the order.</p>}
    <div className="station-sources">{sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}</div>
    <small>Sources checked {row.track.checkedAt}. Credits describe a connection, not a guarantee of the same sound. MusicBrainz is community-maintained and may be incomplete.</small>
  </details>;
}
export function DiscoveryStation() {
  const [query,setQuery]=useState(""),[seed,setSeed]=useState<StationTrack>(),[seen,setSeen]=useState<StationTrack[]>([]);
  const [feedback,setFeedback]=useState<Feedback>({}),[notice,setNotice]=useState("");
  const [matches,setMatches]=useState<StationTrack[]>([]),[rows,setRows]=useState<Recommendation[]>([]);
  const [searched,setSearched]=useState(""),[searching,setSearching]=useState(false),[loading,setLoading]=useState(false);
  const [searchError,setSearchError]=useState(""),[stationError,setStationError]=useState(""),[searchNote,setSearchNote]=useState("");
  const [notes,setNotes]=useState<string[]>([]),[nextOffset,setNextOffset]=useState<number|null>(null),[total,setTotal]=useState(0);
  const [canExpand,setCanExpand]=useState(false),[limit,setLimit]=useState(40),[retryOffset,setRetryOffset]=useState(0);
  const [creditStatus,setCreditStatus]=useState<LiveStationResult["status"]>("credits-missing");
  const searchRequest=useRef<AbortController|null>(null),stationRequest=useRef<AbortController|null>(null),startingId=useRef("");
  useEffect(()=>()=>{searchRequest.current?.abort();stationRequest.current?.abort();},[]);
  const queue=useMemo(()=>stationQueue(rows,feedback,seen),[rows,feedback,seen]);
  const current=queue[0];
  async function api<T>(url:string,signal:AbortSignal):Promise<T>{const r=await fetch(url,{signal});const d=await r.json() as T & {error?:string};if(!r.ok)throw new Error(d.error||"Music lookup failed. Please retry.");return d;}
  async function search(q=query,count=40,catalog="apple"){
    if(q.trim().length<2){setSearchError("Enter at least two characters.");return;}
    searchRequest.current?.abort();const c=new AbortController();searchRequest.current=c;
    setSearching(true);setSearchError("");setSearchNote("");setSearched(q);setMatches([]);setCanExpand(false);setLimit(count);
    try{const d=await api<{tracks:StationTrack[];canExpand:boolean;warning:string;provider:string}>("/api/station?"+new URLSearchParams({q:q.trim(),limit:String(count),catalog}),c.signal);if(c.signal.aborted)return;setMatches(d.tracks);setCanExpand(d.canExpand);setSearchNote(d.warning||("Results from "+d.provider+" · choose a song and album version."));}
    catch(e){if(!c.signal.aborted)setSearchError(e instanceof Error?e.message:"Search failed. Please retry.");}
    finally{if(!c.signal.aborted)setSearching(false);}
  }
  async function fetchStation(t:StationTrack,offset=0){
    stationRequest.current?.abort();const c=new AbortController();stationRequest.current=c;
    setLoading(true);setStationError("");setRetryOffset(offset);setNotice(offset?"Following more credit connections…":"Finding this recording, its credits and other releases…");
    try{
      let page=offset, d:LiveStationResult;
      // Pass batches with no new artists as well as unusable/starting-album records.
      // Keep a bound and stop on partial failures so retry does not lose a failed batch.
      for(let attempt=0;;attempt++){
        setRetryOffset(page);
        d=await api("/api/station?"+new URLSearchParams({id:startingId.current||t.id,offset:String(page)}),c.signal);
        if(c.signal.aborted)return;
        const newArtists=onePerArtist(d.rows,offset?[...rows.map(r=>r.track),...seen]:[]);
        if(newArtists.length||d.nextOffset===null||d.partial||attempt>=2)break;
        page=d.nextOffset;setNotice("Looking for another artist through these credits…");
      }
      setCreditStatus(d.status);
      setSeed(d.seed);setRows(previous=>{const merged=offset?[...previous,...d.rows]:d.rows;return onePerArtist(merged.filter((r,i)=>merged.findIndex(x=>x.track.id===r.track.id||x.track.recordingId===r.track.recordingId)===i));});
      const added=onePerArtist(d.rows,offset?[...rows.map(r=>r.track),...seen]:[]).length;
      setNextOffset(d.nextOffset);setTotal(d.totalConnections);setNotes(d.notes);setNotice(added?"Found "+added+" artist"+(added===1?"":"s")+" through credits. One track per artist.":d.nextOffset!==null?"No new artists in this batch. Load more connections to continue.":"No more new artists were found in these credit records.");
      if(d.partial)setStationError("Some records could not be loaded. Retry this batch to include them.");
    }catch(e){if(!c.signal.aborted){setStationError(e instanceof Error?e.message:"Credit lookup failed. Please retry.");setNotice("Live credit lookup could not finish. Your starting track is kept.");}}
    finally{if(!c.signal.aborted)setLoading(false);}
  }
  function start(t:StationTrack){startingId.current=t.id;setSeed(t);setRows(onePerArtist(recommend(t.id,stationCatalog)));setSeen([]);setNextOffset(null);setTotal(0);setNotes([]);setCreditStatus("credits-missing");void fetchStation(t);}
  function react(value:"like"|"dislike"){
    if(!current)return;
    setFeedback(f=>({...f,[current.track.id]:value}));
    setSeen(s=>[...s,current.track]);
    setNotice((value==="like"?"Liked ":"Hidden ")+current.track.title+". Next recommendation ready.");
  }
  return <section className="station" id="discovery-station" aria-labelledby="station-title">
    <header className="station-header"><div><span className="eyebrow">FOLLOW THE CREDITS</span><h2 id="station-title"><Radio size={25} aria-hidden="true"/> Discovery Station</h2></div><span className="station-stamp">LIVE CATALOG</span></header>
    <p className="station-intro">Follow the people behind the sound. Start with a track, leave its album behind. One track per artist.</p>
    <div className="station-layout">
      <div className="station-picker">
        <form onSubmit={e=>{e.preventDefault();void search();}}><label htmlFor="station-search">Find a starting track</label>
        <div className="station-search"><Search size={18} aria-hidden="true"/><input id="station-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Song or artist" maxLength={120} aria-describedby="station-search-help"/><button type="submit" disabled={searching}>{searching?"Searching…":"Search"}</button></div></form>
        <p className="station-meta" id="station-search-help">Search the live catalog. No account needed. No BPM filter.</p>
        <div className="station-seeds"><button onClick={()=>{setQuery("2hollis star");void search("2hollis star");}}>2hollis / star</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="makgeolli-banger")!)}>MAKGEOLLI BANGER</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="rosa")!)}>Rosa</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="new-person")!)}>Tame Impala</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="skeletons")!)}>SKELETONS</button></div>
        <p role="status" className="station-meta">{searching?"Searching the external music catalog…":searchNote}</p>
        {searchError&&<div role="alert" className="station-error"><p>{searchError}</p><button onClick={()=>void search(searched||query,limit)}>Retry search</button></div>}
        <div className="station-catalog" aria-label="Starting tracks" aria-busy={searching}>
          {matches.map(t=><button key={t.id} aria-pressed={seed?.id===t.id} onClick={()=>start(t)}><b>{t.title}</b><span>{t.artist} · {t.album}{t.explicitness==="cleaned"?" · Clean edition":t.explicitness==="explicit"?" · Explicit":""}</span></button>)}
          {searched&&!searching&&!searchError&&!matches.length&&<p>No songs found for “{searched}”. Try the artist and song title, or another spelling.</p>}
          {!searched&&<p className="station-meta">Search a song or artist in the available catalog, or try a starting pick above.</p>}
        </div>
        {canExpand&&!searching&&<button onClick={()=>void search(searched,limit===40?100:200)}>Show more search results</button>}
        {searched&&!searching&&<button onClick={()=>void search(searched,40,"musicbrainz")}>Search other catalog versions</button>}
      </div>
      <div className="station-output" aria-busy={loading}>
        <div className="station-status" role="status" aria-live="polite">{notice||"Choose a track to start your station."}</div>
        {loading&&<p className="station-meta">Checking public credit records. A first lookup can take up to a minute.</p>}
        {stationError&&<div role="alert" className="station-error"><p>{stationError}</p><button onClick={()=>seed&&void fetchStation(seed,retryOffset)}>Retry credit lookup</button></div>}
        {seed&&<div className="station-origin"><div className="station-origin-copy"><span>STARTING FROM</span><b>{seed.title} / {seed.artist}</b><small>Excluded album: {seed.album}</small><a className="station-meta" href={seed.source.url} target="_blank" rel="noreferrer">View catalog source ↗</a></div><StationArtwork key={seed.id+":"+seed.album+":"+seed.artworkUrl} track={seed} size="seed"/></div>}
        {seed&&seed.credits.length>0&&<details className="station-credit-check"><summary>Credits found · {[...new Set(seed.credits.map(c=>c.name))].length} people</summary><ul>{seed.credits.filter((c,i,a)=>a.findIndex(x=>x.name===c.name&&x.role===c.role)===i).map(c=><li key={c.person+":"+c.role}><a href={c.source.url} target="_blank" rel="noreferrer">{c.name}</a><span>{c.role}{c.scope==="release"?" · album edition":" · this track"}</span></li>)}</ul></details>}
        {current?<><article className="station-current" key={current.track.id}>
          <div className="station-track-heading"><div className="station-track-copy"><span className="eyebrow">NEXT DISCOVERY</span><h3>{current.track.title}</h3><p className="station-artist">{current.track.artist}</p><p className="station-meta">{current.track.album}</p>
          <div className="station-tags">{[...new Set(current.reasons.map(r=>r.label))].map(label=><span key={label}>{label}</span>)}</div></div><StationArtwork key={current.track.id+":"+current.track.album} track={current.track} size="recommendation"/></div>
          <div className="station-actions"><a className="primary" href={trackYouTubeUrl(current.track)} target="_blank" rel="noreferrer"><Play size={17} aria-hidden="true"/>Listen on YouTube</a><button onClick={()=>{setSeen(s=>[...s,current.track]);setNotice("Skipped "+current.track.title+".");}}><SkipForward size={17} aria-hidden="true"/>Next track</button></div>
          <div className="station-feedback"><button onClick={()=>react("like")}><ThumbsUp size={16} aria-hidden="true"/>More like this</button><button onClick={()=>react("dislike")}><ThumbsDown size={16} aria-hidden="true"/>Not for me</button><button onClick={()=>start(current.track)}>Start from this track ↗</button></div>
          <Evidence row={current}/>
        </article><div className="station-upnext"><h4>IN THE QUEUE <span>{queue.length-1}</span></h4>{queue.slice(1,5).map(row=><div key={row.track.id}><span><b>{row.track.title}</b><small>{row.track.artist}</small></span><span>{row.reasons[0]?.label}</span></div>)}</div></>:
        <div className="station-empty"><Radio size={42} strokeWidth={1} aria-hidden="true"/><h3>{loading?"Following the people behind it…":!seed?"A different way in.":stationError?"The lookup was interrupted.":rows.length?"You've reached this queue's end.":creditStatus==="connections-missing"?"Credits found. A link is still missing.":nextOffset!==null?"There's more to explore.":"Credits aren't available yet."}</h3><p>{seed?(loading?"Reading song credits from Apple Music and following participation records in MusicBrainz.":stationError?"Your track is kept. Retry the lookup above; a service error does not mean this song has no connections.":nextOffset!==null?"The checked records belong to your starting album or lack usable releases. Continue with more connections below.":rows.length?"Replay the station, or choose another starting point.":creditStatus==="connections-missing"?"We found people behind this song, but couldn't connect their other work confidently. Their source credits are listed above.":"The available sources don't list usable credits for this edition. Check another edition without losing your starting track."):"Find a song, then discover other releases connected by the people who made it."}</p>{seed&&!loading&&<div className="station-actions">{rows.length>0&&<button onClick={()=>{setSeen([]);setNotice("Station replayed. Hidden tracks remain excluded.");}}>Replay station</button>}<button disabled={searching} onClick={()=>{const q=(seed.artist+" "+seed.title.split("(")[0]).slice(0,120);setQuery(q);void search(q,40,"musicbrainz");}}>Find other editions</button></div>}</div>}
        {nextOffset!==null&&<button className="station-more" disabled={loading} onClick={()=>seed&&void fetchStation(seed,nextOffset)}>{loading?"Loading credits…":"Load more credit connections"}</button>}
        {total>0&&<p className="station-meta">{total} participation records found · loaded in batches, excluding your starting album.</p>}
        {notes.map(n=><p className="station-meta" key={n}>{n}</p>)}
      </div>
    </div>
    <footer className="station-foot"><span>Likes and hidden tracks apply only to this session. Nothing is saved to an account.</span><button onClick={()=>{setFeedback({});setSeen([]);setNotice("Session feedback cleared.");}}><RotateCcw size={15} aria-hidden="true"/>Reset feedback</button></footer>
    <details className="station-method"><summary>How this station works</summary><p>Search uses Apple’s public US music catalog, with MusicBrainz as a fallback. We read the selected song’s public Apple Music credits as well as matching MusicBrainz recording and release credits. Credited names and aliases are linked to MusicBrainz people only when the match is unambiguous, then their production, mixing, mastering, arrangement and writing relationships lead to other recordings and releases. Up to three connected people are explored, prioritizing production, mixing and mastering. Empty batches are checked automatically before offering more. Existing source-backed connections are kept. Album-edition credits are labeled; the starting song and known album groups are excluded. Missing credits are never invented or replaced with fan similarity. Public pages and community records may be incomplete or temporarily unavailable. No BPM, audio analysis, listening history or Apple Discovery Station algorithm is used. Listen opens ordinary YouTube search.</p></details>
  </section>;
}
