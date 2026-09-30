"use client";
import {useMemo,useState} from "react";
import {Radio,Play,SkipForward,ThumbsUp,ThumbsDown,RotateCcw,Search} from "lucide-react";
import {stationCatalog, type StationTrack} from "@/lib/station-catalog";
import {recommend,searchTracks,trackYouTubeUrl,type Feedback,type Recommendation} from "@/lib/discovery-station";
function Evidence({row}:{row:Recommendation}) {
  const sources=[...new Map(row.reasons.flatMap(r=>r.sources).map(s=>[s.url,s])).values()];
  return <details className="station-evidence"><summary>Why this track?</summary>
    <ul>{row.reasons.map((r,i)=><li key={i}><b>{r.label}</b><span>{r.detail}</span></li>)}</ul>
    {row.feedbackBoost&&<p>Your likes in this session also influenced the order.</p>}
    <div className="station-sources">{sources.map(s=><a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.label}</a>)}</div>
    <small>Credits checked {row.track.checkedAt}. Credits describe a connection, not a guarantee of the same sound.</small>
  </details>;
}
export function DiscoveryStation() {
  const [query,setQuery]=useState(""),[seedId,setSeedId]=useState(""),[seen,setSeen]=useState<string[]>([]);
  const [feedback,setFeedback]=useState<Feedback>({}),[notice,setNotice]=useState("");
  const seed=stationCatalog.find(t=>t.id===seedId);
  const matches=useMemo(()=>searchTracks(query,stationCatalog),[query]);
  const queue=useMemo(()=>recommend(seedId,stationCatalog,feedback,seen),[seedId,feedback,seen]);
  const current=queue[0];
  function start(t:StationTrack){setSeedId(t.id);setSeen([]);setQuery("");setNotice("Station started from "+t.title+".");}
  function react(value:"like"|"dislike"){
    if(!current)return;
    setFeedback(f=>({...f,[current.track.id]:value}));
    setSeen(s=>[...s,current.track.id]);
    setNotice((value==="like"?"Liked ":"Hidden ")+current.track.title+". Next recommendation ready.");
  }
  return <section className="station" id="discovery-station" aria-labelledby="station-title">
    <header className="station-header"><div><span className="eyebrow">SONG DISCOVERY / BETA</span><h2 id="station-title"><Radio size={25} aria-hidden="true"/> Discovery Station</h2></div><span className="station-stamp">NO BPM FILTER</span></header>
    <p className="station-intro">Follow the people behind the sound. Start with a track, leave its album behind.</p>
    <div className="station-layout">
      <div className="station-picker">
        <label htmlFor="station-search">Find a starting track</label>
        <div className="station-search"><Search size={18} aria-hidden="true"/><input id="station-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Song, artist or album" maxLength={120}/></div>
        <p className="station-meta">{stationCatalog.length} source-checked tracks · limited starter catalog</p>
        <div className="station-seeds"><button onClick={()=>setQuery("2hollis star")}>2hollis / star</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="makgeolli-banger")!)}>MAKGEOLLI BANGER</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="rosa")!)}>Rosa</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="new-person")!)}>Tame Impala</button><button onClick={()=>start(stationCatalog.find(t=>t.id==="skeletons")!)}>SKELETONS</button></div>
        <div className="station-catalog" aria-label="Starting tracks">
          {(query.trim()?matches:stationCatalog).map(t=><button key={t.id} aria-pressed={seedId===t.id} onClick={()=>start(t)}><b>{t.title}</b><span>{t.artist} · {t.album}</span></button>)}
          {query.trim()&&!matches.length&&<p>No verified track in this catalog yet. Try a listed song or artist. This is not a live YouTube catalog search.</p>}
        </div>
      </div>
      <div className="station-output">
        <div className="station-status" role="status" aria-live="polite">{notice||"Choose a track to start your station."}</div>
        {seed&&<div className="station-origin"><span>STARTING FROM</span><b>{seed.title} / {seed.artist}</b><small>Excluded album: {seed.album}</small></div>}
        {current?<><article className="station-current" key={current.track.id}>
          <span className="eyebrow">NEXT DISCOVERY</span><h3>{current.track.title}</h3><p className="station-artist">{current.track.artist}</p><p className="station-meta">{current.track.album}</p>
          <div className="station-tags">{[...new Set(current.reasons.map(r=>r.label))].map(label=><span key={label}>{label}</span>)}</div>
          <div className="station-actions"><a className="primary" href={trackYouTubeUrl(current.track)} target="_blank" rel="noreferrer"><Play size={17} aria-hidden="true"/>Listen on YouTube</a><button onClick={()=>{setSeen(s=>[...s,current.track.id]);setNotice("Skipped "+current.track.title+".");}}><SkipForward size={17} aria-hidden="true"/>Next track</button></div>
          <div className="station-feedback"><button onClick={()=>react("like")}><ThumbsUp size={16} aria-hidden="true"/>More like this</button><button onClick={()=>react("dislike")}><ThumbsDown size={16} aria-hidden="true"/>Not for me</button></div>
          <Evidence row={current}/>
        </article><div className="station-upnext"><h4>IN THE QUEUE <span>{queue.length-1}</span></h4>{queue.slice(1,5).map(row=><div key={row.track.id}><span><b>{row.track.title}</b><small>{row.track.artist}</small></span><span>{row.reasons[0]?.label}</span></div>)}</div></>:
        <div className="station-empty"><Radio size={42} strokeWidth={1} aria-hidden="true"/><h3>{seed?"End of verified matches":"A different way in."}</h3><p>{seed?"No more matching tracks in this starter catalog. Choose another starting track or replay this station.":"Production, mixing, mastering and sample connections — not just fans of the same artist."}</p>{seed&&<button onClick={()=>{setSeen([]);setNotice("Station replayed. Hidden tracks remain excluded.");}}>Replay station</button>}</div>}
      </div>
    </div>
    <footer className="station-foot"><span>Likes and hidden tracks apply only to this session. Nothing is saved to an account.</span><button onClick={()=>{setFeedback({});setSeen([]);setNotice("Session feedback cleared.");}}><RotateCcw size={15} aria-hidden="true"/>Reset feedback</button></footer>
    <details className="station-method"><summary>How this station works</summary><p>A small, source-checked catalog — not Apple Music’s algorithm or a live YouTube Music recommendation feed. Shared production and mixing credits lead; mastering, songwriting, sample links and available genre labels add context. Roles are kept separate. Album-level genre tags are labeled in the sources. No BPM, popularity, audio analysis or listening-history data is used. Unknown fields stay unknown. The same album family and recording are excluded; queue diversity spaces out artists. “More like this” gently adjusts ranking within existing matches; “Not for me” hides only that track. Listen opens ordinary YouTube search, not automatic playback.</p></details>
  </section>;
}
