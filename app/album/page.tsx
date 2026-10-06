"use client";
import {useEffect,useState} from "react";
import {ArrowLeft} from "lucide-react";
import type {ReleaseDetail} from "@/lib/releases";
import {ReleaseCover} from "@/components/artist-albums";
import {youtubeSearchUrl} from "@/lib/listen-link";
import {artistReturnHref,canReturnThroughHistory} from "@/lib/artist-return";
const duration=(ms:number|null)=>ms==null?"—":Math.floor(ms/60000)+":"+String(Math.floor(ms/1000)%60).padStart(2,"0");
export default function AlbumPage(){
 const [data,setData]=useState<ReleaseDetail>(),[error,setError]=useState(""),[busy,setBusy]=useState(true),[retry,setRetry]=useState(0),[artist,setArtist]=useState(""),[returnKey,setReturnKey]=useState<string|null>(null);
 useEffect(()=>{const c=new AbortController();const p=new URLSearchParams(window.location.search);setArtist(p.get("artist")||"");setReturnKey(p.get("return"));setBusy(true);setError("");
 void(async()=>{try{const r=await fetch("/api/releases?"+new URLSearchParams({kind:"album",provider:p.get("provider")||"",id:p.get("id")||""}),{signal:c.signal});const d=await r.json() as ReleaseDetail&{error?:string};if(!r.ok)throw new Error(d.error||"Release unavailable.");if(!c.signal.aborted)setData(d);}catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"Release unavailable.");}finally{if(!c.signal.aborted)setBusy(false);}})();return()=>c.abort();},[retry]);
 return <main className="record-page"><header className="topbar"><a className="brand" href="/">GENRE ATLAS</a><a className="record-back" href={artistReturnHref(artist,returnKey)} onClick={event=>{if(event.button===0&&!event.metaKey&&!event.ctrlKey&&!event.shiftKey&&!event.altKey&&canReturnThroughHistory(returnKey)){event.preventDefault();window.history.back();}}}><ArrowLeft size={16} aria-hidden="true"/>Back to albums</a></header>
 {busy?<div className="release-empty" role="status"><h1>Opening the sleeve…</h1><p>Checking the release and its track list.</p></div>:error?<div className="release-empty" role="alert"><h1>Release unavailable</h1><p>{error}</p><button onClick={()=>setRetry(n=>n+1)}>Retry</button></div>:data&&<>
 <section className="record-hero"><ReleaseCover key={data.release.id} release={data.release} large/><div className="record-heading"><span className="eyebrow">THE RECORD / {data.release.types.join(" + ")}</span><h1>{data.release.title}</h1><p className="record-artist">{data.release.artist}</p><dl><div><dt>{data.release.provider==="musicbrainz"?"First released":"Edition released"}</dt><dd>{data.release.date||"Unknown"}</dd></div><div><dt>Tracks in this edition</dt><dd>{data.tracks.length}{data.complete?"":" / "+data.totalTracks}</dd></div><div><dt>Edition</dt><dd>{data.edition||"Catalog edition"}{data.editionDate?" · "+data.editionDate:""}</dd></div></dl><a href={data.release.url} target="_blank" rel="noreferrer">View catalog source ↗</a></div></section>
 <section className="record-tracks" aria-label="Album tracks">{!data.complete&&<p role="status">This catalog returned a partial track list. Check the source for missing tracks.</p>}
 <div className="track-table-wrap"><table aria-label="Track list"><thead><tr><th scope="col">#</th><th scope="col">Title</th><th scope="col">Time</th></tr></thead><tbody>{data.tracks.map((t,i)=><tr key={t.id+":"+i}><td>{data.tracks.some(x=>x.disc>1)?t.disc+".":""}{t.number}</td><td><a href={youtubeSearchUrl(t.artist+" "+t.title)} target="_blank" rel="noreferrer">{t.title}</a></td><td>{duration(t.durationMs)}</td></tr>)}</tbody></table></div></section></>}
 <footer>GENRE ATLAS / THE DISCOGRAPHY</footer></main>;
}
