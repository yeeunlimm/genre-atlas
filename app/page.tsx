"use client";
import {useState,useRef,useEffect,useCallback} from "react";
import {Search,ArrowUpRight,ArrowRight,LoaderCircle,Users,RotateCcw,Play} from "lucide-react";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
type Artist={id:string;name:string;audience:number|null;audienceLabel:string;url:string;checkedAt:string;subscribers?:number|null};
import {genreLabel,genreOutcome,type Genre} from "@/lib/genre-view";
type Result={artist:Artist;related:Artist[];artists:Artist[];error?:string};
const compact=(n:number|null)=>n===null?"Unavailable":new Intl.NumberFormat("en-US",{notation:"compact",maximumFractionDigits:1}).format(n);
const normalize=(s:string)=>s.toLocaleLowerCase().replace(/[\s._'’()-]/g,"");
async function music(kind:string,q:string):Promise<Result>{const r=await fetch("/api/music?kind="+kind+"&q="+encodeURIComponent(q),{cache:"no-store"});const d=await r.json() as Result;if(!r.ok)throw new Error((r.status===429?"Too many requests. Please try again shortly.":"Music search is unavailable. Please try again."));return d;}
async function getGenres(name:string):Promise<{genres:Genre[];title:string}>{
 const r=await fetch("/api/namu?kind=artist&title="+encodeURIComponent(name),{cache:"no-store"});
 if(!r.ok)throw new Error("Genre source unavailable");
 const d=await r.json() as {genres:Genre[];title:string};return d;
}
export default function Home(){
 const [query,setQuery]=useState(""),[artist,setArtist]=useState<Artist|null>(null),[candidates,setCandidates]=useState<Artist[]>([]),[related,setRelated]=useState<Artist[]>([]),[visible,setVisible]=useState<Artist[]>([]);
 const [genres,setGenres]=useState<Genre[]>([]),[activeGenre,setActiveGenre]=useState(""),[genreSource,setGenreSource]=useState(""),[genreStatus,setGenreStatus]=useState("Search an artist to explore genres.");
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[note,setNote]=useState(""),[detail,setDetail]=useState<Artist|null>(null);
 const run=useRef(0),filterRun=useRef(0),genreCache=useRef(new Map<string,Genre[]>());
 const selectArtist=useCallback(async(a:Artist)=>{
  const token=++run.current;++filterRun.current;setBusy("Finding related artists…");setError("");setNote("");setCandidates([]);setArtist(a);setRelated([]);setVisible([]);setGenres([]);setGenreSource("");setActiveGenre("");setGenreStatus("Checking genres…");
  void getGenres(a.name).then(d=>{if(token!==run.current)return;setGenres(d.genres);setGenreSource("https://namu.wiki/w/"+encodeURIComponent(d.title));genreCache.current.set(a.id,d.genres);setGenreStatus(d.genres.length?"":"No genre tags found. Related artists are still available.");}).catch(()=>{if(token===run.current)setGenreStatus("Genre source unavailable. Related artists are still available.");});
  try{const d=await music("artist",a.id);if(token!==run.current)return;setArtist(d.artist);setRelated(d.related);setVisible(d.related);setNote(d.related.length?"Related artists from YouTube Music, ranked by monthly audience.":"No related artists on this public page. Try another artist.");return {ok:true,artist:d.artist.name,count:d.related.length};}
  catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[]);
 const search=useCallback(async(name:string)=>{
  if(!name.trim()){setError("Enter an artist name.");return {ok:false};}
  const token=++run.current;++filterRun.current;setQuery(name);setBusy("Searching artists…");setError("");setNote("");setCandidates([]);setArtist(null);setRelated([]);setVisible([]);setGenres([]);setActiveGenre("");setGenreSource("");setGenreStatus("Select an artist from the results.");
  try{const d=await music("search",name.trim());if(token!==run.current)return {ok:false};
   if(!d.artists.length){setNote("No artists found. Try a different spelling.");return {ok:false};}
   const exact=d.artists.filter(a=>normalize(a.name)===normalize(name));
   if(exact.length===1)return await selectArtist(exact[0]);
   setCandidates(d.artists);setNote("Choose the artist you are looking for.");return {ok:true,candidates:d.artists.map(a=>a.name)};
  }catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[selectArtist]);
 async function filterGenre(g:Genre|null){
  const token=++filterRun.current,seed=run.current;setActiveGenre(g?.title||"");setError("");
  if(!g){setVisible(related);setBusy("");setNote("All related artists from YouTube Music.");return;}
  setBusy("Checking genre matches…");setNote("");
  const matches:Artist[]=[];let index=0,unknown=0;
  await Promise.all(Array.from({length:3},async()=>{
   while(index<related.length&&token===filterRun.current&&seed===run.current){
    const a=related[index++];try{
     let gs=genreCache.current.get(a.id);if(!gs){gs=(await getGenres(a.name)).genres;genreCache.current.set(a.id,gs);}
     if(!gs.length)unknown++;if(gs.some(x=>x.title===g.title))matches.push(a);
    }catch{unknown++;}
   }
  }));
  if(token===filterRun.current&&seed===run.current){
   const outcome=genreOutcome(related.length,matches.length,unknown,genreLabel(g));
   setVisible(outcome.fallback?related:matches);
   if(outcome.fallback)setActiveGenre("");
   setBusy("");setNote(outcome.note);
  }
 }
 useEffect(()=>{
  const ctx=(document as unknown as {modelContext?:{registerTool:(t:unknown,o:unknown)=>Promise<void>}}).modelContext;if(!ctx)return;
  const c=new AbortController();try{Promise.resolve(ctx.registerTool({name:"search_artist",description:"Search YouTube Music artists and display related artists.",inputSchema:{type:"object",properties:{name:{type:"string"}},required:["name"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(x:{name:string})=>{if(typeof x?.name!=="string"||!x.name.trim()||x.name.length>100)throw new Error("Artist name must be 1–100 characters.");return search(x.name);}},{signal:c.signal})).catch(()=>{});}catch{}return()=>c.abort();
 },[search]);
 const sorted=[...visible].sort((a,b)=>(b.audience??-1)-(a.audience??-1)||a.name.localeCompare(b.name)),max=Math.max(1,...sorted.map(a=>a.audience??0));
 const cloud=[...sorted.filter((_,i)=>i%2===0).reverse(),...sorted.filter((_,i)=>i%2===1)];
 return <main>
 <header className="topbar"><a className="brand" href="/" aria-label="Genre Atlas home"><span className="wordmark">GENRE<span>ATLAS</span></span></a><span className="top-caption">MUSIC DISCOVERY / VOL. 01</span><a className="quiet" href="https://music.youtube.com/" target="_blank" rel="noreferrer"><Play size={14}/> Listen <ArrowUpRight size={14}/></a></header>
 <div className="workspace">
 <section className="search-deck" aria-label="Artist discovery">
 <div className="search-main"><h1>DISCOVER</h1>
 <form className="search-form" onSubmit={e=>{e.preventDefault();void search(query);}}><Search size={21}/><label className="sr-only" htmlFor="artist-search">Artist name</label><input id="artist-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search an artist" maxLength={100}/><button className="primary" type="submit" aria-label="Search artists">Search <ArrowRight size={18}/></button></form>
 <div className="suggestions"><span>TRY</span>{["Tame Impala","Radiohead","IU","Jannabi"].map(n=><button key={n} onClick={()=>void search(n)}>{n}</button>)}</div></div>
 <img className="deck-art" src="/reference/cd-collection.png" alt="A collection of handwritten CDs"/>
 </section>
 {error&&<div className="message error" role="alert">{error}<button onClick={()=>void search(query)}>Try again</button></div>}
 {candidates.length>0&&<section className="candidate-results" aria-label="Artist search results"><h2>SELECT ARTIST</h2><div>{candidates.map(a=><button key={a.id} onClick={()=>void selectArtist(a)}><b>{a.name}</b><span>{compact(a.audience)} monthly audience</span><ArrowRight size={17}/></button>)}</div></section>}
 <section className="explorer">
 <aside className="artist-panel"><div className="panel-kicker"><span>01 / STARTING POINT</span></div><div className="cassette-art"><img src="/reference/cassette.png" alt="Transparent cassette tape"/><span className="cassette-note">{artist?.name||"SIDE A"}</span></div><h2>{artist?.name||"SELECT ARTIST"}</h2><p className="muted">{artist?compact(artist.audience)+" monthly audience":"Your search starts here."}</p>{artist&&<a className="source-link" href={artist.url} target="_blank" rel="noreferrer">Listen on YouTube Music <ArrowUpRight size={14}/></a>}
 <div className="divider"/><span className="eyebrow genre-label">GENRES</span><div className="genres">{artist&&<button disabled={!!busy} className={!activeGenre?"genre active":"genre"} onClick={()=>void filterGenre(null)}>All related <span>{related.length}</span></button>}{genres.map(g=><button key={g.title} disabled={!!busy||!related.length} className={activeGenre===g.title?"genre active":"genre"} aria-pressed={activeGenre===g.title} onClick={()=>void filterGenre(g)}>{genreLabel(g)}</button>)}{genreStatus&&<p className="muted small">{genreStatus}</p>}</div>
 {genreSource&&<a className="source-link genre-source" href={genreSource} target="_blank" rel="noreferrer">Source: NamuWiki <ArrowUpRight size={13}/></a>}
 </aside>
 <section className="results" aria-busy={!!busy}><div className="results-heading"><div><span className="eyebrow">02 / DISCOVERY</span><h2>{activeGenre?genreLabel(genres.find(g=>g.title===activeGenre)||{title:activeGenre,name:activeGenre}):"RELATED ARTISTS"}</h2></div><span className="count">{String(visible.length).padStart(2,"0")}<span>ARTISTS</span></span></div>
 <Tabs defaultValue="cloud"><div className="view-controls"><TabsList aria-label="Result view"><TabsTrigger value="cloud">Cloud</TabsTrigger><TabsTrigger value="list">List</TabsTrigger></TabsList><span className="metric"><Users size={14}/> Monthly audience</span></div>
 <div className="busy" aria-live="polite">{busy&&<><LoaderCircle className="spin" size={16}/>{busy}</>}</div>
 <TabsContent value="cloud"><div className="cloud" aria-label="Related artist cloud">{visible.length?cloud.map((a,i)=><button key={a.id} disabled={!!busy} className={"word color-"+i%4} style={{fontSize:(a.audience===null?1.1:1.1+2.6*Math.sqrt(a.audience/max))+"rem"}} title={a.name+" · "+compact(a.audience)+" monthly audience"} onClick={()=>setDetail(a)}>{a.name}</button>):<div className="empty-content"><img className="empty-disc" src="/reference/silver-disc.png" alt="Silver disc in a clear case"/><div><h3>{busy?"LOADING…":artist?"NO RESULTS":"NO ARTIST SELECTED"}</h3><p>{artist?"Try another artist to continue.":"Search an artist above."}</p></div></div>}</div></TabsContent>
 <TabsContent value="list"><div className="artist-list">{sorted.length?sorted.map(a=><button key={a.id} disabled={!!busy} onClick={()=>setDetail(a)}><span className="rank">{a.audience===null?"—":String(sorted.findIndex(x=>x.audience===a.audience)+1).padStart(2,"0")}</span><b>{a.name}</b><span>{compact(a.audience)}</span><ArrowUpRight size={16}/></button>):<p className="list-empty">Search an artist to see related artists.</p>}</div></TabsContent></Tabs>
 <div className="cloud-legend"><span><span className="legend-small">A</span><span className="legend-large">A</span> Size = monthly audience</span><span>Select a name to explore</span></div>{note&&<p className="result-note" role="status">{note}</p>}
 </section></section>
 <details className="method"><summary>About the data</summary><p>Recommendations come from YouTube Music’s “Fans might also like”. Size reflects rounded monthly audience, not plays or subscribers. Unknown values use the smallest size. Genre filters check this recommendation set against NamuWiki, not every artist in a genre. If no match can be verified, all related artists remain visible.</p></details>
 <footer><span>GENRE ATLAS © 2026</span><span>Unofficial discovery tool. Data availability may vary.</span></footer>
 </div>
 <Sheet open={!!detail} onOpenChange={o=>{if(!o)setDetail(null);}}><SheetContent className="detail-sheet"><SheetHeader><span className="eyebrow">ARTIST / DETAILS</span><SheetTitle className="detail-title">{detail?.name}</SheetTitle><SheetDescription>Related to {artist?.name} on YouTube Music.</SheetDescription></SheetHeader>{detail&&<div className="sheet-body"><div className="stat"><Users/><span>Monthly audience</span><strong>{compact(detail.audience)}</strong></div><p className="muted">Source: {detail.audienceLabel||"Unavailable"}<br/>Checked: {new Date(detail.checkedAt).toLocaleString("en-US")}<br/>Rounded figures from the public artist page.</p><a className="primary" href={detail.url} target="_blank" rel="noreferrer"><Play size={17}/> Listen on YouTube Music <ArrowUpRight size={17}/></a><button className="secondary" onClick={()=>{const a=detail;setDetail(null);setQuery(a.name);void selectArtist(a);}}><RotateCcw size={16}/> Explore this artist</button></div>}</SheetContent></Sheet>
 </main>;
}
