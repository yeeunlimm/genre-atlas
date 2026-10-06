"use client";
import {useEffect,useRef,useState} from "react";
import type {ReleaseCard,ReleaseList,ReleaseKind} from "@/lib/releases";
import {albumFans,orderReleases,type ReleaseOrder} from "@/lib/release-order";
import type {AlbumCatalogView} from "@/lib/artist-return";
import {preferredAlbumArtist,rememberAlbumArtist,forgetAlbumArtist} from "@/lib/album-artist-preference";

export function ReleaseCover({release,large=false}:{release:ReleaseCard;large?:boolean}){
 const [failed,setFailed]=useState(false);
 const artwork=large&&release.provider==="musicbrainz"?release.artwork?.replace("/front-250","/front-500"):release.artwork;
 return <div className={"release-cover"+(large?" large":"")}>{artwork&&!failed?<img src={artwork} alt={release.title+" cover"} width={large?600:250} height={large?600:250} loading={large?"eager":"lazy"} onError={()=>setFailed(true)} referrerPolicy="no-referrer"/>:<span className="cover-missing"><span aria-hidden="true">◎</span>Artwork unavailable</span>}</div>;
}
const filters:("All"|ReleaseKind)[]=["All","Album","Compilation","Mixtape","EP","Single","Live","Other"];
const labels:Record<string,string>={All:"All releases",Album:"Albums",Compilation:"Compilations",Mixtape:"Mixtapes",EP:"EPs",Single:"Singles",Live:"Live",Other:"Other"};
export function ArtistAlbums({artist,restore,onOpenRelease,onRestored}:{artist:{id:string;name:string;albumArtworks?:{title:string}[];albumArtwork?:{title:string}}|null;restore?:AlbumCatalogView;onOpenRelease?:(view:AlbumCatalogView)=>string|null;onRestored?:()=>void}){
 const restored=restore?.artistId===artist?.id?restore:undefined;
 const [data,setData]=useState<ReleaseList|undefined>(restored?.data),[cards,setCards]=useState<ReleaseCard[]>(restored?.cards||[]),[filter,setFilter]=useState<"All"|ReleaseKind>(restored?.filter||"All"),[order,setOrder]=useState<ReleaseOrder>(restored?.order||"popular"),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const request=useRef<AbortController|null>(null);
 const lastLookup=useRef({id:"",offset:0,choose:false});
 async function read(id="",offset=0,choose=false){
  if(!artist)return;request.current?.abort();const c=new AbortController();request.current=c;setBusy(true);setError("");
  lastLookup.current={id,offset,choose};
  if(!offset){setCards([]);setData(undefined);}
  const params=new URLSearchParams({artist:artist.name,provider:"deezer",id,offset:String(offset)});
  for(const title of [...new Set((artist.albumArtworks||[artist.albumArtwork]).filter(a=>a&&typeof a.title==="string"&&a.title.length<=200).map(a=>a!.title))].slice(0,4))params.append("album",title);
  if(choose)params.set("choose","1");
  try{const r=await fetch("/api/releases?"+params,{signal:c.signal});const d=await r.json() as ReleaseList&{error?:string};if(!r.ok)throw new Error(d.error||"Catalog unavailable.");
   if(c.signal.aborted)return;setData(d);setCards(old=>[...new Map([...(offset?old:[]),...d.releases].map((r:ReleaseCard)=>[r.id,r])).values()]);
   if(d.artistId&&!d.choices.length)rememberAlbumArtist(artist,d.artistId);
  }catch(e){if(!c.signal.aborted)setError(e instanceof Error?e.message:"Catalog unavailable.");}finally{if(!c.signal.aborted)setBusy(false);}
 }
 useEffect(()=>{if(restored){if(artist&&restored.data?.artistId)rememberAlbumArtist(artist,restored.data.artistId);onRestored?.();return;}setFilter("All");void read(artist?preferredAlbumArtist(artist):"");return()=>request.current?.abort();},[artist?.id]);
 if(!artist)return <div className="release-empty"><h3>Your next record.</h3><p>Search an artist to explore their releases.</p></div>;
 const chooseArtist=()=>{forgetAlbumArtist(artist);void read("",0,true);};
 const filtered=cards.filter(r=>filter==="All"||r.types.includes(filter));
 const hasPopularity=filtered.some(r=>albumFans(r)!==null);
 const effectiveOrder=order==="popular"&&!hasPopularity?"latest":order;
 const visible=orderReleases(filtered,effectiveOrder);
 return <div className="release-catalog">
  <div className="release-tools"><p className="source-caption">THE DISCOGRAPHY / DEEZER</p><div className="release-sort" role="group" aria-label="Album order"><button aria-pressed={effectiveOrder==="popular"} disabled={!hasPopularity} onClick={()=>setOrder("popular")}>Popular</button><button aria-pressed={effectiveOrder==="latest"} onClick={()=>setOrder("latest")}>Latest</button></div></div>
  {data?.artistId&&!data.choices.length&&<div className="release-identity"><span>{data.identity==="album-match"?"Artist matched by album titles.":"Album artist connected."} Selection is remembered in this browser.</span><button disabled={busy} onClick={chooseArtist}>Change artist</button></div>}
  <p className="release-note" aria-live="polite">{effectiveOrder==="popular"?"Most Deezer album fans first, among loaded releases. Missing fan counts appear last.":"Newest release dates first, among loaded releases."}{!busy&&filtered.length>0&&!hasPopularity?" Popularity data is unavailable for these releases.":""}</p>
  <div className="release-filters" aria-label="Release types">{filters.map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{labels[f]}{f!=="All"&&<small>{cards.filter(r=>r.types.includes(f)).length}</small>}</button>)}</div>
  {data?.choices.length? <div className="release-choices"><h3>Which artist did you mean?</h3><p className="release-note">These artists share a name. Compare their releases; your choice will be remembered in this browser.</p>{data.choices.map(a=><button className="release-artist-choice" key={a.id} onClick={()=>void read(a.id)}>{a.image&&<img src={a.image} alt="" width={64} height={64} loading="lazy" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.visibility="hidden";}}/>}<span className="release-choice-copy"><b>{a.name}</b><span>{a.detail||"No disambiguation supplied"}</span><span>{a.albums?.length?"Releases: "+a.albums.join(" · "):a.albums?"No releases returned by Deezer.":"Release details unavailable."}</span></span></button>)}</div>:null}
  {error&&<div role="alert" className="release-empty"><p>{error}</p><button onClick={()=>{const last=lastLookup.current;void read(last.id,last.offset,last.choose);}}>Retry catalog</button><button onClick={chooseArtist}>Change artist</button></div>}
  <div className="release-grid" aria-busy={busy}>{visible.map(r=><a className="release-card" id={"release-"+r.id} href={"/album?"+new URLSearchParams({provider:r.provider,id:r.id,artist:artist.name})} key={r.id} onClick={event=>{
   if(event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||!onOpenRelease)return;
   const key=onOpenRelease({artistId:artist.id,data,cards,filter,order,releaseId:r.id,viewportTop:event.currentTarget.getBoundingClientRect().top});
   if(key){event.preventDefault();const url=new URL(event.currentTarget.href);url.searchParams.set("return",key);window.location.assign(url.pathname+url.search);}
  }}><ReleaseCover key={r.artwork||r.id} release={r}/><h3>{r.title}</h3><p>{r.date||"Date unavailable"}<span>{r.types.join(" / ")}</span>{effectiveOrder==="popular"&&<span>{albumFans(r)===null?"Fan count unavailable":albumFans(r)!.toLocaleString("en-US")+" Deezer fans"}</span>}</p></a>)}</div>
  {busy&&<p role="status" className="release-note">Finding releases…</p>}
  {!busy&&!error&&!visible.length&&!data?.choices.length&&<div className="release-empty"><h3>No {filter==="All"?"releases":labels[filter].toLowerCase()} found here.</h3><p>{cards.length?"Choose another release type.":"Try another artist name or spelling. A missing result does not mean the artist has no releases."}</p></div>}
  {data?.nextOffset!=null&&<button className="release-more" disabled={busy} onClick={()=>void read(data.artistId,data.nextOffset!)}>Load more releases</button>}
  {data&&<p className="release-note">{cards.length} of {data.total} catalog releases loaded. {data.note}</p>}
 </div>;
}
