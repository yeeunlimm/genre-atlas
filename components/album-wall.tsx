"use client";

import {useRef,useState} from "react";
import collection from "@/lib/album-collection.json";

type Album=(typeof collection.albums)[number];

function Cover({album,large=false}:{album:Album;large?:boolean}){
 const [failed,setFailed]=useState(false);
 return failed
  ? <span className="album-cover-fallback">{album.title}<small>Cover unavailable</small></span>
  : <img src={album.imageUrl} alt={album.title+" — "+album.artist} width={600} height={600}
      className={large?"album-cover-large":"album-cover"} decoding="async"
      loading={large?"eager":"lazy"} referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>;
}

function RecordSleeve({album,large=false}:{album:Album;large?:boolean}){
 return <span className={"album-record"+(large?" album-record-large":"")}>
  <img className="album-vinyl" src="/reference/collection-vinyl-record-v1.png" alt="" aria-hidden="true" width={1254} height={1254} decoding="async"/>
  <span className="album-sleeve"><Cover album={album} large={large}/></span>
 </span>;
}

export function AlbumWall({onExploreArtist}:{onExploreArtist:(name:string)=>void}){
 const albums=[...collection.albums,...collection.rightColumn];
 const [selected,setSelected]=useState<Album>(albums[0]);
 const rail=useRef<HTMLDivElement|null>(null);
 const renderAlbum=(album:Album)=><button key={album.sourceUrl} type="button" className="album-tile"
   aria-label={"View "+album.title+" by "+album.artist} aria-pressed={selected.sourceUrl===album.sourceUrl}
   title={album.artist+" — "+album.title}
   onClick={()=>setSelected(album)}>
   <RecordSleeve album={album}/>
  </button>;
 return <section className="album-wall" id="the-collection" aria-label="Album cover collection">
  <div className="album-wall-heading"><span>THE COLLECTION</span><span>{String(albums.indexOf(selected)+1).padStart(2,"0")} / {albums.length}</span></div>
  <div className="album-wall-body">
  <div className="album-feature">
   <RecordSleeve key={selected.sourceUrl} album={selected} large/>
   <div className="album-inline-details" aria-live="polite">
    <a className="album-title-link" href={"/album?"+new URLSearchParams({collection:selected.sourceUrl,artist:selected.artist})} title="Open album details">{selected.title} <span aria-hidden="true">↗</span></a>
    <div className="collection-artists">{(selected.artist.includes(" & ")?selected.artist.split(/,\s*|\s+&\s+/):[selected.artist]).map((name,i)=><span key={name}>{i>0&&<span aria-hidden="true"> · </span>}<button type="button" className="album-artist-link" title={"Discover "+name} onClick={()=>onExploreArtist(name)}>{name} <span aria-hidden="true">→</span></button></span>)}</div>
   </div>
  </div>
   <div className="album-browser">
    <button className="album-scroll-button" type="button" aria-label="Scroll albums up" onClick={()=>rail.current?.scrollBy({top:-200})}>↑</button>
    <div ref={rail} className="album-scroll-rail" role="group" aria-label="Choose a collection album">{albums.map(renderAlbum)}</div>
    <button className="album-scroll-button" type="button" aria-label="Scroll albums down" onClick={()=>rail.current?.scrollBy({top:200})}>↓</button>
   </div>
  </div>
 </section>;
}
