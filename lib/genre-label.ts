import {getNamu,validTitle} from "./namu";
import {knownGenreLabel} from "./genre-view";
import {searchWebGenre} from "./genre-web-search";
export type GenreLabelResult={name:string;title:string;englishName:string|null;status:"verified"|"unresolved"|"unavailable";provider:"NamuWiki"|"Wikidata"|"Wikipedia"|"Dictionary"|null;sourceUrl:string|null};
const cache=new Map<string,{until:number;result:GenreLabelResult}>();
export async function resolveGenreLabel(input:string):Promise<GenreLabelResult>{
 const title=validTitle(input),hit=cache.get(title);if(hit&&hit.until>Date.now())return hit.result;
 const result:GenreLabelResult={name:title,title,englishName:null,status:"unresolved",provider:null,sourceUrl:null};
 const known=knownGenreLabel({name:title,title});
 if(known)return {...result,englishName:known,status:"verified",provider:"Dictionary"};
 let unavailable=false;
 try{
  const doc=await getNamu(title,"genre-label") as {englishName?:string|null;title:string};
  if(doc.englishName){result.englishName=doc.englishName;result.provider="NamuWiki";result.sourceUrl="https://namu.wiki/w/"+encodeURIComponent(doc.title);}
 }catch{unavailable=true;}
 if(!result.englishName){
  const external=await searchWebGenre(title);unavailable ||= external.unavailable;
  if(external.englishName){result.englishName=external.englishName;result.provider=external.provider;result.sourceUrl=external.sourceUrl;}
 }
 if(result.englishName){
  result.status="verified";
  if(cache.size>=200)cache.delete(cache.keys().next().value!);
  cache.set(title,{until:Date.now()+60*60*1000,result});
 }else result.status=unavailable?"unavailable":"unresolved";
 // Missing labels and temporary errors are hidden, never permanently deleted/cached.
 return result;
}
