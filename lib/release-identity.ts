type Raw=Record<string,any>;
export type AlbumArtistChoice={id:string;name:string;detail:string;image?:string;albums?:string[]};
export type AlbumIdentityHints={albums?:string[];choose?:boolean};
const nameKey=(s:string)=>s.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
const albumKey=(s:string)=>nameKey(s.replace(/\s*[-–]\s*(?:single|ep)$/i,"").replace(/\([^)]*(?:deluxe|expanded|remaster|anniversary|bonus|edition)[^)]*\)|\[[^\]]*(?:deluxe|expanded|remaster|anniversary|bonus|edition)[^\]]*\]/gi,""));
const count=(n:unknown)=>Number.isSafeInteger(n)&&Number(n)>=0?Number(n):null;
function imageUrl(value:unknown){try{const u=new URL(String(value));return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.endsWith(".dzcdn.net")?u.href:undefined;}catch{return undefined;}}

// A bounded comparison, not a popularity heuristic. Never turn failed lookups
// into empty discographies, or identify an artist from the first search result.
export async function resolveAlbumArtist(name:string,rows:Raw[],hints:AlbumIdentityHints,getAlbums:(id:string)=>Promise<Raw>){
 const exact=[...new Map(rows.filter(a=>Number.isSafeInteger(a.id)&&a.id>0&&typeof a.name==="string"&&nameKey(a.name)===nameKey(name)).map(a=>[a.id,a])).values()];
 const choices:AlbumArtistChoice[]=exact.map(a=>({id:String(a.id),name:a.name,image:imageUrl(a.picture_medium||a.picture),detail:[count(a.nb_fan)!==null?Number(a.nb_fan).toLocaleString("en-US")+" Deezer fans":"Fan count unavailable",count(a.nb_album)!==null?Number(a.nb_album)+" releases":"Release count unavailable"].join(" · ")}));
 if(choices.length===1&&!hints.choose)return {choices:[],id:choices[0].id,identity:"unique-name" as const};
 if(!choices.length||choices.length>5)return {choices};
 const pages=await Promise.all(choices.map(async a=>{try{const page=await getAlbums(a.id);return Array.isArray(page.data)?page:null;}catch{return null;}}));
 const keys=new Set((hints.albums||[]).slice(0,4).filter(a=>typeof a==="string"&&a.length<=200).map(albumKey).filter(Boolean));
 const scores=pages.map((page,i)=>{
  const titles=page?.data.filter((r:Raw)=>typeof r.title==="string").map((r:Raw)=>r.title) as string[]|undefined;
  choices[i].albums=titles?.slice(0,4);
  if(!page)choices[i].detail+=" · Album lookup unavailable";
  return new Set((titles||[]).map(albumKey).filter(k=>keys.has(k))).size;
 });
 const matches=scores.map((score,index)=>({score,index})).filter(x=>x.score>0);
 if(!hints.choose&&pages.every(Boolean)&&matches.length===1){
  const match=matches[0];
  const otherPagesEmpty=pages.every((p,i)=>i===match.index||(p!.total===0&&p!.data.length===0&&!p!.next));
  if(match.score>=2||otherPagesEmpty)return {choices:[],id:choices[match.index].id,page:pages[match.index]!,identity:"album-match" as const};
 }
 return {choices};
}
