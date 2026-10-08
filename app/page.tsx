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
import {DiscoveryOnboarding} from "@/components/discovery-onboarding";
import {AccountButton,useAccount} from "@/components/account-provider";
import type {GenrePage,GenreArtist} from "@/lib/genre-discovery";
import type {MusicArtist,AlbumArtwork} from "@/lib/youtube-music";
type Artist=MusicArtist&{wiki?:GenreArtist};
import {englishText} from "@/lib/english-display";
import {youtubeSearchUrl} from "@/lib/listen-link";
import {genreLabel,knownGenreLabel,genreDisplayState,type Genre} from "@/lib/genre-view";
import {ARTIST_CLIENT_TIMEOUT_MS} from "@/lib/music-timeouts";
import type {ArtistGenres} from "@/lib/musicbrainz-genres";
import {discoveryModeFromUrl,type DiscoveryMode} from "@/lib/discovery-navigation";
type Result={artist?:Artist;related:Artist[];artists:Artist[];provider:"YouTube Music"|"Deezer";state:"ready"|"empty"|"choose-artist";notice:string;error?:string};
const compact=(n:number|null)=>n===null?"Unavailable":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);
const audienceMetric=(a:Artist)=>a.metric==="deezer-fans"?"Deezer fans":"Monthly audience";
const normalize=(s:string)=>s.toLocaleLowerCase().replace(/[\s._'’()-]/g,"");
async function music(kind:string,q:string,name=""):Promise<Result>{const r=await fetch("/api/music?"+new URLSearchParams({kind,q,name}),{cache:"no-store",signal:AbortSignal.timeout(ARTIST_CLIENT_TIMEOUT_MS)});const d=await r.json() as Result;if(!r.ok)throw new Error(r.status===429?"Too many requests. Please try again shortly.":d.error||"Music search is unavailable. Please try again.");return d;}
async function getGenres(name:string):Promise<ArtistGenres>{
 const r=await fetch("/api/artist-genres?title="+encodeURIComponent(name),{cache:"no-store",signal:AbortSignal.timeout(45000)});
 if(!r.ok){
  const failure=await r.json().catch(()=>({})) as {error?:string};
  throw new Error(failure.error||"Genre sources are unavailable. This does not mean the artist has no genres.");
 }
 return await r.json() as ArtistGenres;
}
function LoadingArtwork({album,artistName}:{album?:AlbumArtwork;artistName?:string}){
 const [failed,setFailed]=useState(false);
 const showAlbum=!!album&&!failed;
 return <figure className="loading-artwork"><img className="empty-disc" src={showAlbum?album.imageUrl:"/reference/silver-disc.png"} alt={showAlbum?englishText(album.title,"Album")+" album cover by "+englishText(artistName,"Artist"):"Silver disc in a clear case"} onError={()=>setFailed(true)} referrerPolicy="no-referrer"/>{showAlbum&&<figcaption>{englishText(album.title,"Album")}<span>{englishText(artistName,"Artist")}</span></figcaption>}</figure>;
}
export default function Home(){
 const account=useAccount();
 const [playlistTarget,setPlaylistTarget]=useState<HTMLDivElement|null>(null);
 const [songSearchTarget,setSongSearchTarget]=useState<HTMLDivElement|null>(null);
 const [discoveryMode,setDiscoveryMode]=useState<DiscoveryMode>("artist");
 const switchDiscovery=useCallback((next:DiscoveryMode,scroll=false)=>{
  setDiscoveryMode(next);
  const url=new URL(window.location.href);url.hash=next==="song"?"discovery-station":"artist-discover";
  if(url.href!==window.location.href)window.history.pushState(window.history.state,"",url);
  if(scroll)requestAnimationFrame(()=>document.getElementById(next==="song"?"discovery-station":"artist-discover")?.scrollIntoView({block:"start",behavior:"instant"}));
 },[]);
 useEffect(()=>{
  const sync=()=>setDiscoveryMode(discoveryModeFromUrl(new URL(window.location.href)));
  sync();const frame=requestAnimationFrame(()=>{if(window.location.hash==="#discovery-station")document.getElementById("discovery-station")?.scrollIntoView({block:"start",behavior:"instant"});});
  window.addEventListener("popstate",sync);window.addEventListener("hashchange",sync);
  return()=>{cancelAnimationFrame(frame);window.removeEventListener("popstate",sync);window.removeEventListener("hashchange",sync);};
 },[]);
 const [query,setQuery]=useState(""),[artist,setArtist]=useState<Artist|null>(null),[candidates,setCandidates]=useState<Artist[]>([]),[related,setRelated]=useState<Artist[]>([]);
 const [genres,setGenres]=useState<Genre[]>([]),[genreSource,setGenreSource]=useState(""),[genreStatus,setGenreStatus]=useState("Search an artist to explore genres.");
 const [genreRetry,setGenreRetry]=useState(0);
 const [genreSourceBusy,setGenreSourceBusy]=useState(false),[genreSourceFailed,setGenreSourceFailed]=useState(false);
 const genreSourceRun=useRef(0),lastArtistMode=useRef<"related"|"genre">("related");
 const genreDisplay=genreDisplayState(genres);
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[note,setNote]=useState(""),[detail,setDetail]=useState<Artist|null>(null);
 const [relatedProvider,setRelatedProvider]=useState("YouTube Music"),[fallbackChoices,setFallbackChoices]=useState<Artist[]>([]);
 const [mode,setMode]=useState<"related"|"genre"|"albums">("related"),[selectedGenre,setSelectedGenre]=useState<Genre|null>(null);
 const [albumReturn,setAlbumReturn]=useState<ArtistReturn|null>(null);
 const [genrePage,setGenrePage]=useState<GenrePage|null>(null),[genreArtists,setGenreArtists]=useState<GenreArtist[]>([]),[genreBusy,setGenreBusy]=useState(false),[genreError,setGenreError]=useState("");
 const run=useRef(0),genreRun=useRef(0),genreRequest=useRef<AbortController|null>(null);
 useEffect(()=>{if(mode!=="albums")lastArtistMode.current=mode;},[mode]);
 const loadArtistGenres=useCallback(async(name:string,artistToken:number)=>{
  const request=++genreSourceRun.current;setGenreSourceBusy(true);setGenreSourceFailed(false);setGenreStatus("Checking genres…");
  try{
   const data=await getGenres(name);if(artistToken!==run.current||request!==genreSourceRun.current)return;
   setGenres(data.genres);setGenreSource(data.sourceUrl);
   setGenreStatus(data.genres.length?(data.notice||""):"No genre tags were found on this artist's source page.");
  }catch(e){if(artistToken===run.current&&request===genreSourceRun.current){setGenreSourceFailed(true);setGenreStatus(e instanceof Error&&e.name!=="TimeoutError"?e.message:"The genre source timed out. Please retry.");}}
  finally{if(artistToken===run.current&&request===genreSourceRun.current)setGenreSourceBusy(false);}
 },[]);
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
 const resetGenre=useCallback(()=>{++genreRun.current;genreRequest.current?.abort();setMode("related");setGenreSourceFailed(false);setGenreSourceBusy(false);setSelectedGenre(null);setGenrePage(null);setGenreArtists([]);setGenreBusy(false);setGenreError("");},[]);
 useEffect(()=>()=>{genreRequest.current?.abort();},[]);
 const selectArtist=useCallback(async(a:Artist,initialMode:"related"|"albums"="related")=>{
  clearArtistReturnMarker();setAlbumReturn(null);
  const token=++run.current;resetGenre();setBusy("Finding related artists…");setError("");setNote("");setCandidates([]);setFallbackChoices([]);setRelatedProvider(a.provider||"YouTube Music");setArtist(a);setRelated([]);setGenres([]);setGenreSource("");setGenreStatus("Checking genres…");
  setMode(initialMode);
  void loadArtistGenres(a.name,token);
  try{const d=await music("artist",a.id,a.name);if(token!==run.current)return;setArtist(d.artist||a);setRelated(d.related);setRelatedProvider(d.provider);setFallbackChoices(d.state==="choose-artist"?d.artists:[]);setNote(d.notice);return {ok:d.state==="ready",artist:d.artist?.name||a.name,count:d.related.length};}
  catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[resetGenre,loadArtistGenres]);
 const search=useCallback(async(name:string,displayName=name,initialMode:"related"|"albums"="related")=>{
  if(!name.trim()){setError("Enter an artist name.");return {ok:false};}
  switchDiscovery("artist");
  clearArtistReturnMarker();setAlbumReturn(null);
  const token=++run.current;resetGenre();setQuery(displayName);setBusy("Searching artists…");setError("");setNote("");setCandidates([]);setFallbackChoices([]);setArtist(null);setRelated([]);setGenres([]);setGenreSource("");setGenreStatus("Select an artist from the results.");
  try{const d=await music("search",name.trim());if(token!==run.current)return {ok:false};
   if(!d.artists.length){setNote("No artists found. Try a different spelling.");return {ok:false};}
   const exact=d.artists.filter(a=>normalize(a.name)===normalize(name));
   if(exact.length===1)return await selectArtist(exact[0],initialMode);
   setCandidates(d.artists);setNote("Choose the artist you are looking for.");return {ok:true,candidates:d.artists.map(a=>a.name)};
  }catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[selectArtist,resetGenre,switchDiscovery]);
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
 const genreProvider=genreSource.startsWith("https://musicbrainz.org/")?"MusicBrainz":"NamuWiki";
 const genreCollectionProvider=selectedGenre?.title.startsWith("musicbrainz:")?"MusicBrainz":"NamuWiki";
 const visible:Artist[]=genreMode?genreArtists.map(a=>({id:"wiki:"+a.id,name:a.name,audience:null,audienceLabel:"",url:a.url,checkedAt:a.checkedAt,wiki:a})):related;
 const score=(a:Artist)=>a.wiki?a.wiki.stars:a.audience;
 const metric=genreMode?(genreCollectionProvider==="MusicBrainz"?"Genre tag votes":"Wiki interest"):relatedProvider==="Deezer"?"Deezer fans":"Monthly audience",activeBusy=genreMode?(genreBusy||genreSourceBusy):!!busy;
 const sorted=[...visible].sort((a,b)=>(score(b)??-1)-(score(a)??-1)||a.name.localeCompare(b.name)),max=Math.max(1,...sorted.map(a=>score(a)??0));
 const cloud=[...sorted.filter((_,i)=>i%2===0).reverse(),...sorted.filter((_,i)=>i%2===1)];
 const activeNote=genreMode?(genreSourceFailed?genreStatus:selectedGenre?"Independent "+genreCollectionProvider+" genre discovery — not filtered from All related.":"Choose a genre in the sidebar.") : note;
 const relatedEmpty=<div role={error?"alert":undefined}><h3>{busy?"LOADING…":fallbackChoices.length?"CHOOSE ARTIST":error?"SOURCE UNAVAILABLE":artist?"NO RELATED ARTISTS":"NO ARTIST SELECTED"}</h3><p>{busy?busy:fallbackChoices.length?note:error|| (artist?note||"No related artists were returned. Explore a genre or retry.":"Search an artist above.")}</p>{!busy&&fallbackChoices.length>0&&<div className="artist-list" aria-label="Choose Deezer artist">{fallbackChoices.map(a=><button key={a.id} onClick={()=>void selectArtist(a)}><b>{a.name}</b><span>{compact(a.audience)} Deezer fans</span></button>)}</div>}{!busy&&artist&&<button className="secondary" onClick={()=>void selectArtist(artist)}>Retry related artists</button>}</div>;
 return <main>
 <header className="topbar"><a className="brand" href="/" aria-label="Genre Atlas home"><span className="wordmark">GENRE<span>ATLAS</span></span></a><span className="top-caption">MUSIC DISCOVERY</span><nav className="station-nav" aria-label="Music discovery"><a href="#discovery-station">Discovery Station</a><a className="quiet" href="https://www.youtube.com/" target="_blank" rel="noreferrer"><Play size={14}/> Listen <ArrowUpRight size={14}/></a><AccountButton/></nav></header>
 <div className="workspace">
 <DiscoveryOnboarding onChoose={next=>{switchDiscovery(next);requestAnimationFrame(()=>{const input=document.getElementById(next==="artist"?"artist-search":"station-search");input?.focus({preventScroll:true});input?.scrollIntoView({block:"center",behavior:"instant"});});}}/>
 <section className="search-deck" aria-label="Music discovery">
 <div className="search-main"><img className="discovery-ornament" src="/reference/white-ornate-clef-v1.png" alt="" aria-hidden="true" width={220} height={390}/><h1>DISCOVER</h1>
 <div className="discovery-switch" role="group" aria-label="Search for"><button aria-pressed={discoveryMode==="artist"} onClick={()=>switchDiscovery("artist")}>Artist</button><button aria-pressed={discoveryMode==="song"} onClick={()=>switchDiscovery("song")}>Song</button></div>
 <div hidden={discoveryMode!=="artist"}>
 <form className="search-form" onSubmit={e=>{e.preventDefault();void search(query);}}><Search size={21}/><label className="sr-only" htmlFor="artist-search">Artist name</label><input id="artist-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search an artist" maxLength={100}/><button className="primary" type="submit" aria-label="Search artists">Search <ArrowRight size={18}/></button></form>
 <div className="suggestions"><span>TRY</span>{["Tame Impala","A$AP Rocky"].map(n=><button key={n} onClick={()=>void search(n)}>{n}</button>)}</div></div>
 <div ref={setSongSearchTarget} hidden={discoveryMode!=="song"} className="song-search-slot"/></div>
 {!account.ready?<div className="personal-playlist-slot" role="status">Checking sign-in…</div>:account.userId?<div ref={setPlaylistTarget} className="personal-playlist-slot" aria-label="Your playlist"/>:<AlbumWall onExploreArtist={name=>{void search(name).then(()=>requestAnimationFrame(()=>{(document.querySelector(".candidate-results")||document.getElementById("artist-discover"))?.scrollIntoView({block:"start",behavior:"instant"});}));}}/>}
 </section>
 <div hidden={discoveryMode!=="artist"} className="artist-workspace">
 {error&&<div className="message error" role="alert">{error}<button onClick={()=>void search(query)}>Try again</button></div>}
 {candidates.length>0&&<section className="candidate-results" aria-label="Artist search results"><h2>SELECT ARTIST</h2><div>{candidates.map(a=><button key={a.id} onClick={()=>void selectArtist(a)}><b>{englishText(a.name,"Artist")}</b><span>{compact(a.audience)} {audienceMetric(a).toLowerCase()}</span><ArrowRight size={17}/></button>)}</div></section>}
 <section className="explorer" id="artist-discover">
 <aside className="artist-panel"><div className="panel-kicker"><span>STARTING POINT</span></div><ArtistCdPlayer artist={artist}/><h2>{englishText(artist?.name,"SELECT ARTIST")}</h2><p className="muted">{artist?compact(artist.audience)+" "+audienceMetric(artist).toLowerCase():"Your search starts here."}</p>{artist&&<a className="source-link" href={youtubeSearchUrl(artist.name)} target="_blank" rel="noreferrer">Listen on YouTube <ArrowUpRight size={14}/></a>}
 <div className="divider"/><span className="eyebrow genre-label">ARTIST RADIO</span><div className="genres"><button className={mode==="related"?"genre active":"genre"} aria-pressed={mode==="related"} onClick={()=>setMode("related")}>All related <span>{busy?"…":error||fallbackChoices.length?"—":related.length}</span></button></div><p className="nav-description">{relatedProvider} recommendations</p>
 <div className="divider"/><span className="eyebrow genre-label">EXPLORE BY GENRE</span><p className="nav-description">A separate artist collection from {genreProvider}</p><div className="genres" aria-busy={genreDisplay.pending>0}>{genreDisplay.visible.map(g=><button key={g.title} className={genreMode&&selectedGenre?.title===g.title?"genre active":"genre"} aria-pressed={genreMode&&selectedGenre?.title===g.title} onClick={()=>void exploreGenre(g)}>{genreLabel(g)}</button>)}{genreStatus&&<p className="muted small">{genreStatus}</p>}{genreDisplay.pending>0&&<p role="status" className="muted small">Checking English genre names…</p>}{genreDisplay.hidden>0&&genreDisplay.pending===0&&<p role="status" className="muted small">{genreDisplay.visible.length?"Genres without a verified English name are hidden.":"No verified English genre names available. Related artists are still available."}</p>}{genreDisplay.hidden>0&&genreDisplay.pending===0&&<button className="secondary" onClick={()=>setGenreRetry(n=>n+1)}>Retry genre names</button>}</div>
 {genreSource&&<a className="source-link genre-source" href={genreSource} target="_blank" rel="noreferrer">Source: {genreProvider} <ArrowUpRight size={13}/></a>}
 {artist&&genreSourceFailed&&<div className="genre-actions"><button className="secondary" disabled={genreSourceBusy} onClick={()=>void loadArtistGenres(artist.name,run.current)}>Retry genre lookup</button><a className="source-link" href={"https://namu.wiki/w/"+encodeURIComponent(artist.name)} target="_blank" rel="noreferrer">Open artist source <ArrowUpRight size={13}/></a></div>}
 </aside>
 <section className="results" aria-busy={mode!=="albums"&&activeBusy}><div className="results-heading"><div><span className="eyebrow">{mode==="albums"?"THE DISCOGRAPHY":"ARTIST DISCOVERY"}</span><h2>{mode==="albums"?"ALBUMS & MORE":"ARTISTS"}</h2></div>{mode!=="albums"&&<span className="count">{String(visible.length).padStart(2,"0")}<span>ARTISTS</span></span>}</div>
 <Tabs className="discovery-modes" value={mode==="albums"?"albums":"artists"} onValueChange={value=>setMode(value==="albums"?"albums":lastArtistMode.current)}><TabsList aria-label="Discovery section"><TabsTrigger value="artists">Artist</TabsTrigger><TabsTrigger value="albums">Albums</TabsTrigger></TabsList><TabsContent value={mode==="albums"?"albums":"artists"}>
 {mode==="albums"?<ArtistAlbums key={artist?.id||"none"} artist={artist} restore={albumReturn?.catalog} onRestored={()=>{if(albumReturn)return restoreAlbumPosition(albumReturn.catalog,albumReturn.scrollY);}} onOpenRelease={catalog=>artist?saveArtistReturn({query,artist,related,genres,genreSource,genreStatus,note,provider:relatedProvider as "YouTube Music"|"Deezer",catalog,scrollY:window.scrollY}):null}/>:<>
 <p className="source-caption">{genreMode?genreCollectionProvider.toUpperCase()+" / GENRE COLLECTION":relatedProvider==="Deezer"?"DEEZER / RELATED ARTISTS":"YOUTUBE MUSIC / FANS MIGHT ALSO LIKE"}</p>
 <Tabs value={genreMode?"genre":"related"} onValueChange={value=>{if(value==="related")setMode("related");else if(!selectedGenre&&genreDisplay.visible[0])void exploreGenre(genreDisplay.visible[0]);else setMode("genre");}}><div className="view-controls"><TabsList aria-label="Artist source"><TabsTrigger value="related">Related</TabsTrigger><TabsTrigger value="genre">Genre</TabsTrigger></TabsList><span className="metric"><Users size={14}/> {metric}</span></div>
 <div className="busy" aria-live="polite">{activeBusy&&<><LoaderCircle className="spin" size={16}/>{genreMode?"Reading genre artists from "+genreCollectionProvider+"…":busy}</>}</div>
 <TabsContent value={genreMode?"genre":"related"}><div className="cloud" aria-label={genreMode?"Genre artist cloud":"Related artist cloud"}>{!activeBusy&&visible.length?cloud.map((a,i)=><button key={a.id} disabled={activeBusy} className={"word color-"+i%4} style={{fontSize:(score(a)===null?1.1:1.1+2.6*Math.sqrt(score(a)!/max))+"rem"}} title={englishText(a.name,"Artist")+" · "+compact(score(a))+" "+metric.toLowerCase()} onClick={()=>setDetail(a)}>{englishText(a.name,"Artist")}</button>):<div className="empty-content"><LoadingArtwork key={(artist?.id||"none")+":"+(artist?.albumArtwork?.imageUrl||"none")} album={artist?.albumArtwork} artistName={artist?.name}/>{genreMode?<div><h3>{activeBusy?"LOADING…":selectedGenre?"NO VERIFIED ARTISTS YET":genreSourceFailed?"GENRE SOURCE UNAVAILABLE":"SELECT A GENRE"}</h3><p>{genreError|| (genreSourceFailed?genreStatus:selectedGenre?"Read more source links below, or open the genre page.":"Choose a genre on the left. This collection is independent of related artists.")}</p></div>:relatedEmpty}</div>}</div></TabsContent>
 </Tabs>
 <div className="cloud-legend"><span><span className="legend-small">A</span><span className="legend-large">A</span> Size = {metric.toLowerCase()}</span><span>Select a name to explore</span></div>{activeNote&&<p className="result-note" role="status">{activeNote}</p>}
 {genreMode&&selectedGenre&&<div className="genre-progress">
 {genrePage&&<p>{genreArtists.length} source-matched artists · {genrePage.nextOffset??genrePage.totalCandidates} / {genrePage.totalCandidates} source entries checked{genrePage.unavailable>0?" · "+genrePage.unavailable+" pages unavailable in the last batch":""}{genrePage.sourceLimited?" · Source coverage is limited":""}</p>}
 {genreError&&<p className="error" role="alert">{genreError}</p>}
 <div className="genre-actions">
 {genrePage?.nextOffset!=null&&<button className="secondary" disabled={genreBusy} onClick={()=>void exploreGenre(selectedGenre,true)}>{genreBusy?"Loading…":"Load more genre artists"}</button>}
 {(genreError||!!genrePage?.unavailable)&&<button className="secondary" disabled={genreBusy} onClick={()=>void exploreGenre(selectedGenre)}>Retry genre</button>}
 <a className="source-link" href={genrePage?.sourceUrl||"https://namu.wiki/w/"+encodeURIComponent(selectedGenre.title)} target="_blank" rel="noreferrer">Open genre source <ArrowUpRight size={13}/></a>
 </div></div>}
 </>}
 </TabsContent></Tabs></section></section>
 <details className="method"><summary>About the data</summary><p>Related artists come only from YouTube Music’s “Fans might also like”. If that source rejects a request or returns no list, we show its availability instead of switching to Deezer. Word sizes use YouTube Music monthly audience. Unknown values use the smallest size. Genre discovery is independent of related artists. When NamuWiki artist genres are unavailable or incomplete, MusicBrainz genre entities are used, with artists selected by exact matching positive genre tags. To reduce stray tags, a match needs at least 10% of that artist’s highest tag vote count. MusicBrainz cloud sizes are tag votes, not listeners. NamuWiki collections are built from genre articles and linked artist directories. Body-linked artists require a matching genre tag; artist-list entries are checked as musicians. NamuWiki cloud sizes use document interest counts, not monthly audience. Only the loaded, verified portion is shown; use Load more to continue. Unavailable genre data never falls back to the related list. Genres are shown only with verified English names; unverified genre names are hidden until they can be checked. Other Korean names without an English alias may use romanized display text, which is not an official translation. Listen links open ordinary YouTube search. Loading artwork comes from the artist’s public Albums section, not a most-popular-album ranking.</p></details>
 </div>
 <DiscoveryStation playlistTarget={playlistTarget} searchTarget={songSearchTarget} active={discoveryMode==="song"} onRequestSong={()=>switchDiscovery("song",true)} onExploreArtist={name=>{switchDiscovery("artist",true);void search(name);}}/>
 <footer><span>GENRE ATLAS © 2026</span><span>Unofficial discovery tool. Data availability may vary.</span></footer>
 </div>
 <Sheet open={!!detail} onOpenChange={o=>{if(!o)setDetail(null);}}><SheetContent className="detail-sheet"><SheetHeader><span className="eyebrow">ARTIST / DETAILS</span><SheetTitle className="detail-title">{englishText(detail?.name,"Artist")}</SheetTitle><SheetDescription>{detail?.wiki?"From the "+(detail.wiki.provider||"NamuWiki")+" genre collection. Not a related-artist recommendation.":"Related to "+englishText(artist?.name,"Artist")+" on "+(detail?.provider||"YouTube Music")+"."}</SheetDescription></SheetHeader>{detail&&<div className="sheet-body"><div className="stat"><Users/><span>{detail.wiki?(detail.wiki.provider==="MusicBrainz"?"Genre tag votes":"NamuWiki document interest"):audienceMetric(detail)}</span><strong>{compact(detail.wiki?detail.wiki.stars:detail.audience)}</strong></div><p className="muted">Source: {detail.wiki?(detail.wiki.provider==="MusicBrainz"?"MusicBrainz genre tag votes":"NamuWiki document bookmarks"):englishText(detail.audienceLabel)}<br/>Checked: {new Date(detail.checkedAt).toLocaleString("en-US")}<br/>{detail.wiki?"Source votes/bookmarks are not listener counts or recommendation confidence.":detail.metric==="deezer-fans"?"Fan count on Deezer, not monthly listeners or plays.":"Rounded figures from the public artist page."}</p>{detail.wiki&&<a className="source-link" href={detail.wiki.sourceUrl} target="_blank" rel="noreferrer">{detail.wiki.evidence==="list"?"Listed in the genre artist section":"Matching artist genre tag in the source"} <ArrowUpRight size={13}/></a>}<a className="source-link" href={detail.url} target="_blank" rel="noreferrer">Artist source: {detail.wiki?(detail.wiki.provider||"NamuWiki"):detail.provider||"YouTube Music"} <ArrowUpRight size={13}/></a><a className="primary" href={youtubeSearchUrl(detail.name)} target="_blank" rel="noreferrer"><Play size={17}/> Listen on YouTube <ArrowUpRight size={17}/></a><button className="secondary" onClick={()=>{const a=detail;setDetail(null);setQuery(englishText(a.name,"Artist"));if(a.wiki)void search(a.wiki.title,englishText(a.name,"Artist"));else void selectArtist(a);}}><RotateCcw size={16}/> Explore this artist</button></div>}</SheetContent></Sheet>
 </main>;
}
