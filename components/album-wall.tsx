"use client";

import {useEffect,useRef,useState,type KeyboardEvent} from "react";
import collection from "@/lib/album-collection.json";
import {loopScrollTop,wrapAlbumIndex} from "@/lib/collection-loop";

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
 const [focusIndex,setFocusIndex]=useState(0);
 const rail=useRef<HTMLDivElement>(null),span=useRef(0);
 useEffect(()=>{
  const node=rail.current;if(!node)return;
  const measure=()=>{
   const first=node.children[0] as HTMLElement,middle=node.children[albums.length] as HTMLElement;
   if(!first||!middle)return;
   const next=middle.offsetTop-first.offsetTop;if(next<=0)return;
   const phase=span.current?(loopScrollTop(node.scrollTop,span.current)-span.current)/span.current:0;
   span.current=next;node.scrollTop=next*(1+phase);
  };
  measure();const observer=new ResizeObserver(measure);observer.observe(node);if(node.children[0])observer.observe(node.children[0]);
  return()=>observer.disconnect();
 },[albums.length]);
 function focusAlbum(index:number){
  const node=rail.current;if(!node)return;
  const next=wrapAlbumIndex(index,albums.length),button=node.children[albums.length+next] as HTMLButtonElement;
  setFocusIndex(next);button?.focus({preventScroll:true});
  if(button)node.scrollTop=button.offsetTop-8;
 }
 function browse(event:KeyboardEvent<HTMLDivElement>){
  if(event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>("[data-album-index]");
  const index=button?Number(button.dataset.albumIndex):null;
  const next=event.key==="Home"?0:event.key==="End"?albums.length-1:event.key==="ArrowDown"?(index===null?0:index+1):event.key==="ArrowUp"?(index===null?albums.length-1:index-1):null;
  if(next===null)return;event.preventDefault();focusAlbum(next);
 }
 const renderAlbum=(album:Album,index:number,copy:number)=><button key={copy+":"+album.sourceUrl} type="button" className={copy===1?"album-tile":"album-tile album-tile-copy"}
   data-album-index={index} data-copy={copy} data-selected={selected.sourceUrl===album.sourceUrl}
   tabIndex={copy===1&&index===focusIndex?0:-1} aria-hidden={copy===1?undefined:true}
   aria-label={"View "+album.title+" by "+album.artist} aria-pressed={copy===1?selected.sourceUrl===album.sourceUrl:undefined}
   title={album.artist+" — "+album.title}
   onMouseDown={event=>{if(copy!==1)event.preventDefault();}}
   onFocus={()=>{if(copy!==1)focusAlbum(index);else setFocusIndex(index);}}
   onClick={()=>{setSelected(album);if(copy!==1)focusAlbum(index);}}>
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
    <p id="collection-keyboard-help" className="sr-only">Use Up and Down to browse, Enter to select. The last album loops back to the first.</p>
    <div ref={rail} className="album-scroll-rail" role="group" aria-label="Choose a collection album" tabIndex={0} aria-describedby="collection-keyboard-help" onKeyDown={browse} onScroll={event=>{
     const node=event.currentTarget;if(!span.current)return;
     const top=loopScrollTop(node.scrollTop,span.current);if(Math.abs(top-node.scrollTop)>.5)node.scrollTop=top;
    }}>{[0,1,2].flatMap(copy=>albums.map((album,index)=>renderAlbum(album,index,copy)))}</div>
   </div>
  </div>
 </section>;
}
