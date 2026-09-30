// Public metadata only. No audio extraction, inferred credits, or BPM scoring.
import {stationCatalog, type StationTrack, type Credit, type CreditRole} from "./station-catalog";
import {connection, recommend, searchTracks, type Recommendation} from "./discovery-station";
import {fetchAppleCredits} from "./apple-credits";

type Raw = Record<string, any>;
export class StationError extends Error { constructor(message: string, public status=502) {super(message);} }
export const normalize = (s:string) => s.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
export const albumKey = (s:string) => normalize(s.replace(/\s+-\s+(?:Single|EP)$/i,"").replace(/\([^)]*(?:deluxe|expanded|remaster|anniversary|bonus|edition)[^)]*\)|\[[^\]]*(?:deluxe|expanded|remaster|anniversary|bonus|edition)[^\]]*\]/gi,"").replace(/\s*[-–:]\s*(?:deluxe|expanded|remaster|anniversary|bonus|edition).*$/i,""));
const withoutFeatures=(s:string)=>s.replace(/[\[(](?:feat\.?|ft\.?|featuring)\s+[^\])]*[\])]/gi,"").trim();
const primaryArtist=(s:string)=>s.split(/\s+(?:&|feat\.?|ft\.?|featuring|with)\s+/i)[0];
const artistKey=(s:string)=>normalize(s.replace(/\b(?:feat\.?|ft\.?|featuring|with|and)\b|[&,]/gi," "));
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const roleMap:Record<string,CreditRole>={producer:"producer",mix:"mixing",mastering:"mastering",arranger:"arranger",composer:"songwriter",writer:"songwriter"};
const weight:Record<CreditRole,number>={producer:5,mixing:4,arranger:3,mastering:2,songwriter:1};
const checkedAt=()=>new Date().toISOString().slice(0,10);
const source=(entity:string,id:string)=>({label:"MusicBrainz · "+entity+" credits",url:"https://musicbrainz.org/"+entity+"/"+id});
const memory=new Map<string,{until:number,value:any}>();
const pending=new Map<string,Promise<any>>();
let mbTail:Promise<unknown>=Promise.resolve(),mbLast=0,mbWaiting=0;

