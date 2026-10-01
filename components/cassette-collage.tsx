"use client";
import {useState} from "react";
import {cassetteAlbums} from "@/lib/cassette-albums";
import {englishText} from "@/lib/english-display";
import type {AlbumArtwork} from "@/lib/youtube-music";

function Sticker({album,index}:{album:AlbumArtwork;index:number}){
 const [failed,setFailed]=useState(false);
 if(failed)return null;
 return <span className={"cassette-sticker cassette-sticker-"+index} title={englishText(album.title,"Album")}>
  <img src={album.imageUrl} alt={englishText(album.title,"Album")+" album cover"} width={160} height={160}
   loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>
 </span>;
}
export function CassetteCollage({artist}:{artist?:{id:string;name:string;albumArtwork?:AlbumArtwork;albumArtworks?:AlbumArtwork[]}|null}){
 const albums=cassetteAlbums(artist);
 return <figure className="cassette-collage" aria-label={artist?englishText(artist.name,"Artist")+" album-poster cassette":"Cassette with album posters from the collection"}>
  <img className="cassette-base" src="/reference/cassette.png" alt="Vintage transparent cassette tape" width={735} height={469}/>
  <span className="cassette-label">{englishText(artist?.name,"MIXTAPE")}</span>
  {albums.map((album,index)=><Sticker key={(artist?.id||"collection")+album.imageUrl} album={album} index={index}/>)}
 </figure>;
}
