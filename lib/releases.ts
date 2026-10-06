import {musicBrainzRequest as mb,normalize,StationError} from "./live-station";
import {deezer} from "./deezer-catalog";
import {resolveAlbumArtist,type AlbumArtistChoice,type AlbumIdentityHints} from "./release-identity";

type Raw=Record<string,any>;
export type ReleaseKind="Album"|"Compilation"|"Mixtape"|"EP"|"Single"|"Live"|"Other";
export type ReleaseCard={id:string;provider:"musicbrainz"|"deezer";title:string;artist:string;date:string;types:ReleaseKind[];artwork?:string;url:string;fans?:number|null};
export type ReleaseArtist=AlbumArtistChoice;
export type ReleaseList={artist:string;artistId:string;provider:string;releases:ReleaseCard[];choices:ReleaseArtist[];nextOffset:number|null;total:number;note:string;identity?:"unique-name"|"album-match"|"selected"};
export type AlbumTrack={id:string;disc:number;number:string;title:string;artist:string;featuring:string|null;durationMs:number|null};
export type ReleaseDetail={release:ReleaseCard;edition:string;editionDate:string;tracks:AlbumTrack[];totalTracks:number;complete:boolean;note:string};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const integer=/^\d{1,16}$/;
const names=(r:Raw)=>(r["artist-credit"]||[]).map((x:Raw)=>(x.name||x.artist?.name||"")+(x.joinphrase||"")).join("");
const quoted=(s:string)=>'"'+s.replace(/["\\]/g," ")+'"';
export function releaseTypes(r:Raw):ReleaseKind[]{
 const result:ReleaseKind[]=[];
 const types=[r["primary-type"],...(r["secondary-types"]||[]),r.record_type];
 for(const [source,label] of [["Album","Album"],["Compilation","Compilation"],["Mixtape/Street","Mixtape"],["EP","EP"],["Single","Single"],["Live","Live"]] as const)
  if(types.some(t=>typeof t==="string"&&t.toLowerCase()===source.toLowerCase()))result.push(label);
 return result.length?result:["Other"];
}
function mbCard(r:Raw,artist:string):ReleaseCard{return {id:r.id,provider:"musicbrainz",title:r.title,artist:names(r)||artist,date:r["first-release-date"]||"",types:releaseTypes(r),artwork:"https://coverartarchive.org/release-group/"+r.id+"/front-250",url:"https://musicbrainz.org/release-group/"+r.id};}
function dzCard(r:Raw,artist:string):ReleaseCard{
 let artwork:string|undefined;try{const u=new URL(r.cover_big||r.cover_medium);if(u.protocol==="https:"&&u.hostname.endsWith(".dzcdn.net"))artwork=u.href;}catch{}
 return {id:String(r.id),provider:"deezer",title:r.title,artist:r.artist?.name||artist,date:r.release_date||"",types:releaseTypes(r),artwork,url:"https://www.deezer.com/album/"+r.id,fans:Number.isSafeInteger(r.fans)&&r.fans>=0?r.fans:null};
}
export async function artistReleases(name:string,provider:string,id="",offset=0,hints:AlbumIdentityHints={}):Promise<ReleaseList>{
 if(!name.trim()||name.length>160||!["musicbrainz","deezer"].includes(provider)||!Number.isInteger(offset)||offset<0||offset>10000)throw new StationError("Invalid artist catalog request.",400);
 let artist=name;
 if(provider==="musicbrainz"){
  if(id&&!uuid.test(id))throw new StationError("Invalid MusicBrainz artist.",400);
  if(!id){
   const data=await mb("artist?query="+encodeURIComponent("artist:"+quoted(name))+"&limit=15");
   const choices:ReleaseArtist[]=(data.artists||[]).filter((a:Raw)=>uuid.test(a.id)&&[a.name,a["sort-name"],...(a.aliases||[]).map((x:Raw)=>x.name)].some(n=>typeof n==="string"&&normalize(n)===normalize(name))).map((a:Raw)=>({id:a.id,name:a.name,detail:[a.type,a.disambiguation,a.country].filter(Boolean).join(" · ")}));
   if(choices.length!==1)return {artist:name,artistId:"",provider,releases:[],choices,nextOffset:null,total:0,note:choices.length?"Choose the correct artist. Names alone are not unique.":"No exact artist match in MusicBrainz. Try the Deezer catalog."};
   id=choices[0].id;artist=choices[0].name;
  }
  const data=await mb("release-group?artist="+id+"&release-group-status=website-default&inc=artist-credits&limit=100&offset="+offset);
  const releases=(data["release-groups"]||[]).filter((r:Raw)=>uuid.test(r.id)).map((r:Raw)=>mbCard(r,artist));
  const total=data["release-group-count"]||releases.length;
  return {artist,artistId:id,provider,releases,choices:[],total,nextOffset:offset+100<total?offset+100:null,note:"MusicBrainz overview releases (bootleg-only and promotional-only groups excluded). Types and original dates are source metadata; coverage may be incomplete. A group can have more than one type."};
 }
 if(id&&!integer.test(id))throw new StationError("Invalid Deezer artist.",400);
 let prefetched:Raw|undefined,identity:ReleaseList["identity"]=id?"selected":undefined;
 if(!id){
  const data=await deezer("search/artist?"+new URLSearchParams({q:name,limit:"25"}));
  const match=await resolveAlbumArtist(name,data.data||[],hints,id=>deezer("artist/"+id+"/albums?limit=100&index=0"));
  if(!match.id)return {artist:name,artistId:"",provider,releases:[],choices:match.choices,nextOffset:null,total:0,note:match.choices.length?"Several artists share this name. Compare their releases to choose.":"No exact Deezer artist match. Try another artist name or spelling."};
  id=match.id;prefetched=offset===0?match.page:undefined;identity=match.identity;
 }
 const data=prefetched||await deezer("artist/"+id+"/albums?limit=100&index="+offset);
 return {artist,artistId:id,provider,identity,releases:(data.data||[]).map((r:Raw)=>dzCard(r,artist)),choices:[],total:data.total||0,nextOffset:data.next?offset+100:null,note:"Release types and edition dates are supplied by Deezer. Mixtapes may be classified as albums; coverage may be incomplete."};
}
export function featuring(title:string,credits:Raw[]=[]):string|null{
 const explicit=title.match(/(?:\(|\[|\s)\s*(?:feat\.?|ft\.?|featuring)\s+([^\])]+)(?:\)|\]|$)/i);
 if(explicit)return explicit[1].trim();
 const guests:string[]=[];let featured=false;
 for(const c of credits){if(featured&&(c.name||c.artist?.name))guests.push(c.name||c.artist.name);if(/\b(?:feat\.?|featuring|ft\.?)\b/i.test(c.joinphrase||""))featured=true;}
 return guests.length?guests.join(", "):null;
}
export async function albumDetail(provider:string,id:string):Promise<ReleaseDetail>{
 if(provider==="musicbrainz"&&uuid.test(id)){
  const group=await mb("release-group/"+id+"?inc=artist-credits");
  const editions=await mb("release?release-group="+id+"&inc=media&limit=100");
  const official=(editions.releases||[]).filter((r:Raw)=>r.status==="Official"&&r.id&&r["track-count"]!==0);
  const all=official.length?official:(editions.releases||[]);
  all.sort((a:Raw,b:Raw)=>Number(!a.media?.some((m:Raw)=>m.format==="Digital Media"))-Number(!b.media?.some((m:Raw)=>m.format==="Digital Media"))||(a.date||"9999").localeCompare(b.date||"9999")||a.id.localeCompare(b.id));
  if(!all[0])throw new StationError("No track-list edition is available for this release group.",404);
  const doc=await mb("release/"+all[0].id+"?inc=recordings+artist-credits");
  const tracks:AlbumTrack[]=(doc.media||[]).flatMap((medium:Raw)=>(medium.tracks||[]).map((t:Raw)=>({id:t.recording?.id||t.id,disc:medium.position||1,number:String(t.number||t.position),title:t.title||t.recording?.title||"",artist:names(t)||names(t.recording||{})||names(doc),featuring:featuring(t.title||t.recording?.title||"",t["artist-credit"]||t.recording?.["artist-credit"]),durationMs:Number.isFinite(t.length)?t.length:Number.isFinite(t.recording?.length)?t.recording.length:null})));
  const total=(doc.media||[]).reduce((sum:number,m:Raw)=>sum+(m["track-count"]||0),0);
  return {release:mbCard(group,names(doc)),edition:doc.title+(doc.disambiguation?" · "+doc.disambiguation:"")+(doc.country?" · "+doc.country:""),editionDate:doc.date||"",tracks,totalTracks:total,complete:tracks.length===total,note:"Track list for the selected "+(doc.status||"unclassified")+" edition. First release date and this edition's date may differ. Featuring is shown only when explicitly credited. Missing durations are not estimated. Source: https://musicbrainz.org/release/"+doc.id};
 }
 if(provider==="deezer"&&integer.test(id)){
  const doc=await deezer("album/"+id),raw:Raw[]=[...(doc.tracks?.data||[])];let more=!!doc.tracks?.next;
  while(more&&raw.length<2000){const d=await deezer("album/"+id+"/tracks?limit=100&index="+raw.length);raw.push(...(d.data||[]));more=!!d.next;if(!d.data?.length)break;}
  const tracks:AlbumTrack[]=raw.map((t:Raw,i)=>({id:String(t.id),disc:t.disk_number||1,number:String(t.track_position||i+1),title:t.title,artist:t.artist?.name||doc.artist?.name||"",featuring:featuring(t.title),durationMs:Number.isFinite(t.duration)?t.duration*1000:null}));
  return {release:dzCard(doc,doc.artist?.name||""),edition:doc.title,editionDate:doc.release_date||"",tracks,totalTracks:doc.nb_tracks||tracks.length,complete:!more&&tracks.length===(doc.nb_tracks||tracks.length),note:"Track list and release date for this Deezer edition. Featuring is shown only when explicit in the title; a dash means not supplied, not necessarily no guest."};
 }
 throw new StationError("Invalid album link.",400);
}
