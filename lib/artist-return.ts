import type {MusicArtist} from "./youtube-music";
import type {Genre} from "./genre-view";
import type {ReleaseCard,ReleaseKind,ReleaseList} from "./releases";
import type {ReleaseOrder} from "./release-order";

export type AlbumCatalogView={artistId:string;data?:ReleaseList;cards:ReleaseCard[];filter:"All"|ReleaseKind;order:ReleaseOrder;releaseId:string;viewportTop:number};
export type ArtistReturn={query:string;artist:MusicArtist;related:MusicArtist[];genres:Genre[];genreSource:string;genreStatus:string;note:string;provider:"YouTube Music"|"Deezer";catalog:AlbumCatalogView;scrollY:number};
const PREFIX="genre-atlas:artist-return:",STATE_KEY="genreAtlasArtistReturn",TTL=24*60*60*1000;
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
  // The URL survives a router replacing history.state, reloads and browser Back.
  // Store only an opaque tab-local snapshot key here, never the catalog itself.
  window.history.replaceState({...window.history.state,[STATE_KEY]:key},"",artistReturnHref(value.artist.name,key));
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
 // A fragment would race the saved card position during hydration.
 return "/?"+params+(validKey(key??null)?"":"#artist-discover");
}
export function canReturnThroughHistory(key:string|null){
 if(!key||!readArtistReturn(key)||window.history.length<2)return false;
 try{const referrer=new URL(document.referrer);return referrer.origin===window.location.origin&&referrer.pathname==="/"&&referrer.searchParams.get("return")===key;}catch{return false;}
}
export function restoreAlbumPosition(view:AlbumCatalogView,scrollY:number){
 let frame=0,stopped=false,started:number|undefined,focused=false;
 const previous=window.history.scrollRestoration;
 window.history.scrollRestoration="manual";
 const events=["wheel","touchstart","pointerdown","keydown"] as const;
 function stop(){
  if(stopped)return;stopped=true;cancelAnimationFrame(frame);
  window.history.scrollRestoration=previous;
  for(const event of events)window.removeEventListener(event,stop);
  window.removeEventListener("pagehide",stop);
 }
 for(const event of events)window.addEventListener(event,stop,{passive:true});
 window.addEventListener("pagehide",stop);
 function align(now:number){
  if(stopped)return;started??=now;
  const card=document.getElementById("release-"+view.releaseId);
  if(card&&!focused){card.focus({preventScroll:true});focused=true;}
  const top=Math.max(0,card?window.scrollY+card.getBoundingClientRect().top-view.viewportTop:scrollY);
  if(Math.abs(window.scrollY-top)>1)window.scrollTo({top,behavior:"instant"});
  // Hydration, browser scroll restoration and fonts can settle after the first
  // frame. Re-align briefly, but never fight a user's scroll/touch/keyboard.
  if(now-started<700)frame=requestAnimationFrame(align);else stop();
 }
 frame=requestAnimationFrame(align);
 return stop;
}
