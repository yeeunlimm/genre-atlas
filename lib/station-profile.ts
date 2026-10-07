import {blankMemory,cleanMemory,songKey,type Memory} from "./hybrid-station";
import type {StationTrack} from "./station-catalog";

export type StationProfile={version:2;memory:Memory;liked:StationTrack[]};
export const profileKey=(userId:string|null)=>"genre-atlas.station.v2:"+(userId?"user:"+encodeURIComponent(userId):"guest");
export function readProfile(raw:unknown,signedIn:boolean):StationProfile {
  const p=raw&&typeof raw==="object"?raw as Partial<StationProfile>:{};
  const memory=cleanMemory(p.memory);
  if(!signedIn)memory.votes=Object.fromEntries(Object.entries(memory.votes).filter(([,v])=>v.vote!=="like"));
  const liked:StationTrack[]=[];
  if(signedIn&&Array.isArray(p.liked))for(const t of p.liked.slice(0,1000)){
    if(!t||![t.id,t.recordingId,t.artistId,t.title,t.artist,t.album,t.albumFamily].every(s=>typeof s==="string"&&s.length>0&&s.length<800))continue;
    let url:URL;try{url=new URL(t.source?.url);if(url.protocol!=="https:"||url.username||url.password)continue;}catch{continue;}
    const safe:StationTrack={id:t.id,recordingId:t.recordingId,artistId:t.artistId,title:t.title,artist:t.artist,album:t.album,albumFamily:t.albumFamily,source:{label:"Saved catalog source",url:url.href},credits:[],genres:[],checkedAt:typeof t.checkedAt==="string"?t.checkedAt:"",primaryArtistName:typeof t.primaryArtistName==="string"?t.primaryArtistName:undefined,artworkUrl:typeof t.artworkUrl==="string"?t.artworkUrl:undefined};
    if(!liked.some(x=>songKey(x)===songKey(safe)))liked.push(safe);
  }
  return {version:2,memory,liked};
}
export function addLiked(liked:StationTrack[],track:StationTrack){if(liked.length>=1000&&!liked.some(t=>songKey(t)===songKey(track)))return liked;return [track,...liked.filter(t=>songKey(t)!==songKey(track))];}
export function stationSeeds(track:StationTrack,liked:StationTrack[]){return [track,...liked.filter(t=>songKey(t)!==songKey(track)).slice(0,4)];}
export const emptyProfile=():StationProfile=>({version:2,memory:blankMemory(),liked:[]});
