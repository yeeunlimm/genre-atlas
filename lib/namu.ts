import { load } from "cheerio/slim";
import {inspectGenreDocument} from "./namu-genre";
type Link={name:string;title:string};
const cache=new Map<string,{expires:number;data:unknown}>();
const inflight=new Map<string,Promise<unknown>>();
export class NamuError extends Error{constructor(message:string,public status=502,public upstreamStatus?:number){super(message);}}
export function validTitle(title:string){
 if(!title.trim()||title.length>100||/[\u0000-\u001f]/.test(title))throw new NamuError("문서 이름은 1~100자로 입력해 주세요.",400);
 return title.trim();
}
function links($:ReturnType<typeof load>,root:ReturnType<ReturnType<typeof load>>):Link[]{
 const out:Link[]=[];root.find("a.wiki-link-internal").each((_,el)=>{
  const a=$(el),href=a.attr("href")||"";if(!href.startsWith("/w/"))return;
  let title;try{title=decodeURIComponent(href.slice(3).split("#")[0].split("?")[0]);}catch{return;}
  const name=a.text().trim();
  if(!name||/^(파일|틀|분류|나무위키|사용자):/.test(title)||/\[|\]/.test(name))return;
  if(!out.some(x=>x.title===title))out.push({name,title});
 });return out;
}
export function parseDocument(html:string,requested:string,kind:string){
 const $=load(html);$("script,style,iframe").remove();
 const title=$("title").first().text().replace(/\s*-\s*나무위키.*$/,"").trim()||requested;
 if(/Just a moment|접근이 제한|Attention Required/i.test(title))throw new NamuError("나무위키가 자동 접근을 제한했습니다. 원문 내용을 직접 붙여넣어 주세요.");
 if($("body").text().includes("해당 문서를 찾을 수 없습니다"))throw new NamuError("같은 이름의 문서를 찾지 못했습니다. 나무위키의 정확한 문서명을 입력해 주세요.",404);
 const checkedAt=new Date().toISOString(),genres:Link[]=[];
 $("tr").each((_,row)=>{
  const cells=$(row).children("td,th");const label=cells.first().text().trim();
  if(/^(음악\s*)?장르$/.test(label)){
   for(const link of links($,cells.slice(1)))if(!genres.some(g=>g.title===link.title))genres.push(link);
  }
 });
 const raw=$('a[href^="/member/star/"][count]').first().attr("count");
 const stars=raw!==undefined&&/^\d+$/.test(raw)?Number(raw):null;
 const categories=$('a[href*="/w/"]').filter((_,el)=>/\/w\/(?:%EB%B6%84%EB%A5%98|분류)(?:%3A|:)/i.test($(el).attr("href")||"")).text();
 const labels=$("tr").map((_,row)=>$(row).children("td,th").first().text().trim()).get();
 const album=labels.some(x=>/^(발매일|발매|녹음|재생 시간|러닝타임|트랙)$/.test(x))&&!labels.some(x=>/^(데뷔|결성|멤버|구성원|출생|본명)$/.test(x));
 const identity=labels.some(x=>/^(데뷔|결성|멤버|구성원|출생|본명)$/.test(x));
 const musician=!album&&identity&&(/가수|밴드|싱어송라이터|래퍼|음악가|음악 그룹|보이그룹|걸그룹|록 그룹|힙합 크루/.test(categories)||genres.length>0);
 // Read the artist's bilingual profile heading, never translate names or use
 // unrelated Latin text (album titles, members, labels) elsewhere in the page.
 let englishName:string|null=null;
 const shortTitle=title.replace(/\([^()]*\)$/,"").trim();
 const latinName=(value:string)=>/[A-Za-z]/.test(value)&&value.length<=100&&!/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\n\r]/u.test(value);
 if(latinName(shortTitle))englishName=shortTitle;
 if(!englishName&&musician){
  const profileRows=$("tr").filter((_,row)=>/^(음악\s*)?장르$/.test($(row).children("td,th").first().text().trim()));
  profileRows.each((_,row)=>{
   $(row).closest("table").find(".wiki-paragraph").each((_,el)=>{
    if(englishName)return;
    const node=$(el);if(node.find(".wiki-paragraph").length)return;
    const heading=node.clone();heading.find("sup,.wiki-fn-content,.wiki-fn-link").remove();heading.find("br").replaceWith("\n");
    const value=heading.text().trim();
    if(value.length>200)return;
    const alias=value.startsWith(shortTitle)?value.slice(shortTitle.length).replace(/^[\s|·:]+/,"").trim():value.endsWith(shortTitle)?value.slice(0,-shortTitle.length).replace(/[\s|·:]+$/,"").trim():"";
    if(latinName(alias))englishName=alias;
   });
  });
 }
 if(kind!=="artist")englishName=inspectGenreDocument(html,title).englishName;
 if(kind==="genre-label")return {name:title,title,englishName};
 if(kind==="artist")return {name:englishName||title,title,englishName,genres,stars,checkedAt,isMusician:musician};
 const out:(Link&{evidence:"list"|"tag"})[]=[];
 const add=(items:Link[],evidence:"list"|"tag")=>{for(const x of items){
  if(x.title===title)continue;const found=out.find(y=>y.title===x.title);
  if(found){if(evidence==="list")found.evidence="list";}else out.push({...x,evidence});
 }};
 const directory=title.includes("/")&&/(래퍼|뮤지션|음악가|가수|밴드)/.test(title.split("/").at(-1)||"");
 let sectionLevel=directory?1:0;
 // Walk document order, not heading siblings: NamuWiki wraps headings in containers.
 $("h2,h3,h4,h5,h6,li,.wiki-paragraph").each((_,el)=>{
  const node=$(el),tag=el.tagName;
  if(/^h[2-6]$/.test(tag)){
   const level=Number(tag[1]);
   if(!directory){
    if(/(뮤지션|아티스트|음악가|가수|밴드|래퍼)/.test(node.text()))sectionLevel=level;
    else if(sectionLevel&&level<=sectionLevel)sectionLevel=0;
   }
   return;
  }
  if(node.find("h2,h3,h4,h5,h6").length||node.closest("nav").length)return;
  if(sectionLevel){
   if(tag==="li"){
    const own=node.clone();own.find("ul,ol").remove();
    add(links($,own).slice(0,1),"list");
   }else if(!node.closest("li,table").length&&!node.find(".wiki-paragraph,li").length){
    add(links($,node),"list");
   }
  }
 });
 // Explicit genre rows in music-history tables.
 $(".wiki-paragraph").each((_,el)=>{
  const p=$(el);if(p.find(".wiki-paragraph").length)return;
  const text=p.text().replace(/\s+/g," ").trim();
  if(text.startsWith(title+" :")||text.startsWith(title+":")||text.startsWith(requested+" :"))
   add(links($,p).filter(x=>x.title!==requested),"list");
 });
 // Prefer documented artist lists. Otherwise verify genre tags on body-linked artists.
 if(!out.length){
  let started=false;
  $("h2,h3,.wiki-paragraph").each((_,el)=>{
   const p=$(el);if(/^h/.test(el.tagName)&&/개요/.test(p.text()))started=true;
   if(started&&!p.closest("table").length&&!p.find(".wiki-paragraph").length)add(links($,p),"tag");
  });
 }
 const rootTitle=title.split(/[(/]/)[0];
 const artistPages=links($,$("body")).filter(x=>x.title.startsWith(rootTitle+"/")&&/(래퍼|뮤지션|음악가|가수|밴드)/.test(x.title.slice(rootTitle.length+1))).slice(0,2);
 return {name:title,title,englishName,artists:out.slice(0,240),explicit:out.some(x=>x.evidence==="list"),artistPages,totalLinks:out.length,truncated:out.length>240,checkedAt};
}
export async function fetchNamuDocument(title:string,search=false,signal?:AbortSignal){
 title=validTitle(title);
 let current=search?"https://namu.wiki/Search?q="+encodeURIComponent(title):"https://namu.wiki/w/"+encodeURIComponent(title);
 for(let redirects=0;redirects<4;redirects++){
  const timeout=AbortSignal.timeout(12000);
  const response=await fetch(current,{redirect:"manual",signal:signal?AbortSignal.any([signal,timeout]):timeout,headers:{"User-Agent":"GenreAtlas/1.0 (personal genre discovery)","Accept":"text/html"}});
  if(response.status>=300&&response.status<400){
   const target=new URL(response.headers.get("location")||"",current);
   if(target.origin!=="https://namu.wiki"||!target.pathname.startsWith("/w/"))throw new NamuError("문서 이동을 확인하지 못했습니다. 원문을 직접 확인해 주세요.");
   current=target.href;continue;
  }
  if(!response.ok)throw new NamuError(response.status===404?"같은 이름의 문서를 찾지 못했습니다. 정확한 문서명을 입력해 주세요.":"나무위키에 연결할 수 없습니다. 잠시 후 다시 시도하거나 원문을 확인해 주세요.",response.status===404?404:502,response.status);
  if(!response.headers.get("content-type")?.includes("text/html"))throw new NamuError("읽을 수 있는 나무위키 문서가 아닙니다.");
  const reader=response.body?.getReader();if(!reader)throw new NamuError("문서 내용이 비어 있습니다.");
  const decoder=new TextDecoder();let html="",total=0;
  while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;if(total>6_000_000){await reader.cancel();throw new NamuError("문서가 너무 큽니다. 필요한 가수 목록을 직접 붙여넣어 주세요.");}html+=decoder.decode(value,{stream:true});}
  return html+decoder.decode();
 }
 throw new NamuError("문서 이동이 너무 많습니다. 최종 문서명을 직접 입력해 주세요.");
}
const fetchDocument=fetchNamuDocument;
export async function getNamu(title:string,kind:string){
 title=validTitle(title);const key=kind+":"+title,cached=cache.get(key);if(cached&&cached.expires>Date.now())return cached.data;
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{try{
  const genreRequest=kind==="genre"||kind==="genre-label";
  const signal=genreRequest?AbortSignal.timeout(18000):undefined;
  let html="";
  let data:ReturnType<typeof parseDocument>&{requestedTitle?:string;resolutionPath?:string[];sourceUrl?:string};
  try{html=await fetchDocument(title,false,signal);data=parseDocument(html,title,kind);}
  catch(e){
   if(!(e instanceof NamuError)||e.status!==404)throw e;
   const $=load(await fetchDocument(title,true,signal));
   const normalize=(s:string)=>s.normalize("NFKC").toLocaleLowerCase().replace(/[\s._’'‐–-]+/g,"");
   const matches:string[]=[];
   $('a[href^="/w/"]').each((_,el)=>{
    const a=$(el);let target;try{target=decodeURIComponent((a.attr("href")||"").slice(3));}catch{return;}
    if(target!==title&&normalize(a.text().trim())===normalize(title)&&normalize(target)===normalize(title)&&!matches.includes(target))matches.push(target);
   });
   if(!matches.length)throw new NamuError("일치하는 가수 문서를 찾지 못했습니다. 한글 이름이나 나무위키의 정식 영문 이름으로 다시 검색해 주세요.",404);
   html=await fetchDocument(matches[0],false,signal);data=parseDocument(html,matches[0],kind);
  }
  if(genreRequest){
   const initial=data,path=[data.title],visited=new Set(path);
   for(let hops=0;hops<2;hops++){
    const inspection=inspectGenreDocument(html,data.title);
    if(inspection.isGenre)break;
    const next=inspection.detailTitle;if(!next||visited.has(next))break;
    visited.add(next);html=await fetchDocument(next,false,signal);data=parseDocument(html,next,kind);path.push(data.title);
   }
   const verified=inspectGenreDocument(html,data.title).isGenre;
   // An unverified destination must not leak its artist list or English title.
   if(!verified)data=initial;
   data={...data,requestedTitle:title,resolutionPath:path,sourceUrl:"https://namu.wiki/w/"+encodeURIComponent(data.title)};
   // Negative results must be retryable after transient source changes.
   if(!verified||!data.englishName)return data;
  }
  if(cache.size>=100)cache.delete(cache.keys().next().value!);
  cache.set(key,{expires:Date.now()+15*60*1000,data});return data;
 }catch(e){if(e instanceof NamuError)throw e;throw new NamuError("나무위키 응답을 받지 못했습니다. 다시 시도하거나 직접 붙여넣기로 이어가세요.");}finally{inflight.delete(key);}})();
 inflight.set(key,job);return job;
}
