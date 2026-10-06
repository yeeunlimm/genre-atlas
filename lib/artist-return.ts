import type {MusicArtist} from "./youtube-music";
import type {Genre} from "./genre-view";
import type {ReleaseCard,ReleaseKind,ReleaseList} from "./releases";
import type {ReleaseOrder} from "./release-order";

export type AlbumCatalogView={artistId:string;data?:ReleaseList;cards:ReleaseCard[];filter:"All"|ReleaseKind;order:ReleaseOrder;releaseId:string;viewportTop:number};
export type ArtistReturn={query:string;artist:MusicArtist;related:MusicArtist[];genres:Genre[];genreSource:string;genreStatus:string;note:string;provider:"YouTube Music"|"Deezer";catalog:AlbumCatalogView;scrollY:number};
const PREFIX="genre-atlas:artist-return:",STATE_KEY="genreAtlasArtistReturn",TTL=60*60*1000;
const validKey=(key:string|null):key is string=>!!key&&/^[a-z0-9-]{1,80}$/i.test(key);

// Temporary, tab-local navigation state, not a listening profile or catalog database.
export function saveArtistReturn(value:ArtistReturn):string|null{
 try{
  const keys=Object.keys(sessionStorage).filter(k=>k.startsWith(PREFIX));
  // Keep a bounded history for multiple back/forward journeys in this tab.
  const previous=keys.map(key=>{try{return {key,time:JSON.parse(sessionStorage.getItem(key)||"{}").savedAt||0};}catch{return {key,time:0};}}).sort((a,b)=>b.time-a.time);
  for(const item of previous.slice(7))sessionStorage.removeItem(item.key);
  const key=crypto.randomUUID();
  sessionStorage.setItem(PREFIX+key,JSON.stringify({version:1,savedAt:Date.now(),...value}));
  window.history.replaceState({...window.history.state,[STATE_KEY]:key},"");
  return key;
 }catch{return null;}
}
export function readArtistReturn(key?:string|null):ArtistReturn|null{
 try{
  const id=key??new URLSearchParams(window.location.search).get("return")??window.history.state?.[STATE_KEY];
  if(!validKey(id))return null;
  const value=JSON.parse(sessionStorage.getItem(PREFIX+id)||"null");
  if(!value||value.version!==1||!Number.isFinite(value.savedAt)||Date.now()-value.savedAt>TTL)return null;
  if(!value.artist?.id||typeof value.artist.name!=="string"||typeof value.query!=="string"||!Array.isArray(value.related)||!Array.isArray(value.genres))return null;
  const catalog=value.catalog;
  if(!catalog||catalog.artistId!==value.artist.id||!Array.isArray(catalog.cards)||!["popular","latest"].includes(catalog.order)||!["All","Album","Compilation","Mixtape","EP","Single","Live","Other"].includes(catalog.filter))return null;
  if(!Number.isFinite(value.scrollY)||!Number.isFinite(catalog.viewportTop)||typeof catalog.releaseId!=="string")return null;
  return value;
 }catch{return null;}
}
export function clearArtistReturnMarker(){
 try{
  const state={...window.history.state};delete state[STATE_KEY];
  const url=new URL(window.location.href);url.searchParams.delete("return");url.searchParams.delete("albumArtist");
  window.history.replaceState(state,"",url.pathname+url.search+url.hash);
 }catch{/* Storage/history may be unavailable; search must still work. */}
}
export function artistReturnHref(artist:string,key?:string|null){
 const params=new URLSearchParams({albumArtist:artist});if(validKey(key??null))params.set("return",key!);
 return "/?"+params+"#artist-discover";
}
export function canReturnThroughHistory(key:string|null){
 if(!key||!readArtistReturn(key)||window.history.length<2)return false;
 try{const referrer=new URL(document.referrer);return referrer.origin===window.location.origin&&referrer.pathname==="/";}catch{return false;}
}
export function restoreAlbumPosition(view:AlbumCatalogView,scrollY:number){
 const frame=requestAnimationFrame(()=>{
  const card=document.getElementById("release-"+view.releaseId);
  card?.focus({preventScroll:true});
  window.scrollTo({top:Math.max(0,card?window.scrollY+card.getBoundingClientRect().top-view.viewportTop:scrollY),behavior:"instant"});
 });
 return ()=>cancelAnimationFrame(frame);
}
