import {music,MusicError,type MusicArtist} from "./youtube-music";
import {deezer} from "./deezer-catalog";

type Raw=Record<string,any>;
export type ArtistDiscovery={artist?:MusicArtist;related:MusicArtist[];artists:MusicArtist[];provider:"YouTube Music"|"Deezer";state:"ready"|"empty"|"choose-artist";notice:string};
const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[\s._'’()-]/g,"");
export function parseDeezerArtist(row:Raw):MusicArtist|null{
 if(!Number.isSafeInteger(row.id)||row.id<=0||typeof row.name!=="string"||!row.name.trim())return null;
 const audience=Number.isFinite(row.nb_fan)&&row.nb_fan>=0?row.nb_fan:null;
 return {id:"deezer:"+row.id,name:row.name,audience,audienceLabel:audience===null?"Deezer fan count unavailable":audience+" Deezer fans",metric:"deezer-fans",provider:"Deezer",url:"https://www.deezer.com/artist/"+row.id,checkedAt:new Date().toISOString()};
}
async function searchDeezer(name:string){
 const data=await deezer("search/artist?"+new URLSearchParams({q:name,limit:"25"}));
 return [...new Map((data.data||[]).map(parseDeezerArtist).filter((a:MusicArtist|null):a is MusicArtist=>!!a).map((a:MusicArtist)=>[a.id,a])).values()] as MusicArtist[];
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
 if(kind==="artist"&&value.startsWith("deezer:"))return deezerArtistCloud(value);
 if(kind==="artist"&&!/^UC[A-Za-z0-9_-]{22}$/.test(value))throw new MusicError("Invalid artist ID.",400);
 let primaryError:unknown,primary:ArtistDiscovery|undefined;
 try{
  const result=await music(kind,value);
  if(kind==="search"){
   const artists=(result.artists||[]) as MusicArtist[];
   if(artists.length)return {artists,related:[],provider:"YouTube Music",state:"ready",notice:""};
  }else{
   primary={...result,artists:[],provider:"YouTube Music",state:result.related.length?"ready":"empty",notice:"Related artists from YouTube Music, ranked by monthly audience."};
   if(primary!.related.length)return primary!;
   name=result.artist.name;
  }
 }catch(e){primaryError=e;}
 if(kind==="search"){
  try{const artists=await searchDeezer(value);return {artists,related:[],provider:"Deezer",state:artists.length?"ready":"empty",notice:"Showing Deezer artist search. YouTube Music is unavailable or returned no matches."};}
  catch{throw new MusicError("Artist sources are temporarily unavailable. Retry shortly.");}
 }
 if(name.trim()){
  try{
   const candidates=await searchDeezer(name.trim()),exact=candidates.filter(a=>normalize(a.name)===normalize(name));
   // Names are not cross-provider identities. Never choose the most popular homonym.
   if(exact.length===1){const fallback=await deezerArtistCloud(exact[0].id);return {...fallback,notice:"YouTube Music is unavailable or has no related list. Matched by artist name on Deezer. "+fallback.notice};}
   if(candidates.length)return {artist:primary?.artist,related:[],artists:exact.length?exact:candidates,provider:"Deezer",state:"choose-artist",notice:"YouTube Music could not provide related artists. Choose the matching Deezer artist below to continue."};
  }catch{throw new MusicError("Related-artist sources are temporarily unavailable. Retry this artist shortly.");}
 }
 if(primaryError)throw new MusicError("YouTube Music could not load this artist. Retry shortly or search the artist again.");
 return {...primary!,notice:"No related artists were returned by the available sources. Try a genre or retry this artist."};
}
