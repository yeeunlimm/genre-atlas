import {apple,loadTrack,normalize,parseApple,musicBrainzCatalog,StationError,rememberTracks} from "./live-station";
import {deezer,deezerArtist,parseDeezer} from "./deezer-catalog";
import {logMusicError,musicAborted} from "./music-request";
import {music, type MusicArtist} from "./youtube-music";
import {excluded, type Candidate, type Route} from "./hybrid-station";
import type {StationTrack} from "./station-catalog";

export type SourceResult={rows:Candidate[];state:"ready"|"empty"|"disabled"|"partial";note:string;nextOffset:number|null};
async function mapLimited<T,R>(items:T[],fn:(item:T,index:number)=>Promise<R>):Promise<PromiseSettledResult<R>[]> {
  const result:PromiseSettledResult<R>[]=[];let index=0;
  await Promise.all(Array.from({length:Math.min(2,items.length)},async()=>{while(index<items.length){const n=index++;try{result[n]={status:"fulfilled",value:await fn(items[n],n)};}catch(reason){result[n]={status:"rejected",reason};}}}));
  return result;
}
export async function catalog(artist:string,title?:string):Promise<{tracks:StationTrack[];fallback:boolean}> {
  let appleFailed=false;
  try{
    const data=await apple("search?"+new URLSearchParams({term:artist+(title?" "+title:""),media:"music",entity:"song",limit:"40",country:"US",lang:"en_us"}));
    const tracks=(data.results||[]).map(parseApple).filter((t:StationTrack|null):t is StationTrack=>!!t&&normalize(t.artist)===normalize(artist)&&(!title||normalize(t.title)===normalize(title)));
    if(tracks.length)return {tracks,fallback:false};
  }catch{appleFailed=true;}
  try{return {tracks:await musicBrainzCatalog(artist,title),fallback:true};}
  catch{throw new StationError(appleFailed?"Apple and MusicBrainz catalogs could not load. Retry shortly.":"No exact Apple match; the alternate catalog could not load. Retry shortly.");}
}
export async function deezerRelated(seed:StationTrack,offset=0):Promise<SourceResult>{
  const id=await deezerArtist(seed);
  if(!id)return {rows:[],state:"empty",note:"No exact Deezer song-and-artist match.",nextOffset:null};
  const related=await deezer(`artist/${id}/related?limit=6&index=${offset}`);
  const peers=(related.data||[]).filter((a:any)=>Number.isSafeInteger(a.id)&&typeof a.name==="string");
  const fetched=await mapLimited(peers,async(peer:any,index)=>{
    if(musicAborted())throw new Error("Request deadline reached.");
    const data=await deezer(`artist/${peer.id}/top?limit=10`);
    const tracks=rememberTracks((data.data||[]).map(parseDeezer).filter((t:StationTrack|null):t is StationTrack=>!!t&&t.artistId===`deezer:${peer.id}`));
    return tracks.filter(t=>!excluded(t,[seed])).slice(0,4).map((track,i):Candidate=>({track,score:0,feedbackBoost:false,paths:[{route:"related-artists",seedId:seed.id,confidence:Math.max(.45,.82-(offset+index)*.008-i*.025)}],reasons:[{kind:"related-artist",label:"Related artist · Deezer",detail:`${peer.name} appears in Deezer’s related artists for ${seed.primaryArtistName||seed.artist}. This is artist-level discovery, not a measured sound match.`,sources:[{label:"Deezer · artist",url:`https://www.deezer.com/artist/${id}`},track.source]}]}));
  });
  const rows=fetched.flatMap(r=>r.status==="fulfilled"?r.value:[]),partial=fetched.some(r=>r.status==="rejected");
  return {rows,state:partial?"partial":rows.length?"ready":"empty",note:"Live Deezer artist connections and track catalog."+(partial?" Some artist catalogs could not load.":""),nextOffset:related.next&&offset+6<30?offset+6:null};
}
export async function relatedCandidates(seed:StationTrack,offset=0):Promise<SourceResult>{
  let failure:unknown;
  try{const result=await deezerRelated(seed,offset);if(result.rows.length||result.nextOffset!==null)return result;}catch(e){failure=e;logMusicError("Deezer","related-artists",e);}
  try{return await youtubeRelated(seed,offset);}catch(e){logMusicError("YouTube Music","related-artists",e);throw failure||e;}
}
export async function youtubeRelated(seed:StationTrack,offset=0):Promise<SourceResult>{
  const name=seed.primaryArtistName||seed.artist;
  const found=await music("search",name) as {artists:MusicArtist[]};
  const matches=found.artists.filter(a=>normalize(a.name)===normalize(name));
  if(matches.length!==1)return {rows:[],state:"empty",note:"No unambiguous YouTube Music artist match. Other routes can still recommend tracks.",nextOffset:null};
  const data=await music("artist",matches[0].id) as {related:MusicArtist[]};
  const peers=data.related.slice(0,30).slice(offset,offset+6);
  let usedFallback=false;
  const fetched=await mapLimited(peers,async(peer,index)=>{
    const result=await catalog(peer.name);usedFallback ||= result.fallback;
    const tracks=result.tracks;
    const source={label:"YouTube Music · related artists",url:matches[0].url};
    // A small pool per artist lets album exclusions and dislikes choose another song.
    return tracks.filter(t=>!excluded(t,[seed])).slice(0,4).map((track,i):Candidate=>({track,score:0,feedbackBoost:false,
      paths:[{route:"related-artists",seedId:seed.id,confidence:Math.max(.45,.82-(offset+index)*.008-i*.025)}],
      reasons:[{kind:"related-artist",label:"Related artist",detail:peer.name+" appears in "+name+"’s related artists. Song selected from "+(result.fallback?"MusicBrainz":"Apple")+"’s catalog; this is not measured track similarity.",sources:[source,track.source]}]}));
  });
  const rows=fetched.flatMap(r=>r.status==="fulfilled"?r.value:[]),partial=fetched.some(r=>r.status==="rejected");
  return {rows,state:partial?"partial":rows.length?"ready":"empty",note:(partial?"Some artist catalogs could not load. Retry this route. ":"")+ (usedFallback?"MusicBrainz supplied alternate catalog results where Apple was unavailable or had no exact match. ":"")+"Artist-level suggestions from YouTube Music; no shared credits required.",nextOffset:offset+6<Math.min(30,data.related.length)?offset+6:null};
}
export async function similarCandidates(seed:StationTrack,key?:string):Promise<SourceResult>{
  if(!key)return {rows:[],state:"disabled",note:"Last.fm similar tracks is off: the site owner has not configured an API key. Other routes remain available.",nextOffset:null};
  const url="https://ws.audioscrobbler.com/2.0/?"+new URLSearchParams({method:"track.getsimilar",artist:seed.artist,track:seed.title,api_key:key,format:"json",autocorrect:"1",limit:"12"});
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw new StationError("Last.fm is unavailable. Retry this route.");
  const data=await response.json() as {error?:number;similartracks?:{track?:{name:string;artist:{name:string};match:string;url?:string}[]}};
  if(data.error)throw new StationError("Last.fm could not complete this lookup. Check the server key or retry later.");
  const tracks=Array.isArray(data.similartracks?.track)?data.similartracks!.track.slice(0,12):[];
  const max=Math.max(1,...tracks.map(t=>Number(t.match)||0));
  const fetched=await mapLimited(tracks,async(t):Promise<Candidate[]>=>{
    if(!t.name||!t.artist?.name)return [];
    const match=(await catalog(t.artist.name,t.name)).tracks.find(row=>!excluded(row,[seed]));if(!match)return [];
    const source={label:"Last.fm · track similarity",url:"https://www.last.fm/music/"+encodeURIComponent(seed.artist)+"/_/"+encodeURIComponent(seed.title)};
    return [{track:match,score:0,feedbackBoost:false,paths:[{route:"similar-tracks",seedId:seed.id,confidence:.55+.4*Math.max(0,Math.min(1,(Number(t.match)||0)/max))}],
      reasons:[{kind:"similar-track",label:"Similar track",detail:"Last.fm listening-data similarity to “"+seed.title+"”. Artist and title matched to a public catalog for album metadata; not an audio measurement.",sources:[source,match.source]}]}];
  });
  const rows=fetched.flatMap(r=>r.status==="fulfilled"?r.value:[]),partial=fetched.some(r=>r.status==="rejected");
  return {rows,state:partial?"partial":rows.length?"ready":"empty",note:partial?"Some similar tracks could not be resolved. Retry this route.":"Last.fm similarity matched to Apple or MusicBrainz album metadata. Unresolved songs are omitted.",nextOffset:null};
}
export async function discoverSource(id:string,route:Route,offset=0,key?:string){
  if(route==="similar-tracks"&&!key)return similarCandidates({} as StationTrack);
  const seed=await loadTrack(id);
  return route==="related-artists"?relatedCandidates(seed,offset):similarCandidates(seed,key);
}
