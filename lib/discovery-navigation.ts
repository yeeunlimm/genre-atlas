import type {AlbumTrack,ReleaseCard} from "./releases";

export type DiscoveryMode="artist"|"song";
export function discoveryModeFromUrl(url:URL):DiscoveryMode{
  if(url.hash==="#artist-discover")return "artist";
  return url.hash==="#discovery-station"||url.searchParams.has("stationTrack")||url.searchParams.has("songQuery")?"song":"artist";
}
export function safeAlbumReturn(value:string|null):string|null{
  if(!value||value.length>2000||!value.startsWith("/album?"))return null;
  try{const url=new URL(value,"https://local.invalid");return url.origin==="https://local.invalid"&&url.pathname==="/album"?url.pathname+url.search:null;}catch{return null;}
}
export function albumSongHref(track:AlbumTrack,release:ReleaseCard,returnTo:string):string{
  const params=new URLSearchParams({songQuery:(track.title+" "+track.artist).slice(0,120)});
  // Wiki track positions are not recording IDs; search and let the listener choose.
  if(release.provider==="deezer"&&/^\d{1,16}$/.test(track.id))params.set("stationTrack","deezer:"+track.id);
  else if(release.provider==="musicbrainz"&&/^[a-f0-9-]{36}$/i.test(track.id))params.set("stationTrack","mb:"+track.id);
  const back=safeAlbumReturn(returnTo);if(back)params.set("fromAlbum",back);
  return "/?"+params+"#discovery-station";
}
