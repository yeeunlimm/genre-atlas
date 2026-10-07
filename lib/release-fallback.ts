import {artistReleases,type ReleaseList} from "./releases";
import type {AlbumIdentityHints} from "./release-identity";

// Keep source IDs separate. An empty catalog is not proof of no discography.
export async function catalogReleases(name:string,provider:string,id="",offset=0,hints:AlbumIdentityHints={}):Promise<ReleaseList>{
 const primary=await artistReleases(name,provider,id,offset,hints);
 if(provider!=="deezer"||offset!==0||hints.choose||primary.releases.length)return primary;
 try{
  const alternate=await artistReleases(name,"musicbrainz");
  if(alternate.releases.length||alternate.choices.length)return {...alternate,note:"Deezer did not provide a resolved release list. Showing MusicBrainz instead. "+alternate.note};
 }catch{
  return {...primary,note:primary.note+" The MusicBrainz fallback is temporarily unavailable. Try MusicBrainz again."};
 }
 return primary;
}
