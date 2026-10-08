import {musicBrainzRequest as requestMusicBrainz, normalize} from './live-station';
import {getNamu, NamuError, validTitle} from './namu';
import {englishText, isLatinName} from './english-display';
import type {Genre} from './genre-view';
import type {GenreArtist, GenrePage} from './genre-discovery';

type MbArtist = {id:string;name:string;type?:string;aliases?:{name:string;locale?:string}[];tags?:{name:string;count:number}[]};
type MbGenre = {id:string;name:string;count?:number};
const uuid=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const quote=(value:string)=>'"'+value.replace(/["\\]/g,' ')+'"';
const mbSource=(kind:string,id:string)=>'https://musicbrainz.org/'+kind+'/'+id;
// Bounded backoff for the provider's temporary overload/rate-limit response.
// Reuse the existing shared request pacing and successful-response cache.
async function musicBrainzRequest(path:string){
 for(let attempt=0;;attempt++){
  try{return await requestMusicBrainz(path);}
  catch(error){
   const status=(error as {upstreamStatus?:number})?.upstreamStatus;
   if(attempt>=2||![429,503].includes(status||0))throw error;
   await new Promise(resolve=>setTimeout(resolve,2200*(attempt+1)));
  }
 }
}
export type ArtistGenres={title:string;genres:Genre[];sourceUrl:string;provider:'NamuWiki'|'MusicBrainz';notice?:string};

export function exactMusicBrainzArtist(rows:MbArtist[],name:string):MbArtist {
 const named=rows.filter(a=>uuid.test(a.id)&&normalize(a.name)===normalize(name));
 const matches=named.length?named:rows.filter(a=>uuid.test(a.id)&&(a.aliases||[]).some(x=>normalize(x.name)===normalize(name)));
 const unique=[...new Map(matches.map(a=>[a.id,a])).values()];
 if(unique.length!==1)throw new NamuError(unique.length?'Several MusicBrainz artists share this name. Try a more specific artist name.':'No exact MusicBrainz artist match was found.',unique.length?409:404);
 return unique[0];
}

export async function musicBrainzArtistGenres(input:string):Promise<ArtistGenres>{
 const title=validTitle(input);
 const query='artist:'+quote(title)+' OR alias:'+quote(title);
 const search=await musicBrainzRequest('artist/?'+new URLSearchParams({query,limit:'25'}));
 const artist=exactMusicBrainzArtist(search.artists||[],title);
 const data=await musicBrainzRequest('artist/'+artist.id+'?inc=genres');
 // Official genre entities only: never turn arbitrary location/mood tags into genres.
 const genres=(data.genres||[]) as MbGenre[];
 return {title:artist.name,provider:'MusicBrainz',sourceUrl:mbSource('artist',artist.id),genres:genres
  .filter(g=>uuid.test(g.id)&&typeof g.name==='string'&&g.name.length<=100&&(g.count??0)>0)
  .sort((a,b)=>(b.count??0)-(a.count??0)||a.name.localeCompare(b.name))
  .map(g=>({name:g.name,title:'musicbrainz:'+g.id,englishName:g.name,resolutionStatus:'verified' as const,labelSourceUrl:mbSource('genre',g.id)}))};
}

export async function artistGenres(input:string):Promise<ArtistGenres>{
 const title=validTitle(input);
 try{
  const result=await getNamu(title,'artist') as {title:string;genres:Genre[];isMusician:boolean};
  if(result.isMusician&&result.genres.length)return {...result,provider:'NamuWiki',sourceUrl:'https://namu.wiki/w/'+encodeURIComponent(result.title)};
 }catch{/* An unavailable NamuWiki source is not an artist with no genres. */}
 return {...await musicBrainzArtistGenres(title),notice:'NamuWiki genre data is unavailable or incomplete. Showing MusicBrainz genres instead.'};
}

export function musicBrainzGenreArtists(rows:MbArtist[],genre:MbGenre,checkedAt:string):GenreArtist[]{
 const out:GenreArtist[]=[];
 for(const row of rows){
  if(!uuid.test(row.id)||typeof row.name!=='string'||!['Person','Group','Orchestra','Choir','Character'].includes(row.type||''))continue;
  const tag=row.tags?.find(t=>t.name.toLowerCase()===genre.name.toLowerCase()&&t.count>0);
  const highest=Math.max(0,...(row.tags||[]).map(t=>t.count));
  // Weak stray tags must not put, for example, a rock act in a hip-hop list.
  // This is a declared display filter, not an inferred/certified genre label.
  if(!tag||tag.count<Math.max(1,highest*.1))continue;
  const name=isLatinName(row.name)?row.name:row.aliases?.find(a=>a.locale==='en'&&isLatinName(a.name))?.name||row.name;
  out.push({id:'mb:'+row.id,name:englishText(name,'Artist'),title:row.name,stars:tag.count,url:mbSource('artist',row.id),sourceUrl:mbSource('genre',genre.id),provider:'MusicBrainz',evidence:'tag',checkedAt});
 }
 return [...new Map(out.map(a=>[a.id,a])).values()];
}

export async function discoverMusicBrainzGenre(title:string,offset=0):Promise<GenrePage>{
 const id=title.replace(/^musicbrainz:/,'');
 if(!title.startsWith('musicbrainz:')||!uuid.test(id)||!Number.isSafeInteger(offset)||offset<0||offset>720)throw new NamuError('Invalid MusicBrainz genre page.',400);
 const genre=await musicBrainzRequest('genre/'+id) as MbGenre;
 if(!uuid.test(genre.id)||typeof genre.name!=='string')throw new NamuError('Genre source unavailable.');
 const query='tag:'+quote(genre.name);
 const result=await musicBrainzRequest('artist/?'+new URLSearchParams({query,limit:'20',offset:String(offset)}));
 const rows=(result.artists||[]) as MbArtist[],checkedAt=new Date().toISOString();
 const artists=musicBrainzGenreArtists(rows,genre,checkedAt),total=Number(result.count)||0,next=offset+rows.length;
 return {genre:{name:genre.name,title},provider:'MusicBrainz',artists,totalCandidates:total,checked:rows.length,unavailable:0,excluded:rows.length-artists.length,nextOffset:rows.length&&next<total&&next<=720?next:null,sourceUrl:mbSource('genre',id),sourceLimited:total>740,checkedAt};
}
