import {load} from "cheerio/slim";
import type {AlbumTrack,ReleaseDetail,ReleaseKind} from "./releases";
import {musicJson,musicRequest,musicSignal} from "./music-request";
import {fetchNamuDocument,parseDocument,validTitle} from "./namu";

type Album={title:string;artist:string;imageUrl:string};
const text=(s:string)=>s.replace(/\s+/g," ").trim();
const key=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]/gu,"");
const pageKey=(s:string)=>key(s.replace(/\s*\([^)]*\)\s*$/, ""));
const artists=(s:string)=>s.includes(" & ")?s.split(/,\s*|\s+&\s+/):[s];
const duration=(s:string)=>{const m=text(s).match(/^(\d{1,3}):([0-5]\d)$/);return m?(Number(m[1])*60+Number(m[2]))*1000:null;};
type ParsedTable={tracks:AlbumTrack[];caption:string};

function readTrackTable($:ReturnType<typeof load>,table:ReturnType<ReturnType<typeof load>>,artist:string):ParsedTable|null{
 const rows=table.find("tr").filter((_,row)=>$(row).closest("table")[0]===table[0]).toArray();
 let titleIndex=-1,numberIndex=-1,timeIndex=-1;const tracks:AlbumTrack[]=[];
 for(const row of rows){
  const cells=$(row).children("th,td").toArray().map(c=>text($(c).text()));
  if(titleIndex<0){
   titleIndex=cells.findIndex(c=>/^(Title|Track title|곡명|제목|곡)$/i.test(c));
   numberIndex=cells.findIndex(c=>/^(No\.?|#|Track|트랙|번호|트랙 번호)$/i.test(c));
   timeIndex=cells.findIndex(c=>/^(Length|Time|Duration|길이|재생 시간|재생시간|러닝타임)$/i.test(c));
   if(titleIndex>=0&&numberIndex<0)return null;
   continue;
  }
  const number=cells[numberIndex]?.match(/^(\d{1,3})\.?$/)?.[1];
  if(!number)continue;
  const title=cells[titleIndex]?.replace(/^["“](.*?)["”](?=\s|$)/,"$1").trim();
  if(!title||title.length>400||tracks.some(t=>t.number===number))return null;
  tracks.push({id:"wiki-track-"+number,disc:1,number,title,artist,featuring:null,durationMs:timeIndex<0?null:duration(cells[timeIndex]||"")});
 }
 // Reject missing rows, bonus-only fragments and tables which are not a track list.
 if(!tracks.length||tracks.some((t,i)=>Number(t.number)!==i+1))return null;
 return {tracks,caption:text(table.find("caption").first().text())};
}

function detail(album:Album,provider:"wikipedia"|"namuwiki",title:string,url:string,date:string,kind:ReleaseKind,parsed:ParsedTable):ReleaseDetail{
 return {release:{id:provider+":"+title,provider,title:album.title,artist:album.artist,date,types:[kind],artwork:album.imageUrl,url},edition:parsed.caption||"First complete track-list table",editionDate:"",tracks:parsed.tracks,totalTracks:parsed.tracks.length,complete:true,note:"Track list from "+(provider==="wikipedia"?"Wikipedia":"NamuWiki")+". Other editions and separate bonus-track tables are not combined. Missing times are shown as —."};
}

export function parseWikipediaAlbum(html:string,page:string,revision:number,album:Album):ReleaseDetail|null{
 const $=load(html);$("script,style,sup,.mw-editsection").remove();
 const box=$(".infobox").filter((_,e)=>key($(e).find(".summary").first().text())===key(album.title)).first();
 if(!box.length)return null;
 const names=box.find(".contributor").first();
 const credited=[text(names.text()),...names.find("a").map((_,a)=>text($(a).text())).get()];
 if(!artists(album.artist).every(name=>credited.some(c=>key(c)===key(name))))return null;
 const released=box.find("tr").filter((_,e)=>text($(e).children("th").first().text())==="Released").first().children("td");
 const date=text(released.find(".bday").first().text())||text(released.text());
 const description=box.find(".description").first().text();
 const kind:ReleaseKind=/mixtape/i.test(description)?"Mixtape":/compilation/i.test(description)?"Compilation":/\bEP\b|extended play/i.test(description)?"EP":/single/i.test(description)?"Single":"Album";
 for(const el of $("table.tracklist").toArray()){
  const parsed=readTrackTable($,$(el),album.artist);
  if(!parsed||/bonus|deluxe|japan|expanded/i.test(parsed.caption))continue;
  const url=Number.isSafeInteger(revision)&&revision>0?"https://en.wikipedia.org/w/index.php?oldid="+revision:"https://en.wikipedia.org/wiki/"+encodeURIComponent(page.replaceAll(" ","_"));
  const result=detail(album,"wikipedia",page,url,date,kind,parsed);
  if(/disc\s*(?:\d|one|two)|CD\s*\d/i.test(parsed.caption)){
   result.complete=false;
   result.note="Only the disc listed above is shown. Other discs are referenced separately in the source and have not been verified here. Open Wikipedia for the complete edition.";
  }
  return result;
 }
 return null;
}

const wiki=(params:Record<string,string>)=>musicJson("https://en.wikipedia.org/w/api.php?"+new URLSearchParams({...params,format:"json"}),"Wikipedia","album",{headers:{"User-Agent":"GenreAtlas/1.0 (https://genre-atlas-0918.sooyeon-jun-0389.chatgpt.site)"}},4000);
async function wikipediaAlbum(album:Album):Promise<ReleaseDetail|null>{
 const title=album.title.replace(/[‘’]/g,"'").replace(/[“”]/g,'"');
 try{const direct=await wiki({action:"parse",page:title,prop:"text|revid",redirects:"1"});const parsed=parseWikipediaAlbum(direct.parse?.text?.["*"]||"",direct.parse?.title||title,direct.parse?.revid,album);if(parsed)return parsed;}catch{}
 const result=await wiki({action:"query",list:"search",srsearch:'"'+title.replace(/"/g,"")+'" '+album.artist+" album",srlimit:"6"});
 const pages=(result.query?.search||[]).filter((p:{title:string})=>pageKey(p.title)===key(album.title)).slice(0,3);
 const parsed=await Promise.all(pages.map(async(p:{title:string})=>{
  try{const data=await wiki({action:"parse",page:p.title,prop:"text|revid",redirects:"1"});return parseWikipediaAlbum(data.parse?.text?.["*"]||"",data.parse?.title||p.title,data.parse?.revid,album);}catch{return null;}
 }));
 return parsed.find(Boolean)||null;
}

export function parseNamuAlbum(html:string,requested:string,album:Album,artistAliases:string[]=[]):ReleaseDetail|null{
 const $=load(html);$("script,style,iframe,sup,.wiki-fn-content,.wiki-fn").remove();
 const title=text($("title").text().replace(/\s*-\s*나무위키.*$/, ""))||requested;
 if(pageKey(title)!==key(album.title))return null;
 // Verify a structured artist credit, not a name mentioned somewhere in prose.
 const artistRows=$("tr").filter((_,r)=>/^(아티스트|가수|음악가|Artist)$/i.test(text($(r).children("th,td").first().text())));
 const credited=artistRows.map((_,r)=>text($(r).children("th,td").last().text())).get();
 const aliasMatch=artistAliases.some(a=>credited.some(c=>key(c)===key(a)));
 if(!aliasMatch&&!artists(album.artist).every(a=>credited.some(c=>key(c)===key(a))))return null;
 const dateRow=$("tr").filter((_,r)=>/^(발매일|발매|Released)$/i.test(text($(r).children("th,td").first().text()))).first();
 const date=text(dateRow.children("th,td").last().text());
 for(const el of $("table").toArray()){
  const parsed=readTrackTable($,$(el),album.artist);if(!parsed)continue;
  return detail(album,"namuwiki",title,"https://namu.wiki/w/"+encodeURIComponent(title),date,"Other",parsed);
 }
 return null;
}

async function namuAlbum(album:Album):Promise<ReleaseDetail|null>{
 const lead=artists(album.artist)[0],aliases:string[]=[];
 // A Korean artist credit is accepted only when that artist page confirms its English name.
 try{const html=await fetchNamuDocument(validTitle(lead),false,musicSignal(2200));const artist=parseDocument(html,lead,"artist");if("englishName" in artist&&key(String(artist.englishName))===key(lead))aliases.push(artist.title);}catch{}
 const titles=[album.title,album.title+"("+lead+")"];
 try{const html=await fetchNamuDocument(validTitle(album.title),true,musicSignal(2500));const $=load(html);
  $("a[href^='/w/']").each((_,e)=>{try{const title=decodeURIComponent(($(e).attr("href")||"").slice(3).split(/[?#]/)[0]);if(pageKey(title)===key(album.title)&&!titles.includes(title))titles.push(title);}catch{}});
 }catch{}
 for(const title of titles.slice(0,3)){
  try{const html=await fetchNamuDocument(validTitle(title),false,musicSignal(2500));const parsed=parseNamuAlbum(html,title,album,aliases);if(parsed)return parsed;}catch{}
 }
 return null;
}

export async function wikiAlbumDetail(album:Album):Promise<ReleaseDetail|null>{
 try{const result=await musicRequest(()=>wikipediaAlbum(album),9000);if(result)return result;}catch{}
 try{return await musicRequest(()=>namuAlbum(album),6500);}catch{return null;}
}
