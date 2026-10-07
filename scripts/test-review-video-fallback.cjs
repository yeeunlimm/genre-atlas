const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const id=n=>'fixture'+String(n).padStart(4,'0');
const video=(n,patch={})=>({id:id(n),snippet:{title:'Artist - Song (Official Audio)',channelTitle:'ArtistVEVO',categoryId:'10',...patch},contentDetails:{duration:'PT3M'}});
const track={title:'Song',artist:'Artist',durationMs:180000};
const comment=text=>({id:'comment-id',snippet:{topLevelComment:{snippet:{textDisplay:text}}}});
const response=(reason,status=403)=>Response.json({error:{errors:[{reason}]}},{status});
function harness({initial=[video(1),video(2)],alternate=[],batches={},score=.7,onComments}={}){
  const modules=new Map(),calls={search:[],comments:[],analyses:0};
  function load(file){file=path.resolve(file);if(modules.has(file))return modules.get(file);const m={exports:{}};modules.set(file,m.exports);
    new Function('exports','module','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,key=>{
      if(key.endsWith('review-analyzer.mjs'))return {analyzeReview:async()=>{calls.analyses++;return score===null?null:{score,method:'en-model-v1'};}};
      return key.startsWith('.')?load(path.resolve(path.dirname(file),key+'.ts')):require(key);
    });return m.exports;
  }
  const metadata=new Map([...initial,...alternate].map(v=>[v.id,v]));
  const request=async(url,options)=>{
    assert.ok(!String(url).includes('fixture-secret'));
    assert.equal(options.headers['X-Goog-Api-Key'],'fixture-secret');
    assert.ok(options.signal instanceof AbortSignal);
    const u=new URL(url);
    if(u.pathname.endsWith('/search')){
      assert.equal(u.searchParams.get('maxResults'),'5');
      const query=u.searchParams.get('q');calls.search.push(query);
      const rows=query.endsWith('official video')?alternate:initial;
      return Response.json({items:rows.map(v=>({id:{videoId:v.id}}))});
    }
    if(u.pathname.endsWith('/videos'))return Response.json({items:u.searchParams.get('id').split(',').map(key=>metadata.get(key)).filter(Boolean)});
    assert.ok(u.pathname.endsWith('/commentThreads'));
    const key=u.searchParams.get('videoId');calls.comments.push(key);
    assert.equal(u.searchParams.get('maxResults'),'50');assert.equal(u.searchParams.has('pageToken'),false);
    onComments?.(key);
    const batch=batches[key];
    if(batch==='disabled')return response('commentsDisabled');
    if(batch==='quota')return response('quotaExceeded');
    if(batch==='missing')return response('videoNotFound',404);
    if(batch==='denied')return response('forbidden');
    if(batch==='transport')throw new Error('Synthetic transport failure');
    return Response.json({items:batch==='empty'?[]:[comment('A private synthetic song review')]});
  };
  return {calls,request,load,...load('lib/playlist-review-service.ts'),...load('lib/youtube-review-match.ts')};
}
async function run(config,verify){const h=harness(config);global.fetch=h.request;const result=await h.analyzePlaylistTrack(track,new AbortController().signal);assert.equal(result.videosChecked,h.calls.comments.length);assert.ok(!JSON.stringify(result).includes('private synthetic')&&!JSON.stringify(result).includes('fixture-secret'));verify(result,h);return result;}

