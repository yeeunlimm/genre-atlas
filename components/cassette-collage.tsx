"use client";
import {useState} from "react";
import {cassetteAlbums} from "@/lib/cassette-albums";
import {englishText} from "@/lib/english-display";
import type {AlbumArtwork} from "@/lib/youtube-music";

function AlbumPrint({album}:{album:AlbumArtwork}){
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 return <span className="cassette-print" title={englishText(album.title,"Album")}>
  <img src={album.imageUrl} alt={englishText(album.title,"Album")+" artwork printed on cassette"} width={400} height={300}
   loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
 </span>;
}
export function CassetteCollage({artist}:{artist?:{id:string;name:string;albumArtwork?:AlbumArtwork;albumArtworks?:AlbumArtwork[]}|null}){
 const albums=cassetteAlbums(artist);
 const album=albums[0];
 return <figure className="cassette-collage" aria-label={artist?englishText(artist.name,"Artist")+" album-art cassette":"Cassette with album artwork from the collection"}>
  <div className="cassette-shell">
   <img className="cassette-base" src="/reference/cassette.png" alt="Vintage transparent cassette tape" width={735} height={469}/>
   {album&&<AlbumPrint key={(artist?.id||"collection")+album.imageUrl} album={album}/>}
   <span className="cassette-label">{englishText(artist?.name,"MIXTAPE")}</span>
  </div>
 </figure>;
}
