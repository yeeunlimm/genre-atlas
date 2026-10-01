type Raw=Record<string,any>;
export type AlbumArtwork={title:string;imageUrl:string};
export type MusicArtist={id:string;name:string;audience:number|null;audienceLabel:string;subscribers?:number|null;url:string;checkedAt:string;albumArtwork?:AlbumArtwork;albumArtworks?:AlbumArtwork[]};
const context={client:{clientName:"WEB_REMIX",clientVersion:"1.20260916.03.00",hl:"en",gl:"KR"}};
const cache=new Map<string,{expires:number;data:unknown}>();
const jobs=new Map<string,Promise<unknown>>();
export class MusicError extends Error{constructor(message:string,public status=502){super(message);}}
export function parseCount(value:string):number|null{
 const m=value.trim().replaceAll(",","").match(/^(\d+(?:\.\d+)?)\s*([KMB만억천]?)(?:\s|$)/i);
 if(!m)return null;
 const unit:Record<string,number>={K:1e3,M:1e6,B:1e9,"천":1e3,"만":1e4,"억":1e8};
 return Math.round(Number(m[1])*(unit[m[2].toUpperCase()]||1));
}
const text=(node:Raw|undefined):string=>node?.runs?.map((r:Raw)=>r.text||"").join("")||node?.simpleText||"";
function find(node:unknown,key:string,out:Raw[]=[]):Raw[]{
 if(!node||typeof node!=="object")return out;
 const obj=node as Raw;if(obj[key])out.push(obj[key]);
 for(const value of Object.values(obj))find(value,key,out);return out;
}
function artistRow(row:Raw):MusicArtist|null{
 const endpoint=row.navigationEndpoint?.browseEndpoint||row.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
 if(endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType!=="MUSIC_PAGE_TYPE_ARTIST"||!/^UC[A-Za-z0-9_-]{22}$/.test(endpoint.browseId||""))return null;
 const name=text(row.title)||text(row.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text);
 const subtitle=text(row.subtitle)||text(row.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text);
 const audienceLabel=subtitle.split(" • ").find((s:string)=>/monthly audience|monthly listeners/.test(s))||"";
 if(!name)return null;
 return {id:endpoint.browseId,name,audience:audienceLabel?parseCount(audienceLabel):null,audienceLabel,url:"https://music.youtube.com/channel/"+endpoint.browseId,checkedAt:new Date().toISOString()};
}
export function parseSearch(data:Raw){
 const artists=find(data,"musicResponsiveListItemRenderer").map(artistRow).filter((x):x is MusicArtist=>!!x);
 return {artists:[...new Map(artists.map(a=>[a.id,a])).values()].slice(0,12)};
}
export function parseArtist(data:Raw,id:string){
 const h=data.header?.musicImmersiveHeaderRenderer||data.header?.musicVisualHeaderRenderer||data.header?.musicHeaderRenderer;
 if(!h||!text(h.title))throw new MusicError("아티스트 페이지를 읽지 못했습니다. 다른 검색 결과를 선택해 주세요.");
 const name=text(h.title),audienceLabel=text(h.monthlyListenerCount);
 const artist:MusicArtist={id,name,audience:audienceLabel?parseCount(audienceLabel):null,audienceLabel,subscribers:parseCount(text(h.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText)),url:"https://music.youtube.com/channel/"+id,checkedAt:new Date().toISOString()};
 const related:MusicArtist[]=[];
 for(const shelf of find(data,"musicCarouselShelfRenderer")){
  const title=text(shelf.header?.musicCarouselShelfBasicHeaderRenderer?.title);
  if(/^Albums$/i.test(title)){
   const albums=artist.albumArtworks||(artist.albumArtworks=[]);
   for(const item of shelf.contents||[]){
    if(albums.length>=4)break;
    const row=item.musicTwoRowItemRenderer,endpoint=row?.navigationEndpoint?.browseEndpoint;
    if(endpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType!=="MUSIC_PAGE_TYPE_ALBUM")continue;
    const albumTitle=text(row.title);
    const thumbnails=find(row.thumbnailRenderer,"musicThumbnailRenderer").flatMap(x=>x.thumbnail?.thumbnails||[]);
    const image=thumbnails.filter(x=>{
     try{const u=new URL(x.url);return u.protocol==="https:"&&!u.username&&!u.password&&/^(?:[a-z0-9-]+\.)*(?:googleusercontent\.com|ytimg\.com)$/.test(u.hostname);}catch{return false;}
    }).sort((a,b)=>(b.width||0)-(a.width||0))[0];
    if(albumTitle&&image&&!albums.some(a=>a.title.toLowerCase()===albumTitle.toLowerCase())){
     albums.push({title:albumTitle,imageUrl:image.url});
     artist.albumArtwork??=albums[0];
    }
    if(albums.length>=4)break;
   }
  }
  if(!/Fans might also like|Similar artists|Related artists/i.test(title))continue;
  for(const row of shelf.contents||[]){const a=artistRow(row.musicTwoRowItemRenderer||{});if(a&&a.id!==id&&!related.some(x=>x.id===a.id))related.push(a);}
 }
 return {artist,related:related.slice(0,30)};
}
async function request(endpoint:"search"|"browse",body:Raw){
 const r=await fetch("https://music.youtube.com/youtubei/v1/"+endpoint+"?prettyPrint=false",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context,...body}),signal:AbortSignal.timeout(15000)});
 if(r.status===429)throw new MusicError("YouTube Music 요청이 잠시 제한됐습니다. 잠시 후 다시 검색해 주세요.",429);
 if(!r.ok)throw new MusicError("YouTube Music에 연결하지 못했습니다. 원문에서 확인하거나 잠시 후 다시 검색해 주세요.");
 const data=await r.json() as Raw;if(data.error)throw new MusicError("YouTube Music 응답 형식이 바뀌었거나 접근이 제한됐습니다.");
 return data;
}
export async function music(kind:string,value:string){
 if(!value.trim()||value.length>100)throw new MusicError("가수 이름은 1~100자로 입력해 주세요.",400);
 if(kind==="artist"&&!/^UC[A-Za-z0-9_-]{22}$/.test(value))throw new MusicError("올바른 아티스트 ID가 아닙니다.",400);
 const key=kind+":"+value,c=cache.get(key);if(c&&c.expires>Date.now())return c.data;if(jobs.has(key))return jobs.get(key);
 const promise=(async()=>{try{
  const data=kind==="search"?parseSearch(await request("search",{query:value.trim(),params:"EgWKAQIgAWoKEAkQBRAKEAMQBA%3D%3D"})):parseArtist(await request("browse",{browseId:value}),value);
  if(cache.size>=100)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+10*60*1000,data});return data;
 }catch(e){if(e instanceof MusicError)throw e;throw new MusicError("응답 시간이 길어지고 있습니다. 잠시 후 다시 시도해 주세요.");}finally{jobs.delete(key);}})();jobs.set(key,promise);return promise;
}

