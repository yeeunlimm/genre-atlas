import collection from "./album-collection.json";
import {deezer} from "./deezer-catalog";
import {albumDetail,type ReleaseDetail} from "./releases";
import {StationError} from "./live-station";
import {wikiAlbumDetail} from "./wiki-album";
import {musicRequest} from "./music-request";
const cache=new Map<string,{until:number;detail:ReleaseDetail}>();

type Candidate={id?:number;title?:string;artist?:{name?:string}};
const key=(value:string)=>value.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
const artistKey=(value:string)=>({ye:"kanyewest",machinegunkelly:"mgk"}[key(value)]||key(value));
const editionKey=(value:string)=>key(value.replace(/\([^)]*(?:deluxe|expanded|remaster|anniversary|bonus|edition|explicit|clean)[^)]*\)|\[[^\]]*(?:deluxe|expanded|remaster|anniversary|bonus|edition|explicit|clean)[^\]]*\]/gi,""));

// Resolve both credited artist and title. A cover's Apple URL is an identity key,
// not a URL to fetch, and never becomes an arbitrary server-side request.
export function collectionMatchScore(album:{artist:string;title:string},candidate:Candidate):number{
 if(!Number.isSafeInteger(candidate.id)||candidate.id!<=0||!candidate.title||!candidate.artist?.name)return 0;
 const artists=album.artist.includes(" & ")?album.artist.split(/,\s*|\s+&\s+/):[album.artist];
 if(!artists.some(name=>artistKey(name)===artistKey(candidate.artist!.name!)))return 0;
 if(key(candidate.title)===key(album.title))return 2;
 return editionKey(candidate.title)===editionKey(album.title)?1:0;
}

export async function collectionAlbumDetail(source:string):Promise<ReleaseDetail>{
 const album=[...collection.albums,...collection.rightColumn].find(a=>a.sourceUrl===source);
 if(!album)throw new StationError("Unknown collection album.",400);
 const cached=cache.get(source);if(cached&&cached.until>Date.now())return cached.detail;
 let result:ReleaseDetail|undefined;
 try{result=await musicRequest(()=>deezerCollectionDetail(album),10000);}catch{}
 if(!result)result=await wikiAlbumDetail(album)||undefined;
 if(!result)throw new StationError("The album and track list could not be verified in Deezer, Wikipedia or NamuWiki. Retry or open the original source below.",404);
 if(cache.size>=40)cache.delete(cache.keys().next().value!);
 cache.set(source,{until:Date.now()+600000,detail:result});return result;
}

async function deezerCollectionDetail(album:{artist:string;title:string}):Promise<ReleaseDetail>{
 const leadArtist=album.artist.includes(" & ")?album.artist.split(/,\s*|\s+&\s+/)[0]:album.artist;
 const search=async(q:string)=>{
  const response=await deezer("search/album?"+new URLSearchParams({q,limit:"50"}));
  return (Array.isArray(response.data)?response.data:[]) as Candidate[];
 };
 let rows=await search(leadArtist+" "+album.title);
 if(!rows.some(row=>collectionMatchScore(album,row)))rows=await search(album.title);
 // Album search can omit a release that still exists in the artist catalog.
 if(!rows.some(row=>collectionMatchScore(album,row))){
  const artists=await deezer("search/artist?"+new URLSearchParams({q:leadArtist,limit:"25"}));
  const exact=(artists.data||[]).filter((row:{id:number;name:string})=>Number.isSafeInteger(row.id)&&row.id>0&&typeof row.name==="string"&&artistKey(row.name)===artistKey(leadArtist)).slice(0,3);
  const pages=await Promise.all(exact.map(async(artist:{id:number;name:string})=>{
   const page=await deezer("artist/"+artist.id+"/albums?limit=100&index=0");
   return (page.data||[]).map((row:Candidate)=>({...row,artist:row.artist||{name:artist.name}}));
  }));
  rows=pages.flat();
 }
 const matches=rows.map(row=>({row,score:collectionMatchScore(album,row)})).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.row.id!-b.row.id!);
 if(!matches[0])throw new StationError("This album could not be verified in Deezer right now. Retry or open its original source below.",404);
 const detail=await albumDetail("deezer",String(matches[0].row.id));
 // Recheck the full release as well as the search result, before rendering tracks.
 if(!collectionMatchScore(album,{id:Number(detail.release.id),title:detail.release.title,artist:{name:detail.release.artist}}))throw new StationError("The catalog returned a different release. No substitute album was opened.",502);
 return detail;
}
