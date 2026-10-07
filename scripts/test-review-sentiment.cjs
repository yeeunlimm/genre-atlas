const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file){const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m);return m.exports;}
const {summarizeReviews,positiveReviewCandidates}=load('lib/review-sentiment.ts');
const {youtubeReviewComments,assertYouTubeAnalysisApproved}=load('lib/youtube-review-comments.ts');
const now=new Date('2026-10-07T00:00:00Z');
const prediction=(id,p,n,related=true)=>({commentId:id,positive:p,negative:n,neutral:1-p-n,relevantToSong:related});
const positive=summarizeReviews([prediction('a',.8,.1),prediction('a',.8,.1),prediction('b',.9,0,false),prediction('invalid',2,0)],now);
assert.equal(positive.sampleCount,1);assert.ok(positive.score>0);
assert.equal(summarizeReviews([],now).score,null);
const summaries=new Map([['positive',positive],['zero',summarizeReviews([prediction('z',.5,.5)],now)],['negative',summarizeReviews([prediction('n',0,1)],now)],['stale',{...positive,analyzedAt:'2026-10-05T00:00:00Z'}]]);
assert.deepEqual(positiveReviewCandidates(['missing','negative','zero','stale','positive','positive'].map(trackId=>({trackId})),summaries,+now),[{trackId:'positive'}]);
assert.throws(()=>assertYouTubeAnalysisApproved({}));
(async()=>{
 let calls=0;
 const request=async(url,options)=>{calls++;assert.ok(!String(url).includes('test-secret'));assert.equal(options.headers['X-Goog-Api-Key'],'test-secret');return Response.json({items:[{id:'1',snippet:{topLevelComment:{snippet:{textDisplay:'A test comment'}}}}],nextPageToken:'more'});};
 const batch=await youtubeReviewComments('tAyYYKcySXA','test-secret',request);
 assert.equal(calls,2);assert.equal(batch.comments.length,1);assert.equal(batch.hasMore,true);
 const disabled=await youtubeReviewComments('tAyYYKcySXA','test-secret',async()=>Response.json({error:{errors:[{reason:'commentsDisabled'}]}},{status:403}));
 assert.equal(disabled.status,'disabled');assert.equal(disabled.comments.length,0);
 await assert.rejects(youtubeReviewComments('bad','test-secret',request));
 console.log('PASS: strict positive-only gate, missing/invalid/stale exclusion, deduplication, bounded comments, disabled comments, approval guard. Synthetic scores only; no live sentiment analysis claimed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
