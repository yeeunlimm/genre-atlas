"use client";

import {useRef,useState} from "react";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
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
 const [selected,setSelected]=useState<Album|null>(null);
 const opener=useRef<HTMLButtonElement|null>(null);
 const exploring=useRef(false);
 const renderAlbum=(album:Album)=><button key={album.sourceUrl} type="button" className="album-tile"
   aria-label={"View "+album.title+" by "+album.artist} aria-haspopup="dialog"
   title={album.artist+" — "+album.title}
   onClick={event=>{exploring.current=false;opener.current=event.currentTarget;setSelected(album);}}>
   <RecordSleeve album={album}/>
  </button>;
 return <section className="album-wall" id="the-collection" aria-label="Album cover collection">
  <div className="album-wall-heading"><span>THE COLLECTION</span><span>SELECT A COVER</span></div>
  <div className="album-wall-grid">
   <div className="album-wall-main">{collection.albums.map(renderAlbum)}</div>
   <div className="album-wall-extension">{collection.rightColumn.map(renderAlbum)}</div>
  </div>
  <Dialog open={selected!==null} onOpenChange={open=>{if(!open)setSelected(null);}}>
   <DialogContent className="album-dialog" onCloseAutoFocus={event=>{event.preventDefault();if(!exploring.current)opener.current?.focus();}}>
    {selected&&<>
     <RecordSleeve key={selected.sourceUrl} album={selected} large/>
     <DialogHeader>
      <DialogTitle><a className="album-title-link" href={"/album?"+new URLSearchParams({collection:selected.sourceUrl,artist:selected.artist})}>{selected.title}</a></DialogTitle>
      <DialogDescription asChild><div className="collection-artists">{(selected.artist.includes(" & ")?selected.artist.split(/,\s*|\s+&\s+/):[selected.artist]).map((name,i)=><span key={name}>{i>0&&<span aria-hidden="true"> · </span>}<button type="button" className="album-artist-link" onClick={()=>{exploring.current=true;setSelected(null);onExploreArtist(name);}}>{name}</button></span>)}</div></DialogDescription>
     </DialogHeader>
     <a className="album-credit" href={selected.sourceUrl} target="_blank" rel="noreferrer">Artwork source ↗</a>
    </>}
   </DialogContent>
  </Dialog>
 </section>;
}
