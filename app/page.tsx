"use client";
import {useState,useRef,useEffect,useCallback} from "react";
import {Search,ArrowUpRight,ArrowRight,LoaderCircle,Users,RotateCcw,Play} from "lucide-react";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
import {AlbumWall} from "@/components/album-wall";
import {ArtistAlbums} from "@/components/artist-albums";
import {saveArtistReturn,readArtistReturn,clearArtistReturnMarker,restoreAlbumPosition,type ArtistReturn} from "@/lib/artist-return";
import {ArtistCdPlayer} from "@/components/artist-cd-player";
import {DiscoveryStation} from "@/components/discovery-station";
import type {GenrePage,GenreArtist} from "@/lib/genre-discovery";
import type {MusicArtist,AlbumArtwork} from "@/lib/youtube-music";
type Artist=MusicArtist&{wiki?:GenreArtist};
import {englishText} from "@/lib/english-display";
import {youtubeSearchUrl} from "@/lib/listen-link";
import {genreLabel,knownGenreLabel,genreDisplayState,type Genre} from "@/lib/genre-view";
import {ARTIST_CLIENT_TIMEOUT_MS} from "@/lib/music-timeouts";
type Result={artist?:Artist;related:Artist[];artists:Artist[];provider:"YouTube Music"|"Deezer";state:"ready"|"empty"|"choose-artist";notice:string;error?:string};
const compact=(n:number|null)=>n===null?"Unavailable":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);
const audienceMetric=(a:Artist)=>a.metric==="deezer-fans"?"Deezer fans":"Monthly audience";
const normalize=(s:string)=>s.toLocaleLowerCase().replace(/[\s._'’()-]/g,"");
async function music(kind:string,q:string,name=""):Promise<Result>{const r=await fetch("/api/music?"+new URLSearchParams({kind,q,name}),{cache:"no-store",signal:AbortSignal.timeout(ARTIST_CLIENT_TIMEOUT_MS)});const d=await r.json() as Result;if(!r.ok)throw new Error(r.status===429?"Too many requests. Please try again shortly.":d.error||"Music search is unavailable. Please try again.");return d;}
async function getGenres(name:string):Promise<{genres:Genre[];title:string}>{
 const r=await fetch("/api/namu?kind=artist&title="+encodeURIComponent(name),{cache:"no-store"});
 if(!r.ok)throw new Error("Genre source unavailable");
 const d=await r.json() as {genres:Genre[];title:string};return d;
}
function LoadingArtwork({album,artistName}:{album?:AlbumArtwork;artistName?:string}){
 const [failed,setFailed]=useState(false);
 const showAlbum=!!album&&!failed;
 return <figure className="loading-artwork"><img className="empty-disc" src={showAlbum?album.imageUrl:"/reference/silver-disc.png"} alt={showAlbum?englishText(album.title,"Album")+" album cover by "+englishText(artistName,"Artist"):"Silver disc in a clear case"} onError={()=>setFailed(true)} referrerPolicy="no-referrer"/>{showAlbum&&<figcaption>{englishText(album.title,"Album")}<span>{englishText(artistName,"Artist")}</span></figcaption>}</figure>;
}
export default function Home(){
 const [query,setQuery]=useState(""),[artist,setArtist]=useState<Artist|null>(null),[candidates,setCandidates]=useState<Artist[]>([]),[related,setRelated]=useState<Artist[]>([]);
 const [genres,setGenres]=useState<Genre[]>([]),[genreSource,setGenreSource]=useState(""),[genreStatus,setGenreStatus]=useState("Search an artist to explore genres.");
 const [genreRetry,setGenreRetry]=useState(0);
 const genreDisplay=genreDisplayState(genres);
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[note,setNote]=useState(""),[detail,setDetail]=useState<Artist|null>(null);
 const [relatedProvider,setRelatedProvider]=useState("YouTube Music"),[fallbackChoices,setFallbackChoices]=useState<Artist[]>([]);
 const [mode,setMode]=useState<"related"|"genre"|"albums">("related"),[selectedGenre,setSelectedGenre]=useState<Genre|null>(null);
 const [albumReturn,setAlbumReturn]=useState<ArtistReturn|null>(null);
 const [genrePage,setGenrePage]=useState<GenrePage|null>(null),[genreArtists,setGenreArtists]=useState<GenreArtist[]>([]),[genreBusy,setGenreBusy]=useState(false),[genreError,setGenreError]=useState("");
 const run=useRef(0),genreRun=useRef(0),genreRequest=useRef<AbortController|null>(null);
 useEffect(()=>{
  const unknown=genres.filter(g=>!knownGenreLabel(g));if(!unknown.length)return;
  const controller=new AbortController(),token=run.current;let index=0;
  setGenres(previous=>previous.map(g=>!knownGenreLabel(g)?{...g,resolutionStatus:"pending"}:g));
  void Promise.all([0,1].map(async()=>{while(index<unknown.length&&!controller.signal.aborted){const g=unknown[index++];try{
   const response=await fetch("/api/namu?kind=genre-label&title="+encodeURIComponent(g.title),{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(33000)])});if(!response.ok)throw new Error("Genre label lookup unavailable");
   const data=await response.json() as Genre&{status:Genre["resolutionStatus"];sourceUrl:string|null};if(token!==run.current||controller.signal.aborted)return;
   const englishName=knownGenreLabel({name:"",title:"",englishName:data.englishName});
   setGenres(previous=>previous.map(item=>item.title===g.title?{...item,englishName,resolutionStatus:englishName?"verified":data.status==="unresolved"?"unresolved":"unavailable",labelSourceUrl:data.sourceUrl}:item));
   if(englishName)setSelectedGenre(previous=>previous?.title===g.title?{...previous,englishName}:previous);
  }catch{if(token===run.current&&!controller.signal.aborted)setGenres(previous=>previous.map(item=>item.title===g.title?{...item,resolutionStatus:"unavailable"}:item));}}}));
  return()=>controller.abort();
 },[genres.map(g=>g.title).join("|"),genreSource,genreRetry]);
 const resetGenre=useCallback(()=>{++genreRun.current;genreRequest.current?.abort();setMode("related");setSelectedGenre(null);setGenrePage(null);setGenreArtists([]);setGenreBusy(false);setGenreError("");},[]);
 useEffect(()=>()=>{genreRequest.current?.abort();},[]);
 const selectArtist=useCallback(async(a:Artist,initialMode:"related"|"albums"="related")=>{
  clearArtistReturnMarker();setAlbumReturn(null);
  const token=++run.current;resetGenre();setBusy("Finding related artists…");setError("");setNote("");setCandidates([]);setFallbackChoices([]);setRelatedProvider(a.provider||"YouTube Music");setArtist(a);setRelated([]);setGenres([]);setGenreSource("");setGenreStatus("Checking genres…");
  setMode(initialMode);
  void getGenres(a.name).then(d=>{if(token!==run.current)return;setGenres(d.genres);setGenreSource("https://namu.wiki/w/"+encodeURIComponent(d.title));setGenreStatus(d.genres.length?"":"No genre tags found. Related artists are still available.");}).catch(()=>{if(token===run.current)setGenreStatus("Genre source unavailable. Related artists are still available.");});
  try{const d=await music("artist",a.id,a.name);if(token!==run.current)return;setArtist(d.artist||a);setRelated(d.related);setRelatedProvider(d.provider);setFallbackChoices(d.state==="choose-artist"?d.artists:[]);setNote(d.notice);return {ok:d.state==="ready",artist:d.artist?.name||a.name,count:d.related.length};}
  catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[resetGenre]);
 const search=useCallback(async(name:string,displayName=name,initialMode:"related"|"albums"="related")=>{
  if(!name.trim()){setError("Enter an artist name.");return {ok:false};}
  clearArtistReturnMarker();setAlbumReturn(null);
  const token=++run.current;resetGenre();setQuery(displayName);setBusy("Searching artists…");setError("");setNote("");setCandidates([]);setFallbackChoices([]);setArtist(null);setRelated([]);setGenres([]);setGenreSource("");setGenreStatus("Select an artist from the results.");
  try{const d=await music("search",name.trim());if(token!==run.current)return {ok:false};
   if(!d.artists.length){setNote("No artists found. Try a different spelling.");return {ok:false};}
   const exact=d.artists.filter(a=>normalize(a.name)===normalize(name));
   if(exact.length===1)return await selectArtist(exact[0],initialMode);
   setCandidates(d.artists);setNote("Choose the artist you are looking for.");return {ok:true,candidates:d.artists.map(a=>a.name)};
  }catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[selectArtist,resetGenre]);
 async function exploreGenre(g:Genre,append=false){
  const token=++genreRun.current,seed=run.current;
  genreRequest.current?.abort();const controller=new AbortController();genreRequest.current=controller;
  const offset=append?genrePage?.nextOffset:0;if(offset===null||offset===undefined)return;
  setMode("genre");setSelectedGenre(g);setGenreBusy(true);setGenreError("");
  if(!append){setGenrePage(null);setGenreArtists([]);}
  try{
   const response=await fetch("/api/genre?title="+encodeURIComponent(g.title)+"&offset="+offset,{signal:controller.signal,cache:"no-store"});
   if(!response.ok)throw new Error("Genre discovery is unavailable. Retry or open the source page.");
   const page=await response.json() as GenrePage;
   if(token!==genreRun.current||seed!==run.current)return;
   setGenrePage(page);
   setGenreArtists(previous=>[...new Map((append?[...previous,...page.artists]:page.artists).map(a=>[a.id,a])).values()]);
  }catch(e){if(token===genreRun.current&&seed===run.current&&!controller.signal.aborted)setGenreError((e as Error).message);}
  finally{if(token===genreRun.current&&seed===run.current)setGenreBusy(false);}
 }
 useEffect(()=>{
  const ctx=(document as unknown as {modelContext?:{registerTool:(t:unknown,o:unknown)=>Promise<void>}}).modelContext;if(!ctx)return;
  const c=new AbortController();try{Promise.resolve(ctx.registerTool({name:"search_artist",description:"Search YouTube Music artists and display related artists.",inputSchema:{type:"object",properties:{name:{type:"string"}},required:["name"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(x:{name:string})=>{if(typeof x?.name!=="string"||!x.name.trim()||x.name.length>100)throw new Error("Artist name must be 1–100 characters.");return search(x.name);}},{signal:c.signal})).catch(()=>{});}catch{}return()=>c.abort();
 },[search]);
 const restoredAlbum=useRef(false);
 useEffect(()=>{
  let cancel:(()=>void)|undefined;
  const onPageShow=(event:PageTransitionEvent)=>{
   if(!event.persisted)return;
   const previous=readArtistReturn();
   if(previous){cancel?.();cancel=restoreAlbumPosition(previous.catalog,previous.scrollY);}
  };
  window.addEventListener("pageshow",onPageShow);
  return()=>{window.removeEventListener("pageshow",onPageShow);cancel?.();};
 },[]);
 useEffect(()=>{
  if(restoredAlbum.current)return;restoredAlbum.current=true;
  const previous=readArtistReturn();
  if(previous){
   ++run.current;setQuery(previous.query);setArtist(previous.artist);setRelated(previous.related);setGenres(previous.genres);setGenreSource(previous.genreSource);setGenreStatus(previous.genreStatus);setRelatedProvider(previous.provider);setNote(previous.note);setMode("albums");setAlbumReturn(previous);return;
  }
  const name=new URLSearchParams(window.location.search).get("albumArtist");if(name&&name.length<=100)void search(name,name,"albums");
 },[search]);
 const genreMode=mode==="genre";
 const visible:Artist[]=genreMode?genreArtists.map(a=>({id:"wiki:"+a.id,name:a.name,audience:null,audienceLabel:"",url:a.url,checkedAt:a.checkedAt,wiki:a})):related;
 const score=(a:Artist)=>a.wiki?a.wiki.stars:a.audience;
 const metric=genreMode?"Wiki interest":relatedProvider==="Deezer"?"Deezer fans":"Monthly audience",activeBusy=genreMode?genreBusy:!!busy;
 const sorted=[...visible].sort((a,b)=>(score(b)??-1)-(score(a)??-1)||a.name.localeCompare(b.name)),max=Math.max(1,...sorted.map(a=>score(a)??0));
 const cloud=[...sorted.filter((_,i)=>i%2===0).reverse(),...sorted.filter((_,i)=>i%2===1)];
 const activeNote=genreMode?(selectedGenre?"Independent NamuWiki genre discovery — not filtered from All related.":"Choose a genre in the sidebar.") : note;
 const relatedEmpty=<div role={error?"alert":undefined}><h3>{busy?"LOADING…":fallbackChoices.length?"CHOOSE ARTIST":error?"SOURCE UNAVAILABLE":artist?"NO RELATED ARTISTS":"NO ARTIST SELECTED"}</h3><p>{busy?busy:fallbackChoices.length?note:error|| (artist?note||"No related artists were returned. Explore a genre or retry.":"Search an artist above.")}</p>{!busy&&fallbackChoices.length>0&&<div className="artist-list" aria-label="Choose Deezer artist">{fallbackChoices.map(a=><button key={a.id} onClick={()=>void selectArtist(a)}><b>{a.name}</b><span>{compact(a.audience)} Deezer fans</span></button>)}</div>}{!busy&&artist&&<button className="secondary" onClick={()=>void selectArtist(artist)}>Retry related artists</button>}</div>;
 return <main>
 <header className="topbar"><a className="brand" href="/" aria-label="Genre Atlas home"><span className="wordmark">GENRE<span>ATLAS</span></span></a><span className="top-caption">MUSIC DISCOVERY / VOL. 01</span><nav className="station-nav" aria-label="Music discovery"><a href="#discovery-station">Discovery Station</a><a className="quiet" href="https://www.youtube.com/" target="_blank" rel="noreferrer"><Play size={14}/> Listen <ArrowUpRight size={14}/></a></nav></header>
 <div className="workspace">
 <section className="search-deck" aria-label="Artist discovery">
 <div className="search-main"><img className="discovery-ornament" src="/reference/white-ornate-clef-v1.png" alt="" aria-hidden="true" width={220} height={390}/><h1>DISCOVER</h1>
 <form className="search-form" onSubmit={e=>{e.preventDefault();void search(query);}}><Search size={21}/><label className="sr-only" htmlFor="artist-search">Artist name</label><input id="artist-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search an artist" maxLength={100}/><button className="primary" type="submit" aria-label="Search artists">Search <ArrowRight size={18}/></button></form>
 <div className="suggestions"><span>TRY</span>{["Tame Impala","Radiohead","A$AP Rocky","Kanye West"].map(n=><button key={n} onClick={()=>void search(n)}>{n}</button>)}</div></div>
 <AlbumWall onExploreArtist={name=>{void search(name).then(()=>requestAnimationFrame(()=>{(document.querySelector(".candidate-results")||document.getElementById("artist-discover"))?.scrollIntoView({block:"start",behavior:"instant"});}));}}/>
 </section>
 {error&&<div className="message error" role="alert">{error}<button onClick={()=>void search(query)}>Try again</button></div>}
 {candidates.length>0&&<section className="candidate-results" aria-label="Artist search results"><h2>SELECT ARTIST</h2><div>{candidates.map(a=><button key={a.id} onClick={()=>void selectArtist(a)}><b>{englishText(a.name,"Artist")}</b><span>{compact(a.audience)} {audienceMetric(a).toLowerCase()}</span><ArrowRight size={17}/></button>)}</div></section>}
 <section className="explorer" id="artist-discover">
 <aside className="artist-panel"><div className="panel-kicker"><span>01 / STARTING POINT</span></div><ArtistCdPlayer artist={artist}/><h2>{englishText(artist?.name,"SELECT ARTIST")}</h2><p className="muted">{artist?compact(artist.audience)+" "+audienceMetric(artist).toLowerCase():"Your search starts here."}</p>{artist&&<a className="source-link" href={youtubeSearchUrl(artist.name)} target="_blank" rel="noreferrer">Listen on YouTube <ArrowUpRight size={14}/></a>}
 <div className="divider"/><span className="eyebrow genre-label">ARTIST RADIO</span><div className="genres"><button className={mode==="related"?"genre active":"genre"} aria-pressed={mode==="related"} onClick={()=>setMode("related")}>All related <span>{busy?"…":error||fallbackChoices.length?"—":related.length}</span></button></div><p className="nav-description">{relatedProvider} recommendations</p>
 <div className="divider"/><span className="eyebrow genre-label">EXPLORE BY GENRE</span><p className="nav-description">A separate artist collection from NamuWiki</p><div className="genres" aria-busy={genreDisplay.pending>0}>{genreDisplay.visible.map(g=><button key={g.title} className={genreMode&&selectedGenre?.title===g.title?"genre active":"genre"} aria-pressed={genreMode&&selectedGenre?.title===g.title} onClick={()=>void exploreGenre(g)}>{genreLabel(g)}</button>)}{genreStatus&&<p className="muted small">{genreStatus}</p>}{genreDisplay.pending>0&&<p role="status" className="muted small">Checking English genre names…</p>}{genreDisplay.hidden>0&&genreDisplay.pending===0&&<p role="status" className="muted small">{genreDisplay.visible.length?"Genres without a verified English name are hidden.":"No verified English genre names available. Related artists are still available."}</p>}{genreDisplay.hidden>0&&genreDisplay.pending===0&&<button className="secondary" onClick={()=>setGenreRetry(n=>n+1)}>Retry genre names</button>}</div>
 {genreSource&&<a className="source-link genre-source" href={genreSource} target="_blank" rel="noreferrer">Source: NamuWiki <ArrowUpRight size={13}/></a>}
 </aside>
 <section className="results" aria-busy={mode!=="albums"&&activeBusy}><div className="results-heading"><div><span className="eyebrow">{mode==="albums"?"02 / THE DISCOGRAPHY":genreMode?"02 / GENRE DISCOVERY":"02 / ARTIST RADIO"}</span><h2>{mode==="albums"?"ALBUMS & MORE":genreMode?(selectedGenre?genreLabel(selectedGenre):"EXPLORE BY GENRE"):"RELATED ARTISTS"}</h2></div>{mode!=="albums"&&<span className="count">{String(visible.length).padStart(2,"0")}<span>ARTISTS</span></span>}</div>
 <Tabs className="discovery-modes" value={mode} onValueChange={value=>setMode(value as "related"|"genre"|"albums")}><TabsList aria-label="Discovery source"><TabsTrigger value="related">Related artists</TabsTrigger><TabsTrigger value="genre">Genre artists</TabsTrigger><TabsTrigger value="albums">Albums</TabsTrigger></TabsList><TabsContent value={mode} key={mode}>
 {mode==="albums"?<ArtistAlbums key={artist?.id||"none"} artist={artist} restore={albumReturn?.catalog} onRestored={()=>{if(albumReturn)return restoreAlbumPosition(albumReturn.catalog,albumReturn.scrollY);}} onOpenRelease={catalog=>artist?saveArtistReturn({query,artist,related,genres,genreSource,genreStatus,note,provider:relatedProvider as "YouTube Music"|"Deezer",catalog,scrollY:window.scrollY}):null}/>:<>
 <p className="source-caption">{genreMode?"NAMUWIKI / GENRE COLLECTION":relatedProvider==="Deezer"?"DEEZER / RELATED ARTISTS":"YOUTUBE MUSIC / FANS MIGHT ALSO LIKE"}</p>
 <Tabs defaultValue="cloud"><div className="view-controls"><TabsList aria-label="Result view"><TabsTrigger value="cloud">Cloud</TabsTrigger><TabsTrigger value="list">List</TabsTrigger></TabsList><span className="metric"><Users size={14}/> {metric}</span></div>
 <div className="busy" aria-live="polite">{activeBusy&&<><LoaderCircle className="spin" size={16}/>{genreMode?"Reading genre artists from NamuWiki…":busy}</>}</div>
 <TabsContent value="cloud"><div className="cloud" aria-label={genreMode?"Genre artist cloud":"Related artist cloud"}>{!activeBusy&&visible.length?cloud.map((a,i)=><button key={a.id} disabled={activeBusy} className={"word color-"+i%4} style={{fontSize:(score(a)===null?1.1:1.1+2.6*Math.sqrt(score(a)!/max))+"rem"}} title={englishText(a.name,"Artist")+" · "+compact(score(a))+" "+metric.toLowerCase()} onClick={()=>setDetail(a)}>{englishText(a.name,"Artist")}</button>):<div className="empty-content"><LoadingArtwork key={(artist?.id||"none")+":"+(artist?.albumArtwork?.imageUrl||"none")} album={artist?.albumArtwork} artistName={artist?.name}/>{genreMode?<div><h3>{activeBusy?"LOADING…":selectedGenre?"NO VERIFIED ARTISTS YET":"SELECT A GENRE"}</h3><p>{genreError|| (selectedGenre?"Read more source links below, or open the genre page.":"Choose a genre on the left. This collection is independent of related artists.")}</p></div>:relatedEmpty}</div>}</div></TabsContent>
 <TabsContent value="list">{activeBusy&&<div className="list-loading"><LoadingArtwork key={(artist?.id||"none")+":"+(artist?.albumArtwork?.imageUrl||"none")} album={artist?.albumArtwork} artistName={artist?.name}/></div>}<div className="artist-list">{sorted.length?sorted.map(a=><button key={a.id} disabled={activeBusy} onClick={()=>setDetail(a)}><span className="rank">{score(a)===null?"—":String(sorted.findIndex(x=>score(x)===score(a))+1).padStart(2,"0")}</span><b>{englishText(a.name,"Artist")}</b><span>{compact(score(a))}</span><ArrowUpRight size={16}/></button>):genreMode?<p className="list-empty">Choose a genre to discover its artists.</p>:relatedEmpty}</div></TabsContent></Tabs>
 <div className="cloud-legend"><span><span className="legend-small">A</span><span className="legend-large">A</span> Size = {metric.toLowerCase()}</span><span>Select a name to explore</span></div>{activeNote&&<p className="result-note" role="status">{activeNote}</p>}
 {genreMode&&selectedGenre&&<div className="genre-progress">
 {genrePage&&<p>{genreArtists.length} verified artists · {genrePage.nextOffset??genrePage.totalCandidates} / {genrePage.totalCandidates} source links checked{genrePage.unavailable>0?" · "+genrePage.unavailable+" pages unavailable in the last batch":""}{genrePage.sourceLimited?" · Source coverage is limited":""}</p>}
 {genreError&&<p className="error" role="alert">{genreError}</p>}
 <div className="genre-actions">
 {genrePage?.nextOffset!=null&&<button className="secondary" disabled={genreBusy} onClick={()=>void exploreGenre(selectedGenre,true)}>{genreBusy?"Loading…":"Load more genre artists"}</button>}
 {(genreError||!!genrePage?.unavailable)&&<button className="secondary" disabled={genreBusy} onClick={()=>void exploreGenre(selectedGenre)}>Retry genre</button>}
 <a className="source-link" href={genrePage?.sourceUrl||"https://namu.wiki/w/"+encodeURIComponent(selectedGenre.title)} target="_blank" rel="noreferrer">Open genre source <ArrowUpRight size={13}/></a>
 </div></div>}
 </>}
 </TabsContent></Tabs></section></section>
 <details className="method"><summary>About the data</summary><p>Related artists come only from YouTube Music’s “Fans might also like”. If that source rejects a request or returns no list, we show its availability instead of switching to Deezer. Word sizes use YouTube Music monthly audience. Unknown values use the smallest size. Genre discovery is a separate NamuWiki collection, built from the genre article and its linked artist directories. Body-linked artists require a matching genre tag; artist-list entries are checked as musicians. Genre sizes use document interest counts, not monthly audience. Only the loaded, verified portion is shown; use Load more to continue. Unavailable genre data never falls back to the related list. Genres use verified English names or their source heading; unverified genre names remain in the original language. Other Korean names without an English alias may use romanized display text, which is not an official translation. Listen links open ordinary YouTube search. Loading artwork comes from the artist’s public Albums section, not a most-popular-album ranking.</p></details>
 <DiscoveryStation/>
 <footer><span>GENRE ATLAS © 2026</span><span>Unofficial discovery tool. Data availability may vary.</span></footer>
 </div>
 <Sheet open={!!detail} onOpenChange={o=>{if(!o)setDetail(null);}}><SheetContent className="detail-sheet"><SheetHeader><span className="eyebrow">ARTIST / DETAILS</span><SheetTitle className="detail-title">{englishText(detail?.name,"Artist")}</SheetTitle><SheetDescription>{detail?.wiki?"From the NamuWiki genre collection. Not a related-artist recommendation.":"Related to "+englishText(artist?.name,"Artist")+" on "+(detail?.provider||"YouTube Music")+"."}</SheetDescription></SheetHeader>{detail&&<div className="sheet-body"><div className="stat"><Users/><span>{detail.wiki?"NamuWiki document interest":audienceMetric(detail)}</span><strong>{compact(detail.wiki?detail.wiki.stars:detail.audience)}</strong></div><p className="muted">Source: {detail.wiki?"NamuWiki document bookmarks":englishText(detail.audienceLabel)}<br/>Checked: {new Date(detail.checkedAt).toLocaleString("en-US")}<br/>{detail.wiki?"Document interest is a platform-specific proxy, not listener counts.":detail.metric==="deezer-fans"?"Fan count on Deezer, not monthly listeners or plays.":"Rounded figures from the public artist page."}</p>{detail.wiki&&<a className="source-link" href={detail.wiki.sourceUrl} target="_blank" rel="noreferrer">{detail.wiki.evidence==="list"?"Listed in the genre artist section":"Linked from genre; artist genre tag verified"} <ArrowUpRight size={13}/></a>}<a className="source-link" href={detail.url} target="_blank" rel="noreferrer">Artist source: {detail.wiki?"NamuWiki":detail.provider||"YouTube Music"} <ArrowUpRight size={13}/></a><a className="primary" href={youtubeSearchUrl(detail.name)} target="_blank" rel="noreferrer"><Play size={17}/> Listen on YouTube <ArrowUpRight size={17}/></a><button className="secondary" onClick={()=>{const a=detail;setDetail(null);setQuery(englishText(a.name,"Artist"));if(a.wiki)void search(a.wiki.title,englishText(a.name,"Artist"));else void selectArtist(a);}}><RotateCcw size={16}/> Explore this artist</button></div>}</SheetContent></Sheet>
 </main>;
}
