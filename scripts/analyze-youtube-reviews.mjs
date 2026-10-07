import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import ts from 'typescript';
import {MODEL,REVISION,sentiment,analyzeReview} from '../lib/review-analyzer.mjs';

async function load(file) {
  const module={exports:{}};
  new Function('exports','module',ts.transpileModule(await readFile(new URL(file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module);
  return module.exports;
}
const {summarizeScoredReviews}=await load('../lib/review-sentiment.ts');
const {youtubeReviewComments,REVIEW_COMMENT_LIMIT}=await load('../lib/youtube-review-comments.ts');
const [videoId,title,artist]=process.argv.slice(2);
if (!/^[\w-]{11}$/.test(videoId||'') || !title || !artist || !process.env.YOUTUBE_API_KEY?.trim()) {
  console.error('Set server-only YOUTUBE_API_KEY; run: node scripts/analyze-youtube-reviews.mjs VERIFIED_VIDEO_ID "TITLE" "ARTIST"');
  process.exit(1);
}
const started=performance.now();
try {
  // Sanity tests use authored text, not claimed ground-truth music evaluation.
  const sanityPositive=await sentiment('I love this song. The melody is beautiful.');
  const sanityNegative=await sentiment('I hate this song. The vocals are terrible.');
  if(sanityPositive.positive<=sanityPositive.negative || sanityNegative.negative<=sanityNegative.positive) throw new Error('Model sanity test failed.');
  const modelReady=performance.now();
  const batch=await youtubeReviewComments(videoId,process.env.YOUTUBE_API_KEY);
  const predictions=[];
  for(const row of batch.comments.slice(0,REVIEW_COMMENT_LIMIT)){
    const prediction=await analyzeReview(row.text);
    if(prediction)predictions.push({commentId:row.id,relevantToSong:true,...prediction});
  }
  const summary=summarizeScoredReviews(predictions);
  const scoreSigns={positive:0,zero:0,negative:0};
  for(const p of predictions)scoreSigns[p.score>0?'positive':p.score<0?'negative':'zero']++;
  const result={title,artist,videoId,...summary,model:MODEL,revision:REVISION,
    koreanDictionaryConfigured:Boolean(process.env.SENTIMENT_LEXICON_PATH),
    experimental:true,scoreSigns,fetched:batch.comments.length,commentLimit:REVIEW_COMMENT_LIMIT,
    seconds:{modelLoadAndSanity:(modelReady-started)/1000,fetchAndAnalyze:(performance.now()-modelReady)/1000}};
  const path=resolve(process.env.REVIEW_SCORES_PATH||'work/review-summaries.json');
  let existing={version:1,items:[]};
  try{existing=JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('Existing review output is invalid; not overwritten.');}
  if(existing.version!==1||!Array.isArray(existing.items))throw new Error('Unsupported output format.');
  // Store aggregates only, no comment text, comment IDs, authors, or credentials.
  const items=existing.items.filter(x=>x.videoId!==videoId&&Date.now()-Date.parse(x.analyzedAt)<86400000);
  await mkdir(dirname(path),{recursive:true});
  await writeFile(path+'.tmp',JSON.stringify({version:1,items:[...items,result]},null,2));
  await rename(path+'.tmp',path);
  console.log(JSON.stringify(result,null,2));
} catch(e) {
  console.error('Analysis failed:',e instanceof Error?e.message.replaceAll(process.env.YOUTUBE_API_KEY,'[redacted]'):'Unknown error');
  process.exitCode=1;
}
