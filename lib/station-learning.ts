import {songKey,type Candidate} from "./hybrid-station";
import type {StationTrack,Credit} from "./station-catalog";

// Versioned feature snapshots are captured BEFORE feedback. No audio/BPM inference.
export const FEATURE_NAMES=[
 "shared_producer","shared_mastering","sample_artist_connection","genre_overlap",
 "route_credits","route_related","route_similar",
 "liked_creator_overlap","liked_artist",
 "producer_metadata_present","mastering_metadata_present","genre_metadata_present",
 "sample_evidence_present","liked_creator_history_present","release_credit_connection",
 "non_youtube_related_evidence"
] as const;
export const FEATURE_VERSION=1;
export type Descriptor={artist:string;creators:string[]};
export type Exposure={id:string;group:string;song:string;at:number;features:number[];descriptor:Descriptor;label:0|1|null;action:"shown"|"skip"|"like"|"dislike";ratedAt:number|null};
export type LearningData={version:1;events:Exposure[]};
export type RankModel={weights:number[];active:boolean;labels:number;positives:number;negatives:number;pairs:number;groups:number;holdoutAccuracy:number|null;message:string};
export const emptyLearning=():LearningData=>({version:1,events:[]});
export const learningKey=(id:string|null)=>"genre-atlas.learning.v1:"+(id?"user:"+encodeURIComponent(id):"guest");
const norm=(s:string)=>s.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]/gu,"");
const artistKey=(t:StationTrack)=>norm(t.primaryArtistName||t.artist.replace(/\s*\b(?:feat\.?|ft\.?|featuring)\s+.*$/i,""));
const allowedSource=(url:string)=>{try{const u=new URL(url);return u.protocol==="https:"&&!/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname);}catch{return false;}};
// Do not conflate producer, mixing and mastering or merge different people by name.
const credits=(t:StationTrack,role?:string)=>t.credits.filter(c=>c.person&&(!role||c.role===role)&&allowedSource(c.source.url));
const same=(a:Credit,b:Credit)=>a.person===b.person;
const creator=(c:Credit)=>c.role+":"+c.person;
const describe=(t:StationTrack):Descriptor=>({artist:artistKey(t),creators:[...new Set(credits(t).map(creator))].slice(0,100)});
function likedHistory(data:LearningData,before:number){
 const latest=new Map<string,Exposure>();
 for(const e of data.events)if(e.label!==null&&e.ratedAt!==null&&e.ratedAt<before)latest.set(e.song,e);
 return [...latest.values()].filter(e=>e.label===1);
}
export function featureVector(row:Candidate,seeds:StationTrack[],data:LearningData,now=Date.now()):number[]{
 const t=row.track,sc=seeds.flatMap(s=>credits(s)),cc=credits(t);
 const matches=(role:string)=>sc.filter(c=>c.role===role).flatMap(a=>cc.filter(b=>b.role===role&&same(a,b)));
 const producers=matches("producer"),mastering=matches("mastering");
 const genres=(tracks:StationTrack[])=>new Set(tracks.flatMap(x=>x.genres.filter(g=>allowedSource(g.source.url)).map(g=>norm(g.name))).filter(Boolean));
 const sg=genres(seeds),cg=genres([t]),union=new Set([...sg,...cg]),overlap=[...cg].filter(g=>sg.has(g)).length;
 const evidence=row.reasons.filter(r=>r.sources.length&&r.sources.every(s=>allowedSource(s.url)));
 const related=evidence.some(r=>r.kind==="related-artist"),similar=evidence.some(r=>r.kind==="similar-track"),sample=evidence.some(r=>r.kind==="sample");
 const history=likedHistory(data,now),previousLikes=seeds.slice(1).map(describe),creatorSet=new Set([...history.flatMap(e=>e.descriptor.creators),...previousLikes.flatMap(e=>e.creators)]),current=describe(t);
 return [
  Number(!!producers.length),Number(!!mastering.length),Number(sample),union.size?overlap/union.size:0,
  Number(row.paths.some(p=>p.route==="credits")&&evidence.some(r=>r.kind==="credit"||r.kind==="sample")),
  Number(row.paths.some(p=>p.route==="related-artists")&&related),Number(row.paths.some(p=>p.route==="similar-tracks")&&similar),
  current.creators.length?current.creators.filter(c=>creatorSet.has(c)).length/current.creators.length:0,
  Number(history.some(e=>e.descriptor.artist===current.artist)||previousLikes.some(e=>e.artist===current.artist)),
  Number(sc.some(c=>c.role==="producer")&&cc.some(c=>c.role==="producer")),
  Number(sc.some(c=>c.role==="mastering")&&cc.some(c=>c.role==="mastering")),
  Number(!!sg.size&&!!cg.size),Number(sample),Number(!!creatorSet.size),
  Number(sc.some(a=>["producer","mastering"].includes(a.role)&&cc.some(b=>a.role===b.role&&same(a,b)&&(a.scope==="release"||b.scope==="release")))),Number(related)
 ];
}
export function makeExposure(row:Candidate,seeds:StationTrack[],data:LearningData,group:string,id:string,now=Date.now()):Exposure{
 return {id,group,song:songKey(row.track),at:now,features:featureVector(row,seeds,data,now),descriptor:describe(row.track),label:null,action:"shown",ratedAt:null};
}
export function appendExposure(data:LearningData,event:Exposure):LearningData{
 return {...data,events:[...data.events.filter(e=>e.id!==event.id),event].slice(-1000)};
}
export function rateExposure(data:LearningData,id:string,action:"like"|"dislike"|"skip",now=Date.now()):LearningData{
 return {...data,events:data.events.map(e=>e.id===id?{...e,action,label:action==="like"?1:action==="dislike"?0:null,ratedAt:now}:e)};
}
export function readLearning(raw:unknown):LearningData{
 if(!raw||typeof raw!=="object"||(raw as LearningData).version!==1||!Array.isArray((raw as LearningData).events))return emptyLearning();
 const events=(raw as LearningData).events.slice(-1000).filter(e=>e&&[e.id,e.group,e.song,e.descriptor?.artist].every(s=>typeof s==="string"&&s.length>0&&s.length<1000)&&Number.isFinite(e.at)&&
  (e.ratedAt===null||Number.isFinite(e.ratedAt)&&e.ratedAt>=e.at)&&["shown","skip","like","dislike"].includes(e.action)&&
  (e.action==="like"?e.label===1:e.action==="dislike"?e.label===0:e.label===null)&&
  (e.label===null||e.ratedAt!==null)&&Array.isArray(e.features)&&e.features.length===FEATURE_NAMES.length&&e.features.every(n=>Number.isFinite(n)&&n>=0&&n<=1)&&
  Array.isArray(e.descriptor.creators)&&e.descriptor.creators.length<=100&&e.descriptor.creators.every(s=>typeof s==="string"&&s.length<500));
 return {version:1,events:[...new Map(events.map(e=>[e.id,e])).values()].sort((a,b)=>a.at-b.at)};
}
type Pair={delta:number[];weight:number};
function grouped(events:Exposure[]):Exposure[][]{
 const groups=new Map<string,Map<string,Exposure>>();
 for(const e of events)if(e.label!==null){const g=groups.get(e.group)||new Map();g.set(e.song,e);groups.set(e.group,g);}
 return [...groups.values()].map(g=>[...g.values()]).filter(g=>g.some(e=>e.label===1)&&g.some(e=>e.label===0)).sort((a,b)=>Math.min(...a.map(e=>e.at))-Math.min(...b.map(e=>e.at)));
}
function pairs(groups:Exposure[][]):Pair[]{
 return groups.flatMap(g=>{const positive=g.filter(e=>e.label===1).slice(-30),negative=g.filter(e=>e.label===0).slice(-30),weight=1/(positive.length*negative.length);
  return positive.flatMap(p=>negative.map(n=>({delta:p.features.map((x,i)=>x-n.features[i]),weight}))).filter(p=>p.delta.some(x=>Math.abs(x)>1e-9));
 });
}
export const modelScore=(model:RankModel,features:number[])=>features.reduce((sum,x,i)=>sum+x*(model.weights[i]||0),0);
function fit(rows:Pair[],groups:number):number[]{
 const w=FEATURE_NAMES.map(()=>0);
 for(let epoch=0;epoch<160;epoch++){const gradient=w.map(x=>.025*x);
  for(const p of rows){const dot=p.delta.reduce((sum,x,i)=>sum+x*w[i],0),error=1/(1+Math.exp(Math.max(-25,Math.min(25,dot))));
   for(let i=0;i<w.length;i++)gradient[i]-=error*p.delta[i]*p.weight/Math.max(1,groups);
  }for(let i=0;i<w.length;i++)w[i]-=.6*gradient[i];
 }return w;
}
export function trainRanker(data:LearningData):RankModel{
 const labelled=data.events.filter(e=>e.label!==null),groups=grouped(labelled),rows=pairs(groups);
 const positives=labelled.filter(e=>e.label===1).length,negatives=labelled.length-positives;
 const active=labelled.length>=12&&positives>=3&&negatives>=3&&groups.length>=2&&rows.length>=6;
 let holdoutAccuracy:number|null=null;
 // Chronological, whole-session holdout. It is an estimate, not a calibrated probability.
 if(groups.length>=6){const cutoff=Math.max(2,Math.floor(groups.length*.8)),firstHeld=Math.min(...groups[cutoff].map(e=>e.at));
  const train=groups.slice(0,cutoff).filter(g=>g.every(e=>(e.ratedAt??Infinity)<firstHeld)),test=pairs(groups.slice(cutoff));
  const training=pairs(train);if(training.length&&test.length){const w=fit(training,train.length);holdoutAccuracy=test.reduce((sum,p)=>{const d=p.delta.reduce((s,x,i)=>s+x*w[i],0);return sum+(d>0?1:d===0?.5:0);},0)/test.length;}
 }
 return {weights:active?fit(rows,groups.length):FEATURE_NAMES.map(()=>0),active,labels:labelled.length,positives,negatives,pairs:rows.length,groups:groups.length,holdoutAccuracy,
  message:active?"Experimental learned ranking is active on this browser. Scores order songs; they are not liking probabilities.":"Collecting explicit feedback. Learning needs 12 ratings, at least 3 likes and 3 dislikes, and 6 distinguishable comparisons across 2 starting-song sessions. Until then, source-based ranking is used."};
}
export function exportLearning(data:LearningData){
 return {format:"genre-atlas-ranking",version:1,featureVersion:FEATURE_VERSION,featureNames:FEATURE_NAMES,exportedAt:new Date().toISOString(),events:data.events};
}
