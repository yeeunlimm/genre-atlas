"use client";

import {useEffect,useRef,useState} from "react";
import {cassetteAlbums} from "@/lib/cassette-albums";
import {englishText} from "@/lib/english-display";
import type {AlbumArtwork,MusicArtist} from "@/lib/youtube-music";

const playerImage="/reference/cd-player-blank-disc-v1.png";

function DiscArtwork({album,artistName}:{album?:AlbumArtwork;artistName:string}){
 const [loaded,setLoaded]=useState(false);
 const [failed,setFailed]=useState(false);
 return <span className="cd-rotor" data-artwork={loaded&&!failed?"album":"white"}>
  <span className="cd-white-disc" aria-hidden="true"><img src={playerImage} alt="" width={1024} height={1536}/></span>
  <span className="cd-white-disc cd-white-disc-top" aria-hidden="true"><img src={playerImage} alt="" width={1024} height={1536}/></span>
  {album&&!failed&&<img className={"cd-album-image"+(loaded?" is-loaded":"")} src={album.imageUrl}
   alt={englishText(album.title,"Album")+" by "+artistName} width={400} height={400}
   decoding="async" referrerPolicy="no-referrer" onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/>}
 </span>;
}

export function ArtistCdPlayer({artist}:{artist?:MusicArtist|null}){
 const element=useRef<HTMLElement>(null);
 const [inView,setInView]=useState(false);
 const [pageVisible,setPageVisible]=useState(true);
 const [paused,setPaused]=useState(false);
 const [reducedMotion,setReducedMotion]=useState(false);
 // A selected artist's artwork only. No collection sample or previous artist fallback.
 const album=artist?cassetteAlbums(artist)[0]:undefined;
 const artistName=englishText(artist?.name,"Artist");

 useEffect(()=>{
  const target=element.current;
  const observer=typeof IntersectionObserver!=="undefined"?new IntersectionObserver(([entry])=>setInView(entry.isIntersecting),{threshold:.05}):null;
  if(target&&observer)observer.observe(target);else setInView(true);
  const onVisibility=()=>setPageVisible(!document.hidden);
  const preference=window.matchMedia("(prefers-reduced-motion: reduce)");
  const onPreference=()=>setReducedMotion(preference.matches);
  onVisibility();onPreference();
  document.addEventListener("visibilitychange",onVisibility);
  preference.addEventListener("change",onPreference);
  return ()=>{observer?.disconnect();document.removeEventListener("visibilitychange",onVisibility);preference.removeEventListener("change",onPreference);};
 },[]);

 return <figure ref={element} className="artist-cd-player" data-spinning={inView&&pageVisible&&!paused&&!reducedMotion}
  aria-label={artist?artistName+" album CD player":"CD player with a white disc"}>
  <div className="cd-player-body">
   <img className="cd-player-base" src={playerImage} alt="Vintage translucent CD player" width={1024} height={1536}/>
   <div className="cd-disc-window">
    <DiscArtwork key={(artist?.id||"none")+":"+(album?.imageUrl||"white")} album={album} artistName={artistName}/>
   </div>
   <img className="cd-player-fixture cd-player-fixture-left" src={playerImage} alt="" aria-hidden="true" width={1024} height={1536}/>
   <img className="cd-player-fixture cd-player-fixture-right" src={playerImage} alt="" aria-hidden="true" width={1024} height={1536}/>
  </div>
  <button className="cd-motion-toggle" type="button" aria-pressed={paused} disabled={reducedMotion}
   onClick={()=>setPaused(value=>!value)}>{reducedMotion?"Motion reduced":paused?"Resume rotation":"Pause rotation"}</button>
 </figure>;
}
