import type {StationTrack} from "./station-catalog";
import {musicJson,MusicLookupError} from "./music-request";
type Raw=Record<string,any>;
const norm=(s:string)=>s.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
const memory=new Map<string,{until:number;data:Raw}>();
export async function deezer(path:string):Promise<Raw>{
  const hit=memory.get(path);if(hit&&hit.until>Date.now())return hit.data;
  const data=await musicJson("https://api.deezer.com/"+path,"Deezer",path.split(/[/?]/)[0]);
  if(data.error)throw new MusicLookupError("Deezer",path.split(/[/?]/)[0],"catalog_error");
  if(memory.size>=100)memory.delete(memory.keys().next().value!);
  memory.set(path,{until:Date.now()+600000,data});return data;
}
export function parseDeezer(row:Raw):StationTrack|null{
  if(!Number.isSafeInteger(row.id)||!row.title||!row.artist?.name||!Number.isSafeInteger(row.artist.id)||!row.album?.title||!Number.isSafeInteger(row.album.id))return null;
  const source={label:"Deezer · catalog metadata",url:"https://www.deezer.com/track/"+row.id};
  let artworkUrl:string|undefined;try{const u=new URL(row.album.cover_big||row.album.cover_medium);if(u.protocol==="https:"&&u.hostname.endsWith(".dzcdn.net"))artworkUrl=u.href;}catch{}
  return {id:"deezer:"+row.id,recordingId:"deezer:"+row.id,artistId:"deezer:"+row.artist.id,title:row.title,artist:row.artist.name,primaryArtistName:row.artist.name,album:row.album.title,albumFamily:"deezer-album:"+row.album.id,durationMs:row.duration?row.duration*1000:undefined,source,checkedAt:new Date().toISOString().slice(0,10),credits:[],genres:[],catalogKind:"deezer",artworkUrl,explicitness:row.explicit_lyrics?"explicit":undefined};
}
export async function deezerSearch(q:string,limit=40){
  const data=await deezer("search?"+new URLSearchParams({q,limit:String(limit)}));
  const tracks:StationTrack[]=(data.data||[]).map(parseDeezer).filter((t:StationTrack|null):t is StationTrack=>!!t);
  return {tracks,provider:"Deezer",canExpand:!!data.next&&limit<200,warning:""};
}
export async function deezerTrack(id:string){
  if(!/^deezer:\d{1,16}$/.test(id))throw new Error("Invalid Deezer recording ID.");
  const track=parseDeezer(await deezer("track/"+id.slice(7)));
  if(!track)throw new MusicLookupError("Deezer","track","not_found");return track;
}
export async function deezerArtist(seed:StationTrack):Promise<string|null>{
  if(seed.artistId.startsWith("deezer:"))return /^deezer:\d{1,16}$/.test(seed.artistId)?seed.artistId.slice(7):null;
  // Resolve from an exact song AND artist, not a fuzzy artist-name result.
  const {tracks}=await deezerSearch((seed.primaryArtistName||seed.artist)+" "+seed.title,25);
  const names=[...new Set(tracks.filter(t=>norm(t.artist)===norm(seed.primaryArtistName||seed.artist)&&norm(t.title)===norm(seed.title)).map(t=>t.artistId))];
  return names.length===1?names[0].slice(7):null;
}