async function cached<T>(key:string,ttl:number,fn:()=>Promise<T>):Promise<T>{
  const hit=memory.get(key);if(hit&&hit.until>Date.now())return hit.value;
  if(pending.has(key))return pending.get(key)!;
  const job=fn().then(value=>{if(!(value as {partial?:boolean})?.partial){if(memory.size>=250)memory.delete(memory.keys().next().value!);memory.set(key,{until:Date.now()+ttl,value});}return value;}).finally(()=>pending.delete(key));
  pending.set(key,job);return job;
}
async function json(url:string,mb=false):Promise<Raw>{
  const run=async()=>{
    const r=await fetch(url,{headers:mb?{"User-Agent":"GenreAtlas/1.0 (https://genre-atlas-0918.sooyeon-jun-0389.chatgpt.site)",Accept:"application/json"}:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
    if(r.status===429||r.status===503)throw new StationError("The music data service is busy. Please retry in a moment.",503);
    if(!r.ok)throw new StationError("The music data service could not complete this request. Please retry.");
    return await r.json() as Raw;
  };
  if(!mb)return run();
  if(mbWaiting>=16)throw new StationError("Credit lookup is busy. Please retry shortly.",503);
  mbWaiting++;
  const job=mbTail.catch(()=>{}).then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,mbLast+1100-Date.now())));mbLast=Date.now();return run();});
  mbTail=job;return job.finally(()=>{mbWaiting--;});
}
const mb=(path:string)=>cached("mb:"+path,3600_000,()=>json("https://musicbrainz.org/ws/2/"+path+(path.includes("?")?"&":"?")+"fmt=json",true));
const apple=(path:string)=>cached("apple:"+path,900_000,()=>json("https://itunes.apple.com/"+path));
const quote=(s:string)=>'"'+s.replace(/["\\]/g," ")+'"';
const artistNames=(r:Raw)=>(r["artist-credit"]||[]).map((a:Raw)=>(a.name||a.artist?.name||"")+ (a.joinphrase||"")).join("");
const groups=(r:Raw)=>[...new Set<string>((r.releases||[]).map((x:Raw)=>x["release-group"]?.id).filter(Boolean))];
const officialReleases=(r:Raw)=>(r.releases||[]).filter((x:Raw)=>(!x.status||x.status==="Official")&&!x["release-group"]?.["secondary-types"]?.some((v:string)=>["Live","Compilation","DJ-mix"].includes(v)));
const releaseFor=(r:Raw,album?:string)=>officialReleases(r).find((x:Raw)=>album&&albumKey(x.title)===albumKey(album))||officialReleases(r).sort((a:Raw,b:Raw)=>(a.date||"9999").localeCompare(b.date||"9999"))[0];
export function parseCredits(relations:Raw[],entity:"recording"|"release",id:string):Credit[]{
  return (relations||[]).filter(r=>r.artist&&roleMap[r.type]&&!(r.attributes||[]).includes("additional")).map(r=>({person:"mb:"+r.artist.id,name:r.artist.name,role:roleMap[r.type],source:source(entity,id),scope:entity==="release"?"release":"track"}));
}
export function parseApple(row:Raw):StationTrack|null{
  if(row.kind!=="song"||!Number.isSafeInteger(row.trackId)||!row.artistName||!row.trackName||!row.collectionName)return null;
  const s={label:"Apple · catalog metadata",url:"https://music.apple.com/us/album/"+row.collectionId+"?i="+row.trackId};
  return {id:"itunes:"+row.trackId,recordingId:"itunes:"+row.trackId,title:row.trackName,artist:row.artistName,artistId:"itunes:"+row.artistId,album:row.collectionName,albumFamily:normalize(row.artistName)+":"+albumKey(row.collectionName),durationMs:row.trackTimeMillis,explicitness:row.trackExplicitness,source:s,checkedAt:checkedAt(),genres:row.primaryGenreName?[{name:row.primaryGenreName,scope:"track",source:s}]:[],credits:[],catalogKind:"apple",artworkUrl:appleArtworkUrl(row.artworkUrl100)};
}
export function appleArtworkUrl(value:unknown):string|undefined{
  if(typeof value!=="string")return;
  try{const u=new URL(value);if(u.protocol!=="https:"||!u.hostname.endsWith(".mzstatic.com"))return;
    return u.href.replace(/\/\d+x\d+bb\./,"/600x600bb.");
  }catch{return;}
}
export function chooseAlbumArtwork(rows:Raw[],artist:string,album:string):string|undefined{
  // Never show the first search hit: the album AND its artist must match.
  const matches=rows.filter(r=>r.collectionType==="Album"&&typeof r.collectionName==="string"&&typeof r.artistName==="string"&&albumKey(r.collectionName)===albumKey(album)&&(artistKey(r.artistName)===artistKey(artist)||normalize(r.artistName)===normalize(primaryArtist(artist))));
  matches.sort((a,b)=>Number(normalize(b.collectionName)===normalize(album))-Number(normalize(a.collectionName)===normalize(album)));
  return matches.map(r=>appleArtworkUrl(r.artworkUrl100)).find(Boolean);
}
export async function albumArtwork(artist:string,album:string){
  if(!artist.trim()||!album.trim()||artist.length>300||album.length>400)throw new StationError("Invalid album artwork request.",400);
  const data=await apple("search?"+new URLSearchParams({term:primaryArtist(artist)+" "+album,entity:"album",media:"music",limit:"30",country:"US",lang:"en_us"}));
  return {url:chooseAlbumArtwork(data.results||[],artist,album)||null};
}
function parseRecording(r:Raw):StationTrack|null{
  const release=releaseFor(r),artist=artistNames(r);if(!r.id||!r.title||!artist||!release)return null;
  const s=source("recording",r.id);
  return {id:"mb:"+r.id,recordingId:"mb:"+r.id,title:r.title,artist,artistId:r["artist-credit"]?.[0]?.artist?.id||normalize(artist),album:release.title,albumFamily:normalize(artist)+":"+albumKey(release.title),albumGroups:groups(r),source:s,checkedAt:checkedAt(),durationMs:r.length,explicitness:/\bexplicit\b/i.test(r.disambiguation||"")?"explicit":/\bclean\b/i.test(r.disambiguation||"")?"cleaned":undefined,genres:[],credits:parseCredits(r.relations||[],"recording",r.id),catalogKind:"musicbrainz",artworkReleaseId:uuid.test(release.id||"")?release.id:undefined};
}
export function sameSong(a:StationTrack,b:StationTrack){return a.recordingId===b.recordingId||(artistKey(a.artist)===artistKey(b.artist)&&normalize(withoutFeatures(a.title))===normalize(withoutFeatures(b.title)));}
export function sameAlbum(a:StationTrack,b:StationTrack){return a.albumFamily===b.albumFamily||!!a.albumGroups?.some(g=>b.albumGroups?.includes(g))||(normalize(a.artist)===normalize(b.artist)&&albumKey(a.album)===albumKey(b.album));}
function unique(tracks:StationTrack[]){return tracks.filter((t,i)=>!tracks.slice(0,i).some(x=>x.id===t.id||(sameSong(x,t)&&sameAlbum(x,t)&&x.explicitness===t.explicitness)));}
async function searchMusicBrainz(q:string){
  const query=q.trim().split(/\s+/).slice(0,12).map(w=>"(recording:"+quote(w)+" OR artist:"+quote(w)+" OR release:"+quote(w)+")").join(" AND ");
  const d=await mb("recording/?query="+encodeURIComponent(query)+"&limit=40");
  return unique((d.recordings||[]).map(parseRecording).filter(Boolean));
}
export async function liveSearch(q:string,limit=40,catalog="apple"){
  if(q.trim().length<2||q.length>120)throw new StationError("Enter 2–120 characters to search for a song or artist.",400);
  const local=searchTracks(q,stationCatalog);
  if(catalog==="musicbrainz")return {tracks:await searchMusicBrainz(q),provider:"MusicBrainz",canExpand:false,warning:"Alternate recordings and editions from MusicBrainz. Choose the version you want to explore."};
  try{
    const data=await apple("search?"+new URLSearchParams({term:q,media:"music",entity:"song",limit:String(limit),country:"US",lang:"en_us"}));
    const tracks=unique([...local,...(data.results||[]).map(parseApple).filter(Boolean)]);
    // Artist+song queries should not put tribute covers ahead of the named artist.
    const terms=q.split(/\s+/).map(normalize).filter(Boolean);
    const relevance=(t:StationTrack)=>terms.filter(term=>normalize(t.artist+" "+t.title).includes(term)).length*10+(normalize(primaryArtist(t.artist)).length>2&&normalize(q).includes(normalize(primaryArtist(t.artist)))?5:0);
    tracks.sort((a,b)=>relevance(b)-relevance(a)||Number(a.explicitness==="cleaned")-Number(b.explicitness==="cleaned"));
    return {tracks,provider:"Apple catalog",canExpand:data.resultCount>=limit&&limit<200,warning:""};
  }catch{
    // A second public catalog keeps search usable when Apple's service is unavailable.
    try{
      return {tracks:unique([...local,...await searchMusicBrainz(q)]),provider:"MusicBrainz",canExpand:false,warning:"Apple search is unavailable. Showing MusicBrainz results; release coverage may differ."};
    }catch{throw new StationError("Live catalog search is temporarily unavailable. Please retry. Starting picks remain available.",503);}
  }
}
const record=(id:string)=>mb("recording/"+id+"?inc=artist-rels+artist-credits+releases+release-groups");
async function loadTrack(id:string):Promise<StationTrack>{
  const local=stationCatalog.find(t=>t.id===id);if(local)return local;
  if(/^itunes:\d{1,16}$/.test(id)){
    const data=await apple("lookup?id="+id.slice(7)+"&entity=song&country=US");
    const track=(data.results||[]).map(parseApple).find((t:StationTrack|null)=>t?.id===id);if(track)return track;
  }else if(id.startsWith("mb:")&&uuid.test(id.slice(3))){const t=parseRecording(await record(id.slice(3)));if(t)return t;}
  throw new StationError("This song could not be found. Search for it again.",404);
}
export function chooseRecording(rows:Raw[],track:StationTrack):Raw|undefined{
  const valid=rows.filter(r=>normalize(withoutFeatures(r.title))===normalize(withoutFeatures(track.title))&&(artistKey(artistNames(r))===artistKey(track.artist)||normalize(r["artist-credit"]?.[0]?.name||r["artist-credit"]?.[0]?.artist?.name||"")===normalize(primaryArtist(track.artist)))&&!r.video);
  // Never transfer credits from a remix/live take or a different album just because its title matches.
  return valid.filter(r=>!(track.explicitness==="explicit"&&/\bclean\b/i.test(r.disambiguation||""))&&!(track.explicitness==="cleaned"&&/\bexplicit\b/i.test(r.disambiguation||""))&&!(/\b(?:demo|live)\b/i.test(r.disambiguation||"")&&!/\b(?:demo|live)\b/i.test(track.title+" "+track.album))&&officialReleases(r).some((x:Raw)=>albumKey(x.title)===albumKey(track.album))&&(!track.durationMs||!r.length||Math.abs(track.durationMs-r.length)<12000))
    .sort((a,b)=>Math.abs((a.length||track.durationMs||0)-(track.durationMs||0))-Math.abs((b.length||track.durationMs||0)-(track.durationMs||0)))[0];
}
async function resolveRecording(t:StationTrack){
  if(t.recordingId.startsWith("mb:")&&uuid.test(t.recordingId.slice(3)))return record(t.recordingId.slice(3));
  const query="recording:"+quote(withoutFeatures(t.title))+" AND artist:"+quote(primaryArtist(t.artist))+" AND release:"+quote(t.album.replace(/\s+-\s+(?:Single|EP)$/i,""));
  const d=await mb("recording/?query="+encodeURIComponent(query)+"&limit=30");
  let match=chooseRecording(d.recordings||[],t);
  if(!match){
    // Relax the search query only, not recording/edition identity checks.
    const wider=await mb("recording/?query="+encodeURIComponent("recording:"+quote(withoutFeatures(t.title))+" AND artist:"+quote(primaryArtist(t.artist)))+"&limit=50");
    match=chooseRecording(wider.recordings||[],t);
  }
  return match?record(match.id):null;
}
type Target={id:string;kind:"recording"|"release";credit:Credit;score:number};
type Graph={seed:StationTrack;targets:Target[];notes:string[];partial:boolean;status:"connected"|"credits-missing"|"connections-missing"};
export function chooseCreditPerson(rows:Raw[],name:string):Raw|undefined{
  const exact=rows.filter(a=>[a.name,...(a.aliases||[]).map((x:Raw)=>x.name)].some(n=>typeof n==="string"&&normalize(n)===normalize(name)));
  // Never choose the highest fuzzy hit or merge namesakes.
  return exact.length===1?exact[0]:undefined;
}
async function creditPerson(name:string){
  const result=await mb("artist/?query="+encodeURIComponent("artist:"+quote(name)+" OR alias:"+quote(name))+"&limit=100");
  if(result.count>100)return undefined;
  return chooseCreditPerson(result.artists||[],name);
}
async function graph(id:string):Promise<Graph>{
  return cached("graph:"+id,1800_000,async()=>{
    const original=await loadTrack(id),notes:string[]=[];
    let partial=false;
    const [recordingResult,appleResult]=await Promise.allSettled([resolveRecording(original),cached("apple-credits:"+id,3600_000,()=>fetchAppleCredits(original))]);
    const r=recordingResult.status==="fulfilled"?recordingResult.value:null;
    if(recordingResult.status==="rejected"){partial=true;notes.push("MusicBrainz recording lookup was interrupted; other credit sources were still checked.");}
    if(appleResult.status==="rejected"){partial=true;notes.push("Apple song credits could not be read; MusicBrainz credits were still checked. Retry to check Apple again.");}
    const appleCredits=appleResult.status==="fulfilled"?appleResult.value:[];
    let credits=[...original.credits.map(c=>({...c})),...parseCredits(r?.relations||[],"recording",r?.id||"")];
    const release=r?releaseFor(r,original.album):undefined;
    if(release&&albumKey(release.title)===albumKey(original.album)){
      try{const full=await mb("release/"+release.id+"?inc=artist-rels");credits.push(...parseCredits(full.relations,"release",full.id));}
      catch{partial=true;notes.push("Album-edition credits could not be loaded. Track credits are still available.");}
    }
    credits.push(...appleCredits.filter(a=>!credits.some(c=>normalize(c.name)===normalize(a.name)&&c.role===a.role)).map(c=>({...c})));
    const seedGroups=groups({releases:(r?.releases||[]).filter((x:Raw)=>albumKey(x.title)===albumKey(original.album))});
    const seed={...original,recordingId:r?"mb:"+r.id:original.recordingId,albumGroups:seedGroups,credits};
    const roles:CreditRole[]=["producer","mixing","mastering","arranger","songwriter"];
    const people=[...new Set([...roles.map(role=>credits.find(c=>c.role===role)?.person).filter((p):p is string=>!!p),...credits.map(c=>c.person)])];
    const targets:Target[]=[];
    let followed=0;const visited=new Set<string>();
    // Missing/ambiguous first names must not prevent following the remaining people.
    for(const person of people.slice(0,8)){
      if(followed>=3)break;
      const seedRoles=credits.filter(c=>c.person===person);
      if(!seedRoles.length)continue;
      let personId=person.startsWith("mb:")?person.slice(3):undefined;
      try{
        if(!personId){
          const found=await creditPerson(seedRoles[0].name);
          if(!found)continue;
          personId=found.id as string;
          for(const credit of seedRoles)credit.person="mb:"+personId;
        }
        if(visited.has(personId))continue;visited.add(personId);
        const a=await mb("artist/"+personId+"?inc=recording-rels+release-rels");
        let foundTargets=0;
        for(const rel of a.relations||[]){
          const role=roleMap[rel.type],kind=rel.recording?"recording":rel.release?"release":null;
          if(!role||!kind||(rel.attributes||[]).includes("additional"))continue;
          const target=rel[kind];if(target.id===r?.id||target.id===release?.id)continue;
          const credit:Credit={person:"mb:"+personId,name:a.name,role,scope:kind==="release"?"release":"track",source:source(kind,target.id)};
          const score=Math.max(...seedRoles.map(c=>c.role===role?weight[role]:Math.min(weight[c.role],weight[role])*.7));
          targets.push({id:target.id,kind,credit,score});foundTargets++;
        }
        if(foundTargets)followed++;
      }catch{partial=true;notes.push("A credited person's participation records could not be loaded. Retry to include that branch.");}
    }
    if(appleCredits.length)notes.push("Song-level credits read directly from the selected Apple Music song, with participation records from MusicBrainz.");
    if(people.length>3)notes.push("Up to three connected people are explored per station, prioritizing production, mixing and mastering.");
    if(!people.length)notes.push("Neither available source lists usable production or writing credits for this version yet.");
    else if(!targets.length)notes.push("Credits were found, but their other participation records could not be linked confidently. Namesakes were not merged.");
    const ordered=targets.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
    const distinct=ordered.filter((t,i)=>ordered.findIndex(x=>x.id===t.id&&x.kind===t.kind)===i);
    return {seed,targets:distinct,notes:[...new Set(notes)],partial,status:distinct.length?"connected":people.length?"connections-missing":"credits-missing"};
  });
}
export type LiveStationResult={seed:StationTrack;rows:Recommendation[];nextOffset:number|null;scanned:number;totalConnections:number;notes:string[];partial?:boolean;status:Graph["status"]};
export async function liveStation(id:string,offset=0):Promise<LiveStationResult>{
  if(!Number.isInteger(offset)||offset<0||offset>10000)throw new StationError("Invalid station page.",400);
  return cached("station:"+id+":"+offset,900_000,async()=>{
    const g=await graph(id),candidates:StationTrack[]=[],notes=[...g.notes];
    const batch=g.targets.slice(offset,offset+8);
    let partial=g.partial;
    for(const target of batch){
      try{
        if(target.kind==="recording"){
          const r=await record(target.id),t=parseRecording(r);if(t)candidates.push({...t,credits:[...t.credits,target.credit]});
        }else{
          const rel=await mb("release/"+target.id+"?inc=recordings+artist-credits+release-groups");
          if(rel.status&&rel.status!=="Official")continue;
          const group=rel["release-group"]?.id;
          if(group&&g.seed.albumGroups?.includes(group))continue;
          for(const medium of rel.media||[])for(const item of medium.tracks||[]){
            const r={...item.recording,"artist-credit":item["artist-credit"]||item.recording?.["artist-credit"]||rel["artist-credit"],releases:[rel]};
            const t=parseRecording(r);if(t)candidates.push({...t,credits:[target.credit]});
          }
        }
      }catch{partial=true;}
    }
    if(partial)notes.push("Some credit records could not be loaded. You can retry this batch.");
    const locals=offset===0?recommend(id,stationCatalog):[];
    const live=unique(candidates).filter(t=>!sameSong(g.seed,t)&&!sameAlbum(g.seed,t)).map(track=>({track,...connection(g.seed,track),feedbackBoost:false})).filter(x=>x.reasons.some(r=>r.kind==="credit"));
    const rows=[...locals,...live].filter((r,i,a)=>!a.slice(0,i).some(x=>sameSong(x.track,r.track))).sort((a,b)=>b.score-a.score);
    // Spread out artists without discarding the rest of the source-backed queue.
    const diverse:Recommendation[]=[];while(rows.length){const i=rows.findIndex(r=>normalize(r.track.artist)!==normalize(diverse.at(-1)?.track.artist||g.seed.artist));diverse.push(rows.splice(i<0?0:i,1)[0]);}
    return {seed:g.seed,rows:diverse,nextOffset:offset+batch.length<g.targets.length?offset+batch.length:null,scanned:offset+batch.length,totalConnections:g.targets.length,notes,partial,status:g.status};
  });
}
