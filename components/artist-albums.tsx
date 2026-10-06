"use client";
import {useEffect,useRef,useState} from "react";
import type {ReleaseCard,ReleaseList,ReleaseKind} from "@/lib/releases";

export function ReleaseCover({release,large=false}:{release:ReleaseCard;large?:boolean}){
 const [failed,setFailed]=useState(false);
 const artwork=large&&release.provider==="musicbrainz"?release.artwork?.replace("/front-250","/front-500"):release.artwork;
 return <div className={"release-cover"+(large?" large":"")}>{artwork&&!failed?<img src={artwork} alt={release.title+" cover"} width={large?600:250} height={large?600:250} loading={large?"eager":"lazy"} onError={()=>setFailed(true)} referrerPolicy="no-referrer"/>:<span className="cover-missing"><span aria-hidden="true">◎</span>Artwork unavailable</span>}</div>;
}
const filters:("All"|ReleaseKind)[]=["All","Album","Compilation","Mixtape","EP","Single","Live","Other"];
const labels:Record<string,string>={All:"All releases",Album:"Albums",Compilation:"Compilations",Mixtape:"Mixtapes",EP:"EPs",Single:"Singles",Live:"Live",Other:"Other"};
export function ArtistAlbums({artist}:{artist:{id:string;name:string}|null}){
 const [provider,setProvider]=useState("musicbrainz"),[data,setData]=useState<ReleaseList>(),[cards,setCards]=useState<ReleaseCard[]>([]),[filter,setFilter]=useState<"All"|ReleaseKind>("All"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const request=useRef<AbortController|null>(null);
 async function read(id="",offset=0){
  if(!artist)return;request.current?.abort();const c=new AbortController();request.current=c;setBusy(true);setError("");
  if(!offset){setCards([]);setData(undefined);}
  try{const r=await fetch("/api/releases?"+new URLSearchParams({artist:artist.name,provider,id,offset:String(offset)}),{signal:c.signal});const d=await r.json() as ReleaseList&{error?:string};if(!r.ok)throw new Error(d.error||"Catalog unavailable.");
   if(c.signal.aborted)return;setData(d);setCards(old=>[...new Map([...(offset?old:[]),...d.releases].map((r:ReleaseCard)=>[r.id,r])).values()]);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"Catalog unavailable.");}finally{if(!c.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{setFilter("All");void read();return()=>request.current?.abort();},[artist?.id,provider]);
 if(!artist)return <div className="release-empty"><h3>Your next record.</h3><p>Search an artist to explore their releases.</p></div>;
 const visible=cards.filter(r=>filter==="All"||r.types.includes(filter)).sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
 return <div className="release-catalog">
  <div className="release-tools"><p className="source-caption">THE DISCOGRAPHY / {provider==="musicbrainz"?"MUSICBRAINZ":"DEEZER"}</p><label>Catalog <select aria-label="Album catalog" value={provider} onChange={e=>setProvider(e.target.value)}><option value="musicbrainz">MusicBrainz</option><option value="deezer">Deezer</option></select></label></div>
  <p className="release-note">Loaded releases, newest first. Release types come from the catalog, not a popularity ranking.</p>
  <div className="release-filters" aria-label="Release types">{filters.map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{labels[f]}{f!=="All"&&<small>{cards.filter(r=>r.types.includes(f)).length}</small>}</button>)}</div>
  {data?.choices.length? <div className="release-choices"><h3>Choose the artist</h3>{data.choices.map(a=><button key={a.id} onClick={()=>void read(a.id)}><b>{a.name}</b><span>{a.detail||"No disambiguation supplied"} · {a.id}</span></button>)}</div>:null}
  {error&&<div role="alert" className="release-empty"><p>{error}</p><button onClick={()=>void read(data?.artistId||"")}>Retry catalog</button></div>}
  <div className="release-grid" aria-busy={busy}>{visible.map(r=><a className="release-card" href={"/album?"+new URLSearchParams({provider:r.provider,id:r.id,artist:artist.name})} key={r.id}><ReleaseCover key={r.artwork||r.id} release={r}/><h3>{r.title}</h3><p>{r.date||"Date unavailable"}<span>{r.types.join(" / ")}</span></p></a>)}</div>
  {busy&&<p role="status" className="release-note">Finding releases…</p>}
  {!busy&&!error&&!visible.length&&!data?.choices.length&&<div className="release-empty"><h3>No {filter==="All"?"releases":labels[filter].toLowerCase()} found here.</h3><p>{cards.length?"Choose another release type.":"Try the other catalog. A missing result does not mean the artist has no releases."}</p></div>}
  {data?.nextOffset!=null&&<button className="release-more" disabled={busy} onClick={()=>void read(data.artistId,data.nextOffset!)}>Load more releases</button>}
  {data&&<p className="release-note">{cards.length} of {data.total} catalog releases loaded. {data.note}</p>}
 </div>;
}
