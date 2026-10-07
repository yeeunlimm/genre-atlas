// Local-only three-way example. Does not change production playlist eligibility.
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {sentiment,reviewEligibility,MODEL,REVISION} from '../lib/review-analyzer.mjs';
const source=path.resolve(process.argv[2]||'');
const data=JSON.parse(await readFile(source,'utf8'));
const labels=['positive','negative','neutral'];
const counts={positive:0,negative:0,neutral:0,unanalysed:0};
const comments=[];
for(const row of data.comments){
  let reason=null;
  if(typeof row.text!=='string'||!row.text.trim())reason='Empty text';
  else if(row.text.length>1200)reason='Long text / lyrics excluded from example';
  else if(/[^\p{Script=Latin}\p{M}\p{N}\p{P}\p{S}\p{Z}\p{Cf}\s]/u.test(row.text))reason='Language outside this English model example';
  if(reason){comments.push({number:row.number,label:'unanalysed',reason});counts.unanalysed++;continue;}
  const probabilities=await sentiment(row.text);
  if(Object.values(probabilities).some(x=>!Number.isFinite(x)||x<0||x>1)||Math.abs(Object.values(probabilities).reduce((a,b)=>a+b,0)-1)>.001)throw new Error('Invalid probabilities');
  const label=[...labels].sort((a,b)=>probabilities[b]-probabilities[a])[0];
  counts[label]++;
  comments.push({number:row.number,text:row.text,label,probabilities,score:probabilities.positive-probabilities.negative,productionEligible:reviewEligibility(row.text)});
}
if(Object.values(counts).reduce((a,b)=>a+b,0)!==data.comments.length)throw new Error('Count mismatch');
const out={artist:data.artist,title:data.title,video:data.video,collectedAt:data.collectedAt,classifiedAt:new Date().toISOString(),model:{id:MODEL,revision:REVISION},
  method:'Highest of positive, negative, neutral model probabilities. General English comment tone, not target-specific song approval. Long/unsupported text excluded, never neutral-filled. Existing production relevance gate is unchanged.',
  limitation:'Relevance-ordered sample, not representative. Sarcasm, quotes, memes, and mixed feelings may be misclassified. No human-verified labels.',counts,comments};
await writeFile(path.join(path.dirname(source),'comments-classified.json'),JSON.stringify(out,null,2)+'\n',{flag:'wx'});
const names={positive:'긍정',negative:'부정',neutral:'중립',unanalysed:'미분석'};
const lines=[`${out.artist} — ${out.title}`,out.video.url,`분류: ${out.classifiedAt}`,
  '긍정·부정·중립 확률 중 가장 큰 항목으로 자동 분류. 문장 자체의 감정이며 곡 호평/혹평 정답이 아닙니다.',
  '반어·인용·밈을 오해할 수 있습니다. 긴 글은 미분석(중립 아님). 추천 기능의 평가문 필터는 변경하지 않았습니다.',
  ...Object.entries(counts).map(([k,n])=>`${names[k]}: ${n}개`),''];
for(const label of [...labels,'unanalysed']){
  lines.push(`=== ${names[label]} ===`);
  for(const r of comments.filter(r=>r.label===label))lines.push(`[${r.number}] ${r.text||r.reason}`,r.probabilities?Object.entries(r.probabilities).map(([k,p])=>`${names[k]} ${(100*p).toFixed(2)}%`).join(' / '):'원문 재출력 생략','');
}
await writeFile(path.join(path.dirname(source),'comments-classified.txt'),lines.join('\n'),{flag:'wx'});
console.log(JSON.stringify({counts,path:path.join(path.dirname(source),'comments-classified.json')}));
