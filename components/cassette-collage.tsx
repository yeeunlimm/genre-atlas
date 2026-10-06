"use client";
import {useState} from "react";
import {cassetteAlbums} from "@/lib/cassette-albums";
import {englishText} from "@/lib/english-display";
import type {AlbumArtwork} from "@/lib/youtube-music";

function AlbumLabel({album}:{album:AlbumArtwork}){
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 return <span className="cassette-album-label" title={englishText(album.title,"Album")}>
  <img src={album.imageUrl} alt={englishText(album.title,"Album")+" vintage album label"} width={160} height={160}
   loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
 </span>;
}
export function CassetteCollage({artist}:{artist?:{id:string;name:string;albumArtwork?:AlbumArtwork;albumArtworks?:AlbumArtwork[]}|null}){
 const albums=cassetteAlbums(artist);
 const album=albums[0];
 return <figure className="cassette-collage" aria-label={artist?englishText(artist.name,"Artist")+" album-art cassette":"Cassette with album artwork from the collection"}>
  <div className="cassette-shell">
   <img className="cassette-base" src="/reference/mauve-cassette-horizontal-v1.png" alt="Vintage mauve cassette in a clear case" width={1564} height={1006}/>
   {album&&<AlbumLabel key={(artist?.id||"collection")+album.imageUrl} album={album}/>}
   <span className="cassette-label" title={englishText(artist?.name,"MIXTAPE")}>{englishText(artist?.name,"MIXTAPE")}</span>
  </div>
 </figure>;
}
