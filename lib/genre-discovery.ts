import {getNamu,validTitle} from "./namu";

type Link={name:string;title:string};
type Candidate=Link&{evidence:"list"|"tag";sourceTitle:string};
type GenreDocument=Link&{artists:(Link&{evidence:"list"|"tag"})[];artistPages?:Link[];totalLinks:number;truncated:boolean;checkedAt:string};
type ArtistDocument=Link&{genres:Link[];stars:number|null;isMusician:boolean;checkedAt:string};
export type GenreArtist=Link&{id:string;stars:number|null;url:string;sourceUrl:string;evidence:"list"|"tag";checkedAt:string};
export type GenrePage={genre:Link;artists:GenreArtist[];totalCandidates:number;checked:number;unavailable:number;excluded:number;nextOffset:number|null;sourceUrl:string;sourceLimited:boolean;checkedAt:string};
const sourceUrl=(title:string)=>"https://namu.wiki/w/"+encodeURIComponent(title);
const jobs=new Map<string,Promise<GenrePage>>();
const cache=new Map<string,{expires:number;page:GenrePage}>();
const BATCH=20;

export function verifyGenreArtist(candidate:Candidate,doc:ArtistDocument,genreTitles:string[]):GenreArtist|null {
 if(!doc.isMusician)return null;
 if(candidate.evidence!=="list"&&!doc.genres.some(g=>genreTitles.includes(g.title)||genreTitles.includes(g.name)))return null;
 return {id:doc.title,name:candidate.name,title:doc.title,stars:doc.stars,url:sourceUrl(doc.title),sourceUrl:sourceUrl(candidate.sourceTitle),evidence:candidate.evidence,checkedAt:doc.checkedAt};
}

// The input is a genre document only. No seed artist or YouTube recommendations enter this query.
export async function discoverGenre(title:string,offset=0):Promise<GenrePage>{
 title=validTitle(title);
 if(!Number.isSafeInteger(offset)||offset<0||offset>720)throw new Error("Invalid genre page.");
 const key=title+":"+offset,cached=cache.get(key);
 if(cached&&cached.expires>Date.now())return cached.page;
 if(jobs.has(key))return jobs.get(key)!;
 const job=(async()=>{
  const doc=await getNamu(title,"genre") as GenreDocument;
  const candidates:Candidate[]=[];
  let sourceLimited=doc.truncated,unavailableSources=0;
  const add=(d:GenreDocument)=>{for(const a of d.artists){
   const previous=candidates.find(x=>x.title===a.title);
   if(!previous)candidates.push({...a,sourceTitle:d.title});
   else if(a.evidence==="list"){previous.evidence="list";previous.sourceTitle=d.title;}
  }};
  // Follow only artist-directory links actually found in the genre document.
  for(const link of doc.artistPages||[]){
   try{const directory=await getNamu(link.title,"genre") as GenreDocument;add(directory);sourceLimited ||= directory.truncated;}
   catch{unavailableSources++;}
  }
  add(doc);
  const batch=candidates.slice(offset,offset+BATCH*3),deadline=Date.now()+18000;
  let index=0,unavailable=0,excluded=0;
  const artists:GenreArtist[]=[];
  await Promise.all(Array.from({length:3},async()=>{
   while(index<batch.length&&(index<BATCH||artists.length<8)&&Date.now()<deadline){
    const candidate=batch[index++];
    try{
     const artist=await getNamu(candidate.title,"artist") as ArtistDocument;
     const matchingTitles=[title,doc.title];
     // Follow actual wiki redirects for aliases (e.g. 서던 힙합 → 남부 힙합).
     // Never broaden genres by substring or an assumed taxonomy.
     if(artist.isMusician&&candidate.evidence==="tag"&&!verifyGenreArtist(candidate,artist,matchingTitles)){
      let unreadable=false;
      for(const tag of artist.genres){
       try{
        const canonical=await getNamu(tag.title,"artist") as ArtistDocument;
        if(matchingTitles.includes(canonical.title)){matchingTitles.push(tag.title);break;}
       }catch{unreadable=true;}
      }
      if(unreadable&&!verifyGenreArtist(candidate,artist,matchingTitles)){unavailable++;continue;}
     }
     const verified=verifyGenreArtist(candidate,artist,matchingTitles);
     if(verified)artists.push(verified);else excluded++;
    }catch{unavailable++;}
   }
  }));
  const unique=[...new Map(artists.map(a=>[a.id,a])).values()];
  const page:GenrePage={genre:{name:doc.name,title:doc.title},artists:unique,totalCandidates:candidates.length,checked:index,unavailable,excluded,nextOffset:offset+index<candidates.length?offset+index:null,sourceUrl:sourceUrl(doc.title),sourceLimited:sourceLimited||unavailableSources>0,checkedAt:doc.checkedAt};
  // Do not cache transient partial failures; Retry should make a fresh attempt.
  if(!unavailable&&!unavailableSources){if(cache.size>=60)cache.delete(cache.keys().next().value!);cache.set(key,{expires:Date.now()+10*60*1000,page});}
  return page;
 })().finally(()=>jobs.delete(key));
 jobs.set(key,job);return job;
}
