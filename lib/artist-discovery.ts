import {music,MusicError,type MusicArtist} from "./youtube-music";
import {deezer} from "./deezer-catalog";
import {MusicLookupError} from "./music-request";

type Raw=Record<string,any>;
export type ArtistDiscovery={artist?:MusicArtist;related:MusicArtist[];artists:MusicArtist[];provider:"YouTube Music"|"Deezer";state:"ready"|"empty"|"choose-artist";notice:string};
export function parseDeezerArtist(row:Raw):MusicArtist|null{
 if(!Number.isSafeInteger(row.id)||row.id<=0||typeof row.name!=="string"||!row.name.trim())return null;
 const audience=Number.isFinite(row.nb_fan)&&row.nb_fan>=0?row.nb_fan:null;
 return {id:"deezer:"+row.id,name:row.name,audience,audienceLabel:audience===null?"Deezer fan count unavailable":audience+" Deezer fans",metric:"deezer-fans",provider:"Deezer",url:"https://www.deezer.com/artist/"+row.id,checkedAt:new Date().toISOString()};
}
export async function deezerArtistCloud(id:string):Promise<ArtistDiscovery>{
 if(!/^deezer:\d{1,16}$/.test(id))throw new MusicError("Invalid artist ID.",400);
 const value=id.slice(7);
 const [row,links]=await Promise.all([deezer("artist/"+value),deezer("artist/"+value+"/related?limit=30")]);
 const artist=parseDeezerArtist(row);if(!artist)throw new MusicError("Artist not found.",404);
 const related=[...new Map((links.data||[]).map(parseDeezerArtist).filter((a:MusicArtist|null):a is MusicArtist=>!!a&&a.id!==id).map((a:MusicArtist)=>[a.id,a])).values()] as MusicArtist[];
 return {artist,related,artists:[],provider:"Deezer",state:related.length?"ready":"empty",notice:related.length?"Related artists from Deezer. Word size reflects Deezer fans, not monthly listeners.":"Deezer returned no related artists for this artist. You can retry or explore a genre."};
}
export async function artistDiscovery(kind:string,value:string,name=""):Promise<ArtistDiscovery>{
 if(!value.trim()||value.length>100||name.length>100)throw new MusicError("Enter an artist name of 1–100 characters.",400);
 if(kind==="artist"&&!/^UC[A-Za-z0-9_-]{22}$/.test(value))throw new MusicError("Invalid artist ID.",400);
 if(kind!=="artist"&&kind!=="search")throw new MusicError("Invalid artist lookup.",400);
 try{
  const result=await music(kind,value);
  if(kind==="search"){
   const artists=(result.artists||[]) as MusicArtist[];
   return {artists,related:[],provider:"YouTube Music",state:artists.length?"ready":"empty",notice:artists.length?"":"YouTube Music returned no matching artists."};
  }
  return {...result,artists:[],provider:"YouTube Music",state:result.related.length?"ready":"empty",notice:result.related.length?"Related artists from YouTube Music, ranked by monthly audience.":"YouTube Music returned no related artists. Explore a genre or retry this artist."};
 }catch(e){
  if(e instanceof MusicLookupError){
   if(e.upstreamStatus===403)throw new MusicError("YouTube Music rejected this server request (HTTP 403). Related artists are unavailable; the source has not been switched to Deezer.");
   if(e.code==="timeout")throw new MusicError("YouTube Music did not respond in time. Please retry shortly.");
   throw new MusicError("YouTube Music is temporarily unavailable. Please retry shortly.");
  }
  throw e;
 }
}
