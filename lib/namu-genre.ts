import {load} from "cheerio/slim";

const clean=(s:string)=>s.replace(/\s+/g," ").trim();
const norm=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/\s+/g,"");
// Only remove music-specific disambiguators, never arbitrary parentheses.
const base=(s:string)=>s.replace(/\s*\((?:음악|음악 장르|장르)\)\s*$/,"").replace(/\s+(?:음악|장르)$/,"").trim();
const latin=(s:string)=>/^[A-Za-z0-9][A-Za-z0-9 &'’+/.(),:–-]{0,99}$/.test(s);

export function inspectGenreDocument(html:string,title:string){
 const $=load(html);$("script,style,iframe,nav").remove();
 const names=[title,base(title)].map(norm),english=new Set<string>();
 let isGenre=false;
 $("table").each((_,el)=>{
  const table=$(el),rows=table.find("tr").filter((_,r)=>$(r).closest("table")[0]===el);
  const labels=rows.map((_,r)=>clean($(r).children("td,th").first().text())).get();
  // The label and subject heading must belong to the same genre infobox.
  if(!labels.some(label=>/^(기원|등장 시기|하위 장르|파생 장르|관련 장르)$/.test(label)))return;
  rows.slice(0,3).each((_,row)=>{
   const cells=$(row).children("td,th");if(cells.length!==1)return;
   const heading=cells.first().clone();heading.find("sup,table,.wiki-fn-link,.wiki-fn-content").remove();heading.find("br").replaceWith("\n");
   const value=heading.text().trim();if(value.length>200)return;
   const lines=value.split(/[\n|]/).map(clean).filter(Boolean);
   if(lines.length===1&&names.includes(norm(lines[0]))){isGenre=true;if(latin(lines[0]))english.add(lines[0]);return;}
   for(const subject of [title,base(title)]){
    // Match a complete Korean subject prefix; the remainder must be Latin only.
    const prefix=value.slice(0,subject.length);
    if(norm(prefix)!==norm(subject))continue;
    const alias=clean(value.slice(subject.length).replace(/^[\s|·:]+/,""));
    if(latin(alias)){isGenre=true;english.add(alias);}
   }
   if(lines.length===2&&names.includes(norm(lines[1]))&&latin(lines[0])){isGenre=true;english.add(lines[0]);}
  });
 });
 const targets=new Set<string>(),headings:{level:number;text:string}[]=[];
 if(!isGenre)$("h2,h3,h4,h5,h6,.wiki-paragraph,p").each((_,el)=>{
  const node=$(el);
  if(/^h[2-6]$/.test(el.tagName)){
   const level=Number(el.tagName[1]);while(headings.length&&headings.at(-1)!.level>=level)headings.pop();
   headings.push({level,text:clean(node.text())});return;
  }
  if(node.find("h2,h3,h4,h5,h6,.wiki-paragraph,p").length||node.closest("table").length)return;
  const text=clean(node.text());if(text.length>500||!/자세한\s*내용은/.test(text)||!/문서를?\s*참고/.test(text))return;
  const context=headings.map(h=>h.text).join(" ")+" "+text;
  if(/게임|가수|인물|음반|앨범|영화/.test(context))return;
  const links:string[]=[];
  node.find("a.wiki-link-internal").each((_,a)=>{
   const href=$(a).attr("href")||"";if(!href.startsWith("/w/")||href.includes("#")||href.includes("?"))return;
   let target:string;try{target=decodeURIComponent(href.slice(3));}catch{return;}
   if(!target||target.length>100||/[:\u0000-\u001f]/.test(target)||target===title)return;
   const musicSection=/장르/.test(context)&&/음악|뮤직/.test(context);
   const sameMusicSubject=norm(base(target))===norm(base(title))&&/(?:\s음악|\((?:음악|음악 장르|장르)\))$/.test(target);
   if(musicSection||sameMusicSubject)links.push(target);
  });
  // Do not guess between multiple possible targets, even within one note.
  if(links.length===1)targets.add(links[0]);
 });
 return {isGenre,englishName:english.size===1?[...english][0]:null,detailTitle:targets.size===1?[...targets][0]:null};
}