(async()=>{
  const oldFetch=global.fetch,oldKey=process.env.YOUTUBE_API_KEY;
  process.env.YOUTUBE_API_KEY='fixture-secret';
  try{
    await run({batches:{[id(1)]:'disabled'}},(r,h)=>{assert.equal(r.status,'ready');assert.equal(r.videoId,id(2));assert.deepEqual(h.calls.comments,[id(1),id(2)]);assert.equal(h.calls.search.length,1);assert.equal(h.calls.analyses,1);});
    await run({batches:{[id(1)]:'empty'}},(r,h)=>{assert.equal(r.videoId,id(2));assert.equal(r.status,'ready');assert.equal(h.calls.analyses,1);});
    await run({batches:{[id(1)]:'missing'}},(r,h)=>{assert.equal(r.videoId,id(2));assert.equal(r.status,'ready');assert.equal(h.calls.analyses,1);});
    await run({initial:[video(1)],alternate:[video(1),video(2,{title:'Artist - Song (Official Music Video)'})],batches:{[id(1)]:'disabled'}},(r,h)=>{
      assert.equal(r.videoId,id(2));assert.equal(h.calls.search.length,2);assert.ok(h.calls.search[1].endsWith('official video'));assert.deepEqual(h.calls.comments,[id(1),id(2)],'The same video must never be queried twice.');
    });
    const wrong=[video(2,{title:'Artist - Song (Live)'}),video(3,{title:'Artist - Song (Cover)'}),video(4,{channelTitle:'Unrelated uploader'}),{...video(5),contentDetails:{duration:'PT9M'}}];
    await run({initial:[video(1),...wrong],alternate:[video(6)],batches:{[id(1)]:'disabled'}},(r,h)=>{assert.equal(r.videoId,id(6));assert.deepEqual(h.calls.comments,[id(1),id(6)],'Incorrect versions, uploader and durations cannot be fallbacks.');});
    await run({initial:[video(1),video(2),video(3),video(4),video(5)],batches:Object.fromEntries([1,2,3,4,5].map(n=>[id(n),'disabled']))},(r,h)=>{
      assert.equal(h.REVIEW_VIDEO_ATTEMPT_LIMIT,3);assert.deepEqual(h.calls.comments,[id(1),id(2),id(3)]);assert.equal(h.calls.search.length,1);assert.equal(r.status,'comments-disabled');assert.match(r.reason,/all 3/);assert.equal(h.calls.analyses,0);
    });
    await run({initial:[video(1)],alternate:[video(2)],batches:{[id(1)]:'disabled',[id(2)]:'disabled'}},(r,h)=>{assert.equal(r.status,'comments-disabled');assert.match(r.reason,/all 2/);assert.equal(h.calls.search.length,2);assert.equal(h.calls.analyses,0);});
    await run({initial:[video(1)],alternate:[video(2)],batches:{[id(1)]:'disabled',[id(2)]:'empty'}},(r,h)=>{assert.equal(r.status,'no-evidence');assert.equal(r.summary,undefined);assert.match(r.reason,/1 disabled, 1 empty/);assert.equal(h.calls.analyses,0);});
    await run({score:-.8},(r,h)=>{assert.equal(r.status,'ready');assert.equal(r.summary.score,-.8);assert.deepEqual(h.calls.comments,[id(1)],'A negative score must not trigger audience cherry-picking.');assert.equal(h.calls.search.length,1);});
    await run({score:null},(r,h)=>{assert.equal(r.status,'no-evidence');assert.deepEqual(h.calls.comments,[id(1)],'Ineligible review text must not trigger another audience.');assert.equal(h.calls.search.length,1);});
    await run({initial:wrong},(r,h)=>{assert.equal(r.status,'no-match');assert.deepEqual(h.calls.comments,[]);assert.equal(h.calls.search.length,1);});
    for(const failure of ['quota','denied','transport']){
      const h=harness({batches:{[id(1)]:'disabled',[id(2)]:failure}});global.fetch=h.request;
      await assert.rejects(h.analyzePlaylistTrack(track,new AbortController().signal),error=>error instanceof h.ReviewProviderError&&error.kind===(failure==='quota'?'quota':'provider'));
      assert.deepEqual(h.calls.comments,[id(1),id(2)]);assert.equal(h.calls.search.length,1);
    }
    const abort=new AbortController(),cancelled=harness({batches:{[id(1)]:'disabled'},onComments:()=>abort.abort()});global.fetch=cancelled.request;
    await assert.rejects(cancelled.analyzePlaylistTrack(track,abort.signal),error=>error.name==='AbortError');assert.deepEqual(cancelled.calls.comments,[id(1)]);assert.equal(cancelled.calls.search.length,1);
    const preAbort=new AbortController();preAbort.abort();const before=harness();global.fetch=before.request;
    await assert.rejects(before.analyzePlaylistTrack(track,preAbort.signal),error=>error.name==='AbortError');assert.equal(before.calls.search.length,0);
    const quota=harness({batches:{[id(1)]:'quota'}});global.fetch=quota.request;
    const {playlistReviewStream}=quota.load('lib/playlist-review-stream.ts'),{readReviewStream}=quota.load('lib/read-review-stream.ts');
    const events=[];await readReviewStream(new Response(playlistReviewStream([track,{...track,title:'Other'}],quota.analyzePlaylistTrack,new AbortController().signal,()=>{})),event=>events.push(event),new AbortController().signal);
    assert.equal(quota.calls.comments.length,1);assert.equal(quota.calls.search.length,1);assert.equal(events.filter(e=>e.type==='progress'&&e.result.status==='unavailable').length,2,'Comment quota exhaustion must halt all remaining song lookups.');
    for(const failure of ['transport','invalid-json','invalid-shape']){
      const outage=harness();let requests=0;
      global.fetch=async()=>{requests++;if(failure==='transport')throw new Error('Synthetic private network detail');return failure==='invalid-json'?new Response('not json'):Response.json({items:'invalid'});};
      const stream=outage.load('lib/playlist-review-stream.ts'),reader=outage.load('lib/read-review-stream.ts'),failed=[];
      await reader.readReviewStream(new Response(stream.playlistReviewStream([track,{...track,title:'Other'}],outage.analyzePlaylistTrack,new AbortController().signal,()=>{})),event=>failed.push(event),new AbortController().signal);
      assert.equal(requests,1,failure+' during search must stop all remaining candidates.');
      assert.equal(failed.filter(event=>event.type==='progress'&&event.result.status==='unavailable').length,2);
      assert.ok(failed.filter(event=>event.type==='progress').every(event=>event.result.reason==='YouTube lookup is unavailable. Try again later.'));
    }
    const lookupAbort=new AbortController(),abortLookup=harness();
    global.fetch=async()=>{lookupAbort.abort();throw new Error('Synthetic aborted lookup');};
    await assert.rejects(abortLookup.analyzePlaylistTrack(track,lookupAbort.signal),error=>error.name==='AbortError','Cancellation must retain its identity, not become a provider outage.');
    const cached=harness({batches:{[id(1)]:'disabled'}});global.fetch=cached.request;
    const first=await cached.analyzePlaylistTrack(track,new AbortController().signal),second=await cached.analyzePlaylistTrack(track,new AbortController().signal);
    assert.equal(first.videosChecked,2);assert.deepEqual(second,first);assert.deepEqual(cached.calls.comments,[id(1),id(2)]);
    console.log('PASS: disabled/empty/missing comments retry up to 3 distinct strictly matched recordings; one bounded alternate-video search; wrong versions excluded; negative/no-evidence scores never retried; quota/provider/cancel halt; 50 comments/video and no private text/key in results. Synthetic data only.');
  }finally{global.fetch=oldFetch;if(oldKey===undefined)delete process.env.YOUTUBE_API_KEY;else process.env.YOUTUBE_API_KEY=oldKey;}
})().catch(error=>{console.error(error);process.exitCode=1;});
