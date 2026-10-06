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

export function AlbumWall(){
 const [selected,setSelected]=useState<Album|null>(null);
 const opener=useRef<HTMLButtonElement|null>(null);
 const renderAlbum=(album:Album)=><button key={album.sourceUrl} type="button" className="album-tile"
   aria-label={"View "+album.title+" by "+album.artist} aria-haspopup="dialog"
   title={album.artist+" — "+album.title}
   onClick={event=>{opener.current=event.currentTarget;setSelected(album);}}>
   <Cover album={album}/>
  </button>;
 return <section className="album-wall" aria-label="Album cover collection">
  <div className="album-wall-heading"><span>THE COLLECTION</span><span>SELECT A COVER</span></div>
  <div className="album-wall-grid">
   <div className="album-wall-main">{collection.albums.map(renderAlbum)}</div>
   <div className="album-wall-extension">{collection.rightColumn.map(renderAlbum)}</div>
  </div>
  <Dialog open={selected!==null} onOpenChange={open=>{if(!open)setSelected(null);}}>
   <DialogContent className="album-dialog" onCloseAutoFocus={event=>{event.preventDefault();opener.current?.focus();}}>
    {selected&&<>
     <Cover key={selected.sourceUrl} album={selected} large/>
     <DialogHeader>
      <DialogTitle>{selected.title}</DialogTitle>
      <DialogDescription>{selected.artist}</DialogDescription>
     </DialogHeader>
     <a className="album-credit" href={selected.sourceUrl} target="_blank" rel="noreferrer">Artwork source ↗</a>
    </>}
   </DialogContent>
  </Dialog>
 </section>;
}
