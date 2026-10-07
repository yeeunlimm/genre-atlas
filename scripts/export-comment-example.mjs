// Explicit local example only. Never called by the website; raw comments stay in ignored work/.
import {readFileSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeReview,MODEL,REVISION} from '../lib/review-analyzer.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),ts=require('typescript');
function load(name){
  const m={exports:{}};
  new Function('exports','module','require',ts.transpileModule(readFileSync(path.join(root,'lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,m,require);
  return m.exports;
}
async function main(){
  const [artist,title]=process.argv.slice(2);
  if(!artist||!title||process.argv.length!==4)throw new Error('Supply exactly artist and title.');
  const key=process.env.YOUTUBE_API_KEY?.trim();if(!key)throw new Error('Missing server key.');
  const {findReviewVideos}=load('youtube-review-match');
  const {youtubeReviewComments}=load('youtube-review-comments');
  const {summarizeScoredReviews}=load('review-sentiment');
  const signal=AbortSignal.timeout(120000),track={artist,title};
  let videos=await findReviewVideos(track,key,signal),chosen,batch;
  const seen=new Set();
  for(const format of ['audio','video']){
    if(format==='video')videos=await findReviewVideos(track,key,signal,fetch,'video');
    for(const video of videos){
      if(seen.has(video.id)||seen.size>=3)continue;
      seen.add(video.id);
      const result=await youtubeReviewComments(video.id,key);
      if(result.status==='ready'){chosen=video;batch=result;break;}
    }
    if(chosen||seen.size>=3)break;
  }
  if(!chosen||!batch)throw new Error('No comments available on confidently matched recordings. No example fabricated.');
  const rows=[];
  for(const [i,comment] of batch.comments.entries()){
    const analysis=await analyzeReview(comment.text);
    rows.push({number:i+1,text:comment.text,analysis:analysis||null});
  }
  const summary=summarizeScoredReviews(rows.filter(r=>r.analysis).map(r=>({commentId:String(r.number),relevantToSong:true,...r.analysis})));
  const data={artist,title,video:{id:chosen.id,title:chosen.snippet.title,channel:chosen.snippet.channelTitle,url:'https://www.youtube.com/watch?v='+chosen.id},
    collectedAt:new Date().toISOString(),sampling:'One relevance-ordered top-level page, maximum 50, deduplicated; not representative of all listeners.',
    hasMore:batch.hasMore,model:{id:MODEL,revision:REVISION},summary,comments:rows};
  const directory=path.join(root,'work','comment-example-'+Date.now()+'-'+randomUUID().slice(0,8));
  await mkdir(directory,{recursive:false});
  await writeFile(path.join(directory,'comments.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx'});
  const text=[`${artist} — ${title}`,`출처: ${data.video.url}`,`영상: ${data.video.title}`,`수집: ${data.collectedAt}`,
    `관련도순 최상위 댓글 한 페이지에서 중복 제거 후 ${rows.length}개. 전체 청취자를 대표하지 않는 예시입니다.`,
    '작성자 이름·계정·댓글ID·API 키는 저장하지 않았습니다. 감성점수가 없는 댓글은 미분석이며 0점이 아닙니다.',
    `곡 평가문으로 분석된 댓글: ${summary.sampleCount}개 / 평균 점수: ${summary.score??'없음'}`,'',
    ...rows.flatMap(r=>[`[${String(r.number).padStart(2,'0')}] ${r.analysis?'점수 '+r.analysis.score.toFixed(4)+' / '+r.analysis.method:'미분석 — 지원 언어·곡 평가문 조건 미충족'}`,r.text,''])].join('\n');
  await writeFile(path.join(directory,'comments.txt'),text,{flag:'wx'});
  console.log(JSON.stringify({directory,video:data.video,count:rows.length,summary}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
