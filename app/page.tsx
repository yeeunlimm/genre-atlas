"use client";
import {useState,useRef,useEffect,useCallback} from "react";
import {Search,ArrowUpRight,AudioLines,ArrowRight,LoaderCircle,Info,Users,RotateCcw,Play} from "lucide-react";
import {Sheet,SheetContent,SheetHeader,SheetTitle,SheetDescription} from "@/components/ui/sheet";
import {Tabs,TabsList,TabsTrigger,TabsContent} from "@/components/ui/tabs";
type Artist={id:string;name:string;audience:number|null;audienceLabel:string;url:string;checkedAt:string;subscribers?:number|null};
type Genre={name:string;title:string};
type Result={artist:Artist;related:Artist[];artists:Artist[];error?:string};
const compact=(n:number|null)=>n===null?"미확인":new Intl.NumberFormat("ko-KR",{notation:"compact",maximumFractionDigits:1}).format(n);
const normalize=(s:string)=>s.toLocaleLowerCase().replace(/[\s._'’()-]/g,"");
async function music(kind:string,q:string):Promise<Result>{const r=await fetch("/api/music?kind="+kind+"&q="+encodeURIComponent(q),{cache:"no-store"});const d=await r.json() as Result;if(!r.ok)throw new Error(d.error||"검색 중 문제가 발생했습니다.");return d;}
async function getGenres(name:string):Promise<{genres:Genre[];title:string}>{
 const r=await fetch("/api/namu?kind=artist&title="+encodeURIComponent(name),{cache:"no-store"});
 if(!r.ok)throw new Error("장르 정보 미확인");
 const d=await r.json() as {genres:Genre[];title:string};return d;
}
export default function Home(){
 const [query,setQuery]=useState(""),[artist,setArtist]=useState<Artist|null>(null),[candidates,setCandidates]=useState<Artist[]>([]),[related,setRelated]=useState<Artist[]>([]),[visible,setVisible]=useState<Artist[]>([]);
 const [genres,setGenres]=useState<Genre[]>([]),[activeGenre,setActiveGenre]=useState(""),[genreSource,setGenreSource]=useState(""),[genreStatus,setGenreStatus]=useState("가수를 검색하면 장르를 확인합니다.");
 const [busy,setBusy]=useState(""),[error,setError]=useState(""),[note,setNote]=useState(""),[detail,setDetail]=useState<Artist|null>(null);
 const run=useRef(0),filterRun=useRef(0),genreCache=useRef(new Map<string,Genre[]>());
 const selectArtist=useCallback(async(a:Artist)=>{
  const token=++run.current;++filterRun.current;setBusy("YouTube Music에서 비슷한 가수를 찾고 있습니다");setError("");setNote("");setCandidates([]);setArtist(a);setRelated([]);setVisible([]);setGenres([]);setGenreSource("");setActiveGenre("");setGenreStatus("장르 정보를 확인하고 있습니다…");
  void getGenres(a.name).then(d=>{if(token!==run.current)return;setGenres(d.genres);setGenreSource("https://namu.wiki/w/"+encodeURIComponent(d.title));genreCache.current.set(a.id,d.genres);setGenreStatus(d.genres.length?"":"이 가수의 장르 항목은 확인되지 않았습니다.");}).catch(()=>{if(token===run.current)setGenreStatus("장르 정보를 찾지 못했습니다. 비슷한 가수 추천은 계속 이용할 수 있어요.");});
  try{const d=await music("artist",a.id);if(token!==run.current)return;setArtist(d.artist);setRelated(d.related);setVisible(d.related);setNote(d.related.length?"YouTube Music의 ‘Fans might also like’ 목록을 월간 청중 수로 정렬했습니다. 전체 가수 순위는 아닙니다.":"공개 페이지에 비슷한 아티스트 목록이 없습니다. 다른 가수에서 시작해 보세요.");return {ok:true,artist:d.artist.name,count:d.related.length};}
  catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[]);
 const search=useCallback(async(name:string)=>{
  if(!name.trim()){setError("가수 이름을 입력해 주세요.");return {ok:false};}
  const token=++run.current;++filterRun.current;setQuery(name);setBusy("YouTube Music에서 가수를 검색하고 있습니다");setError("");setNote("");setCandidates([]);setArtist(null);setRelated([]);setVisible([]);setGenres([]);setActiveGenre("");setGenreSource("");setGenreStatus("검색 결과에서 가수를 선택해 주세요.");
  try{const d=await music("search",name.trim());if(token!==run.current)return {ok:false};
   if(!d.artists.length){setNote("검색 결과가 없습니다. 한글·영문 이름을 바꿔 검색해 보세요.");return {ok:false};}
   const exact=d.artists.filter(a=>normalize(a.name)===normalize(name));
   if(exact.length===1)return await selectArtist(exact[0]);
   setCandidates(d.artists);setNote("같은 이름의 가수가 있을 수 있습니다. 찾으시는 가수를 선택해 주세요.");return {ok:true,candidates:d.artists.map(a=>a.name)};
  }catch(e){if(token===run.current)setError((e as Error).message);return {ok:false,error:(e as Error).message};}
  finally{if(token===run.current)setBusy("");}
 },[selectArtist]);
 async function filterGenre(g:Genre|null){
  const token=++filterRun.current,seed=run.current;setActiveGenre(g?.title||"");setError("");
  if(!g){setVisible(related);setBusy("");setNote("YouTube Music의 비슷한 아티스트 전체 목록입니다.");return;}
  setBusy("추천된 가수들의 장르를 확인하고 있습니다");setVisible([]);setNote("");
  const matches:Artist[]=[];let index=0,unknown=0;
  await Promise.all(Array.from({length:3},async()=>{
   while(index<related.length&&token===filterRun.current&&seed===run.current){
    const a=related[index++];try{
     let gs=genreCache.current.get(a.id);if(!gs){gs=(await getGenres(a.name)).genres;genreCache.current.set(a.id,gs);}
     if(!gs.length)unknown++;if(gs.some(x=>x.title===g.title))matches.push(a);
    }catch{unknown++;}
   }
  }));
  if(token===filterRun.current&&seed===run.current){setVisible(matches);setBusy("");setNote("추천 "+related.length+"팀 중 ‘"+g.name+"’가 확인된 "+matches.length+"팀"+(unknown?" · 장르 미확인 "+unknown+"팀 제외":"")+". 장르는 나무위키 기준이며 YouTube Music 자체 분류가 아닙니다.");}
 }
 useEffect(()=>{
  const ctx=(document as unknown as {modelContext?:{registerTool:(t:unknown,o:unknown)=>Promise<void>}}).modelContext;if(!ctx)return;
  const c=new AbortController();try{Promise.resolve(ctx.registerTool({name:"search_artist",description:"YouTube Music에서 가수를 검색하고 비슷한 가수 워드클라우드를 표시합니다.",inputSchema:{type:"object",properties:{name:{type:"string"}},required:["name"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async(x:{name:string})=>{if(typeof x?.name!=="string"||!x.name.trim()||x.name.length>100)throw new Error("가수 이름은 1~100자여야 합니다.");return search(x.name);}},{signal:c.signal})).catch(()=>{});}catch{}return()=>c.abort();
 },[search]);
 const sorted=[...visible].sort((a,b)=>(b.audience??-1)-(a.audience??-1)||a.name.localeCompare(b.name)),max=Math.max(1,...sorted.map(a=>a.audience??0));
 const cloud=[...sorted.filter((_,i)=>i%2===0).reverse(),...sorted.filter((_,i)=>i%2===1)];
 return <main>
 <header className="topbar"><a className="brand" href="/" aria-label="Genre Atlas 처음으로"><span className="wordmark">GENRE<span>ATLAS</span><sup>®</sup></span></a><span className="top-caption">AN INDEPENDENT<br/>MUSIC DISCOVERY ARCHIVE</span><a className="quiet" href="https://music.youtube.com/" target="_blank" rel="noreferrer"><Play size={16}/> YouTube Music <ArrowUpRight size={14}/></a></header>
 <div className="workspace">
 <section className="intro"><div><span className="eyebrow">SIDE A — FIND YOUR NEXT OBSESSION</span><h1>취향은 이어지고,<br/><em>음악은 남는다.</em></h1><p>좋아하는 가수 한 명에서 시작하는, 나만의 음악 아카이브.</p></div><div className="reference-collage" aria-hidden="true"><img className="collage-cds" src="/reference/cd-collection.png" alt=""/><img className="collage-disc" src="/reference/silver-disc.png" alt=""/><span className="collage-sticker">GOOD MUSIC.<br/>NO END.</span><span className="collage-caption">VOL. 01 / THE DISCOVERY SESSIONS</span></div></section>
 <form className="search-form" onSubmit={e=>{e.preventDefault();void search(query);}}><Search size={23}/><label className="sr-only" htmlFor="artist-search">가수 이름</label><input id="artist-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="가수 이름을 한글 또는 영어로 검색하세요" maxLength={100}/><button className="primary" type="submit">가수 찾기 <ArrowRight size={18}/></button></form>
 <div className="suggestions"><span>이 가수부터 시작해 보세요</span>{["Tame Impala","Radiohead","아이유","잔나비"].map(n=><button key={n} onClick={()=>void search(n)}>{n}<ArrowUpRight size={13}/></button>)}</div>
 {error&&<div className="message error" role="alert">{error}<button onClick={()=>void search(query)}>다시 검색</button></div>}
 {candidates.length>0&&<section className="candidate-results" aria-label="가수 검색 결과"><h2>찾으시는 가수를 선택해 주세요</h2><div>{candidates.map(a=><button key={a.id} onClick={()=>void selectArtist(a)}><b>{a.name}</b><span>월간 청중 {compact(a.audience)}</span><ArrowRight size={17}/></button>)}</div></section>}
 <section className="explorer">
 <aside className="artist-panel"><div className="tape-label"><span>NOW EXPLORING</span><span>SIDE A / 90</span></div><div className="cassette-art"><img src="/reference/cassette.png" alt="은빛 투명 카세트테이프"/><span className="cassette-note">{artist?.name||"YOUR NEXT MIX"}</span></div><h2>{artist?.name||"나의 시작점"}</h2><p className="muted">{artist?"월간 청중 "+compact(artist.audience):"가수를 검색하면\n음악 취향의 연결이 나타나요."}</p>{artist&&<a className="source-link" href={artist.url} target="_blank" rel="noreferrer">YouTube Music에서 듣기 <ArrowUpRight size={14}/></a>}
 <div className="divider"/><span className="eyebrow genre-label">TRACKLIST / 장르로 좁혀 보기</span><div className="genres">{artist&&<button className={!activeGenre?"genre active":"genre"} onClick={()=>void filterGenre(null)}>비슷한 가수 전체 <span>{related.length}</span></button>}{genres.map(g=><button key={g.title} className={activeGenre===g.title?"genre active":"genre"} onClick={()=>void filterGenre(g)}>{g.name}<ArrowUpRight size={18}/></button>)}{genreStatus&&<p className="muted small">{genreStatus}</p>}</div>
 {genreSource&&<a className="source-link genre-source" href={genreSource} target="_blank" rel="noreferrer">장르 출처 · 나무위키 <ArrowUpRight size={13}/></a>}
 <div className="panel-foot"><img src="/reference/music-wall.png" alt="Only music can save us" loading="lazy"/><span>추천 · YouTube Music / 장르 · 나무위키</span></div></aside>
 <section className="results"><div className="results-heading"><div><span className="eyebrow">SIDE B — THE DISCOVERY CLOUD</span><h2>{activeGenre|| (artist?artist.name+"에서 이어지는 음악":"당신의 다음 취향")}</h2></div><span className="count">{String(visible.length).padStart(2,"0")}<span>ARTISTS</span></span></div>
 <Tabs defaultValue="cloud"><div className="view-controls"><TabsList aria-label="결과 보기"><TabsTrigger value="cloud">워드클라우드</TabsTrigger><TabsTrigger value="list">목록 보기</TabsTrigger></TabsList><span className="metric"><Users size={14}/> 월간 청중순</span></div>
 <div className="busy" aria-live="polite">{busy&&<><LoaderCircle className="spin" size={16}/>{busy}</>}</div>
 <TabsContent value="cloud"><div className="cloud" aria-label="추천 가수 워드클라우드">{visible.length?cloud.map((a,i)=><button key={a.id} className={"word color-"+i%4} style={{fontSize:(a.audience===null?1.1:1.1+2.6*Math.sqrt(a.audience/max))+"rem"}} title={a.name+" · 월간 청중 "+compact(a.audience)} onClick={()=>setDetail(a)}>{a.name}</button>):<div className="empty-content"><img className="empty-disc" src="/reference/silver-disc.png" alt="투명 케이스 속 은빛 디스크"/><h3>{busy?"FINDING YOUR FREQUENCY…":activeGenre?"아직 연결되지 않은 장르":"PRESS PLAY ON DISCOVERY."}</h3><p>{activeGenre?"‘비슷한 가수 전체’를 눌러 다른 연결을 만나보세요.":"가수 이름 하나면 충분해요.\n로그인이나 별도 설정 없이 탐색하세요."}</p></div>}</div></TabsContent>
 <TabsContent value="list"><div className="artist-list">{sorted.length?sorted.map(a=><button key={a.id} onClick={()=>setDetail(a)}><span className="rank">{a.audience===null?"—":String(sorted.findIndex(x=>x.audience===a.audience)+1).padStart(2,"0")}</span><b>{a.name}</b><span>{compact(a.audience)}</span><ArrowUpRight size={16}/></button>):<p className="list-empty">검색 후 추천 가수 목록을 확인할 수 있어요.</p>}</div></TabsContent></Tabs>
 <div className="cloud-legend"><span><span className="legend-small">가</span><span className="legend-large">가</span> 클수록 월간 청중이 많아요</span><span>이름을 눌러 자세히 보기</span></div>{note&&<p className="result-note" role="status">{note}</p>}
 </section></section>
 <div className="method"><Info size={18}/><p><b>추천과 크기의 기준</b> YouTube Music의 공개된 비슷한 아티스트 목록과 월간 청중(monthly audience)을 사용합니다. 표시 수치는 반올림된 값이며 청취 횟수·구독자 수와 다릅니다. 미확인 값은 작은 동일 크기로 표시합니다. 장르 필터는 나무위키에서 확인된 경우에만 적용합니다.</p></div>
 <footer><span className="footer-mark">GENRE ATLAS<span>KEEP DIGGING. KEEP LISTENING.</span></span><span>비공식 음악 탐색 도구<br/>공개 페이지 변경·접근 제한 시 일시 중단될 수 있습니다.</span><span className="footer-number">A—B / 001</span></footer>
 </div>
 <Sheet open={!!detail} onOpenChange={o=>{if(!o)setDetail(null);}}><SheetContent className="detail-sheet"><SheetHeader><span className="eyebrow">ARTIST SPOTLIGHT</span><SheetTitle className="detail-title">{detail?.name}</SheetTitle><SheetDescription>{artist?.name}의 비슷한 아티스트 목록에서 발견했어요.</SheetDescription></SheetHeader>{detail&&<div className="sheet-body"><div className="stat"><Users/><span>YouTube Music 월간 청중</span><strong>{compact(detail.audience)}</strong></div><p className="muted">원문 표기: {detail.audienceLabel||"미확인"}<br/>확인: {new Date(detail.checkedAt).toLocaleString("ko-KR")}<br/>이 수치는 공개 페이지의 반올림된 참고 지표입니다.</p><a className="primary" href={detail.url} target="_blank" rel="noreferrer"><Play size={17}/> YouTube Music에서 듣기 <ArrowUpRight size={17}/></a><button className="secondary" onClick={()=>{const a=detail;setDetail(null);setQuery(a.name);void selectArtist(a);}}><RotateCcw size={16}/> 이 가수에서 다시 탐색</button></div>}</SheetContent></Sheet>
 </main>;
}
