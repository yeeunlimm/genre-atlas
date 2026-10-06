// Public web reference search. No generated translations or search-snippet labels.
type Raw=Record<string,any>;
export type WebGenreResult={englishName:string|null;sourceUrl:string|null;provider:"Wikidata"|"Wikipedia"|null;unavailable:boolean};
const norm=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/\s*\((?:음악|음악 장르|장르)\)$/,"").replace(/\s+(?:음악|장르)$/,"").replace(/[\s._’'‐–-]+/g,"");
const english=(s:unknown):s is string=>typeof s==="string"&&s.length<100&&/[A-Za-z]/.test(s)&&!/[\p{Script=Hangul}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u0000-\u001f]/u.test(s);
const qid=(s:unknown):s is string=>typeof s==="string"&&/^Q\d+$/.test(s);
const roots=new Set(["Q188451","Q11921029"]); // music genre / musical style
const claimIds=(e:Raw,p:string):string[]=>(e.claims?.[p]||[]).filter((c:Raw)=>c.rank!=="deprecated"&&c.mainsnak?.snaktype==="value").map((c:Raw)=>c.mainsnak.datavalue?.value?.id).filter(qid);

export async function searchWebGenre(title:string):Promise<WebGenreResult>{
 const signal=AbortSignal.timeout(12000),entities=new Map<string,Raw>();let unavailable=false;
 const empty=():WebGenreResult=>({englishName:null,sourceUrl:null,provider:null,unavailable});
 async function api(host:"www.wikidata.org"|"ko.wikipedia.org",params:Record<string,string>):Promise<Raw>{
  const response=await fetch("https://"+host+"/w/api.php?"+new URLSearchParams({...params,format:"json"}),{redirect:"manual",signal:AbortSignal.any([signal,AbortSignal.timeout(4500)]),headers:{Accept:"application/json","User-Agent":"GenreAtlas/1.0 (https://genre-atlas-0918.sooyeon-jun-0389.chatgpt.site)"}});
  if(!response.ok){console.warn(JSON.stringify({event:"genre_reference_error",provider:host,status:response.status}));throw new Error("Genre reference search unavailable");}
  const data=await response.json() as Raw;if(data.error)throw new Error("Genre reference search unavailable");return data;
 }
 async function getEntities(ids:string[]){
  const missing=[...new Set(ids)].filter(id=>qid(id)&&!entities.has(id)).slice(0,15);
  if(!missing.length)return;
  const data=await api("www.wikidata.org",{action:"wbgetentities",ids:missing.join("|"),props:"labels|aliases|claims|sitelinks",languages:"en|ko",sitefilter:"kowiki|enwiki"});
  for(const id of missing)entities.set(id,data.entities?.[id]||{});
 }
 async function isMusicGenre(id:string){
  let frontier=[id];const visited=new Set<string>();
  for(let depth=0;depth<3&&frontier.length;depth++){
   await getEntities(frontier);const next=new Set<string>();
   for(const current of frontier){
    if(visited.has(current))continue;visited.add(current);
    const entity=entities.get(current)||{},types=claimIds(entity,"P31");
    // A musician, album or game is not a genre even when it mentions music.
    if(current===id&&types.some(t=>["Q5","Q215380","Q482994","Q7889","Q11424"].includes(t)))return false;
    const parents=[...claimIds(entity,"P279"),...(depth===0?types:[])];
    if(parents.some(p=>roots.has(p)))return true;
    for(const p of parents)if(!visited.has(p))next.add(p);
   }
   frontier=[...next].slice(0,15);
  }
  return false;
 }
 async function verify(ids:string[],wikiTitles=new Map<string,string>()){
  await getEntities(ids);const matches:{id:string;label:string}[]=[];
  for(const id of ids){
   const e=entities.get(id)||{},label=e.labels?.en?.value;
   const names=[e.labels?.ko?.value,e.labels?.en?.value,...(e.aliases?.ko||[]).map((a:Raw)=>a.value),e.sitelinks?.kowiki?.title,wikiTitles.get(id)].filter((x):x is string=>typeof x==="string");
   if(!english(label)||!names.some(name=>norm(name)===norm(title)))continue;
   if(await isMusicGenre(id))matches.push({id,label});
  }
  // Do not choose the first hit or the most popular namesake.
  return matches;
 }
 try{
  const result=await api("www.wikidata.org",{action:"wbsearchentities",search:title,language:"ko",uselang:"en",type:"item",limit:"5"});
  const matches=await verify([...new Set<string>((result.search||[]).map((x:Raw)=>x.id).filter(qid))]);
  if(matches.length===1)return {englishName:matches[0].label,sourceUrl:"https://www.wikidata.org/wiki/"+matches[0].id,provider:"Wikidata",unavailable:false};
  if(matches.length>1)return empty();
 }catch(e){console.warn(JSON.stringify({event:"genre_reference_error",provider:"Wikidata",code:e instanceof Error?e.name:"unknown"}));unavailable=true;}
 // Full-text Wikipedia web search can find pages missing from label search.
 // Only an exact title/alias plus a verified music classification is accepted.
 try{
  const result=await api("ko.wikipedia.org",{action:"query",generator:"search",gsrsearch:'"'+title.replace(/["\\]/g," ")+'"',gsrnamespace:"0",gsrlimit:"5",prop:"pageprops",formatversion:"2"});
  const wikiTitles=new Map<string,string>();
  for(const page of result.query?.pages||[]){const id=page.pageprops?.wikibase_item;if(qid(id)&&page.pageprops?.disambiguation===undefined&&typeof page.title==="string"&&norm(page.title)===norm(title))wikiTitles.set(id,page.title);}
  const matches=await verify([...wikiTitles.keys()],wikiTitles);
  if(matches.length===1)return {englishName:matches[0].label,sourceUrl:"https://ko.wikipedia.org/wiki/"+encodeURIComponent(wikiTitles.get(matches[0].id)!),provider:"Wikipedia",unavailable:false};
 }catch(e){console.warn(JSON.stringify({event:"genre_reference_error",provider:"Wikipedia",code:e instanceof Error?e.name:"unknown"}));unavailable=true;}
 return empty();
}
