const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const modules=new Map();
function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const m={exports:{}};modules.set(file,m.exports);
 new Function('exports','module','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,id=>{
  if(id.endsWith('review-analyzer.mjs'))return {reviewEligibility:text=>text.startsWith('I '),sentiment:async text=>text.includes('hate')?{positive:.05,neutral:.05,negative:.9}:{positive:.9,neutral:.05,negative:.05}};
  return id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id);
 });return m.exports;}
const {matchReviewVideo,findReviewVideo,ReviewProviderError}=load('lib/youtube-review-match.ts');
const {analyzePlaylistTrack,reviewAvailability}=load('lib/playlist-review-service.ts');
const {playlistReviewStream}=load('lib/playlist-review-stream.ts');
const {readReviewStream}=load('lib/read-review-stream.ts');
const {shortlistLikedCandidates,selectLikedPlaylist,reviewKey}=load('lib/liked-playlist.ts');
const {blankMemory}=load('lib/hybrid-station.ts');
const {stationCatalog}=load('lib/station-catalog.ts');
const video=(title='Artist - Song (Official Audio)',channel='ArtistVEVO',duration='PT3M')=>({id:'abcdefghijk',snippet:{title,channelTitle:channel,categoryId:'10'},contentDetails:{duration}});
const song={title:'Song',artist:'Artist',durationMs:180000};
(async()=>{
 assert.equal(matchReviewVideo(song,[video()]).id,'abcdefghijk');
 assert.equal(matchReviewVideo(song,[video('Song','Artist - Topic')]).id,'abcdefghijk');
 for(const bad of [video('Song (made popular by Artist)','Party Tyme'),video('Artist - Song (Official Audio)','Random Reuploader'),video('Artist - Song remix'),video('Artist - Song live'),video(undefined,undefined,'PT12M'),video('Artist - Another Song')])assert.equal(matchReviewVideo(song,[bad]),null);
 assert.equal(matchReviewVideo({title:'Song Pt. 2',artist:'Artist'},[video('Artist - Song')]),null);
 assert.equal(matchReviewVideo({title:'Song (Remix)',artist:'Artist'},[video('Artist - Song (Remix)')]).id,'abcdefghijk');
 let lookupCalls=0;
 const matched=await findReviewVideo(song,'fixture-key',new AbortController().signal,async(url,init)=>{lookupCalls++;assert.ok(!String(url).includes('fixture-key'));assert.equal(init.headers['X-Goog-Api-Key'],'fixture-key');return Response.json(String(url).includes('/search?')?{items:[{id:{videoId:'abcdefghijk'}}]}:{items:[video()]});});
 assert.equal(lookupCalls,2);assert.equal(matched.id,'abcdefghijk');
 await assert.rejects(findReviewVideo(song,'fixture-key',new AbortController().signal,async()=>Response.json({error:{errors:[{reason:'quotaExceeded'}]}},{status:403})),e=>e instanceof ReviewProviderError&&e.kind==='quota');
 assert.equal(reviewAvailability({}).ready,false);assert.equal(reviewAvailability({YOUTUBE_DERIVED_METRICS_APPROVED:'true'}).ready,false);

 const oldFetch=global.fetch,oldKey=process.env.YOUTUBE_API_KEY,oldApproval=process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
 let externalCalls=0;
 try{
  process.env.YOUTUBE_API_KEY='fixture-key';delete process.env.YOUTUBE_DERIVED_METRICS_APPROVED;
  global.fetch=async()=>{externalCalls++;throw new Error('must not run');};
  await assert.rejects(analyzePlaylistTrack(song,new AbortController().signal));assert.equal(externalCalls,0);
  process.env.YOUTUBE_DERIVED_METRICS_APPROVED='true';
  const seed=stationCatalog[0];
  const candidates=Array.from({length:30},(_,i)=>({track:{...seed,id:'r'+i,recordingId:'r'+i,title:'Song '+i,artist:'Artist '+i,primaryArtistName:'Artist '+i,artistId:'a'+i,album:'album'+i,albumFamily:'family'+i,durationMs:180000},score:0,reasons:[],paths:[{route:'credits',seedId:seed.id,confidence:1-i*.01}]}));
  const shortlist=shortlistLikedCandidates(candidates,[seed],blankMemory(),{});
  const videos=new Map();
  global.fetch=async(url)=>{
   externalCalls++;const u=new URL(url);
   if(u.pathname.endsWith('/search')){const i=Number(/Song (\d+)/.exec(u.searchParams.get('q'))[1]),id='fixture'+String(i).padStart(4,'0');videos.set(id,i);return Response.json({items:[{id:{videoId:id}}]});}
   const id=u.searchParams.get('id')||u.searchParams.get('videoId'),i=videos.get(id);
   if(u.pathname.endsWith('/videos'))return Response.json({items:[{...video('Song '+i,'Artist '+i+' - Topic'),id}]});
   assert.ok(u.pathname.endsWith('/commentThreads'));
   return Response.json({items:[{id:'comment-'+i,snippet:{topLevelComment:{snippet:{textDisplay:i<6?'I hate this song.':'I love this song.'}}}}]});
  };
  const events=[];let released=0;
  await readReviewStream(new Response(playlistReviewStream(shortlist.map(r=>r.track),analyzePlaylistTrack,new AbortController().signal,()=>{released++;})),e=>events.push(e),new AbortController().signal);
  assert.equal(released,1);assert.equal(events.filter(e=>e.type==='progress').length,20);assert.equal(externalCalls,80);
  const summaries=new Map(events.filter(e=>e.type==='progress').map(e=>[e.result.key,e.result.summary]));
  const selected=selectLikedPlaylist(shortlist,[seed],blankMemory(),{},summaries);
  assert.equal(selected.length,10);assert.equal(selected[0].track.id,'r6');assert.ok(selected.every(r=>shortlist.some(s=>s.track.id===r.track.id)));
  const before=externalCalls;await analyzePlaylistTrack(shortlist[0].track,new AbortController().signal);assert.equal(externalCalls,before);
  assert.ok(events.every(e=>!JSON.stringify(e).includes('fixture-key')&&!JSON.stringify(e).includes('I love')));
 }finally{global.fetch=oldFetch;for(const [k,v] of [['YOUTUBE_API_KEY',oldKey],['YOUTUBE_DERIVED_METRICS_APPROVED',oldApproval]])if(v===undefined)delete process.env[k];else process.env[k]=v;}

 let calls=0;const failed=[];
 const tracks=[song,{...song,title:'Other'}];
 await readReviewStream(new Response(playlistReviewStream(tracks,async()=>{calls++;throw new ReviewProviderError('quota');},new AbortController().signal,()=>{})),e=>failed.push(e),new AbortController().signal);
 assert.equal(calls,1);assert.equal(failed.filter(e=>e.type==='progress'&&e.result.status==='unavailable').length,2);
 const abort=new AbortController();abort.abort();calls=0;
 const cancelled=playlistReviewStream(tracks,async()=>{calls++;},abort.signal,()=>{});await cancelled.cancel();assert.equal(calls,0);
 await assert.rejects(readReviewStream(new Response('{"type":"heartbeat"}\n'),()=>{},new AbortController().signal),/ended early/);
 const bytes=new TextEncoder().encode('{"type":"heartbeat"}\n{"type":"complete","total":0}\n');
 const pieces=new ReadableStream({start(c){c.enqueue(bytes.slice(0,11));c.enqueue(bytes.slice(11));c.close();}});
 const decoded=[];await readReviewStream(new Response(pieces),e=>decoded.push(e),new AbortController().signal);assert.equal(decoded.length,2);
 console.log('PASS: 30 candidates → fixed 20 → matched-video lookup → 20 synthetic comment analyses → positive-only 10; no raw text/keys returned; wrong covers/versions excluded; warm cache, quota stop, cancellation and truncated stream covered. No live YouTube calls.');
})().catch(e=>{console.error(e);process.exitCode=1;});
