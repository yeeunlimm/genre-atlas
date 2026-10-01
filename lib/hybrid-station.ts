import {onePerArtist, type Recommendation} from "./discovery-station";
import type {StationTrack} from "./station-catalog";

export const routes = ["credits", "related-artists", "similar-tracks"] as const;
export type Route = typeof routes[number];
export const routeLabels: Record<Route,string> = {credits:"Credits & samples", "related-artists":"Related artists", "similar-tracks":"Similar tracks"};
export type Path = {route:Route; seedId:string; confidence:number};
export type Candidate = Recommendation & {paths:Path[]};
export type Preference = {vote:"like"|"dislike"; routes:Route[]; at:number};
export type Memory = {version:1; votes:Record<string,Preference>; recent:Record<string,number>};
export const MEMORY_KEY = "genre-atlas.station.v1";
export const COOLDOWN = 3*24*60*60*1000;
export const blankMemory = ():Memory => ({version:1,votes:{},recent:{}});
const norm=(s:string)=>s.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
const artist=(t:StationTrack)=>norm(t.primaryArtistName||t.artist.replace(/\s*(?:\(|\[)?\s*\b(?:feat\.?|ft\.?|featuring)\s+.*$/i,""));
const title=(t:StationTrack)=>norm(t.title.replace(/[\[(](?:feat\.?|ft\.?|featuring)\s+[^\])]*[\])]/gi,""));
export const songKey=(t:StationTrack)=>artist(t)+":"+title(t);
export const albumKey=(s:string)=>norm(s.replace(/\s+-\s+(?:Single|EP)$/i,"").replace(/\([^)]*(?:deluxe|expanded|remaster|anniversary|bonus|edition)[^)]*\)|\[[^\]]*(?:deluxe|expanded|remaster|anniversary|bonus|edition)[^\]]*\]/gi,"").replace(/\s*[-–:]\s*(?:deluxe|expanded|remaster|anniversary|bonus|edition).*$/i,""));
export function excluded(t:StationTrack,seeds:StationTrack[]) {
  return !t.album || seeds.some(s=>s.id===t.id||s.recordingId===t.recordingId||songKey(s)===songKey(t)||
    (s.albumFamily&&s.albumFamily===t.albumFamily)||s.albumGroups?.some(g=>t.albumGroups?.includes(g))||
    (artist(s)===artist(t)&&albumKey(s.album)===albumKey(t.album)));
}
export function mergeCandidates(rows:Candidate[]):Candidate[] {
  const result:Candidate[]=[];
  for(const row of rows){
    const old=result.find(x=>x.track.id===row.track.id||x.track.recordingId===row.track.recordingId||songKey(x.track)===songKey(row.track));
    if(!old){result.push({...row,paths:row.paths.map(p=>({...p})),reasons:[...row.reasons]});continue;}
    for(const p of row.paths){const hit=old.paths.find(x=>x.route===p.route&&x.seedId===p.seedId);if(hit)hit.confidence=Math.max(hit.confidence,p.confidence);else old.paths.push({...p});}
    old.reasons=[...new Map([...old.reasons,...row.reasons].map(r=>[r.kind+":"+r.detail,r])).values()];
    if(!old.track.artworkUrl&&row.track.artworkUrl)old.track={...old.track,artworkUrl:row.track.artworkUrl};
  }
  return result;
}
// A smoothed route preference, not an audio model or a claim of causal attribution.
// Multi-route feedback is shared fractionally; one vote never switches off a route.
export function routeWeights(memory:Memory):Record<Route,number> {
  return Object.fromEntries(routes.map(route=>{
    let likes=0,dislikes=0;
    for(const v of Object.values(memory.votes))if(v.routes.includes(route)){
      const amount=1/v.routes.length;if(v.vote==="like")likes+=amount;else dislikes+=amount;
    }
    return [route,Math.max(.35,Math.min(1.65,2*(2+likes)/(4+likes+dislikes)))];
  })) as Record<Route,number>;
}
export function rankCandidates(rows:Candidate[],seeds:StationTrack[],memory:Memory,consumed:StationTrack[]=[],now=Date.now()):Candidate[]{
  const weights=routeWeights(memory);
  const ranked=mergeCandidates(rows).filter(r=>!excluded(r.track,seeds)&&memory.votes[songKey(r.track)]?.vote!=="dislike"&&!(memory.recent[songKey(r.track)]>now-COOLDOWN))
    .map(r=>{
      const perRoute=routes.map(route=>Math.max(0,...r.paths.filter(p=>p.route===route).map(p=>p.confidence))*weights[route]).sort((a,b)=>b-a);
      const coverage=new Set(r.paths.map(p=>p.seedId)).size;
      return {...r,score:perRoute[0]+.2*perRoute.slice(1).reduce((a,b)=>a+b,0)+.08*Math.max(0,coverage-1),feedbackBoost:r.paths.some(p=>weights[p.route]!==1)};
    }).sort((a,b)=>b.score-a.score||songKey(a.track).localeCompare(songKey(b.track)));
  return onePerArtist(ranked,consumed) as Candidate[];
}
export function recordVote(memory:Memory,row:Candidate,vote:"like"|"dislike",now=Date.now()):Memory{
  return cleanMemory({...memory,votes:{...memory.votes,[songKey(row.track)]:{vote,routes:[...new Set(row.paths.map(p=>p.route))],at:now}}},now);
}
export function remember(memory:Memory,track:StationTrack,now=Date.now()):Memory{
  return cleanMemory({...memory,recent:{...memory.recent,[songKey(track)]:now}},now);
}
export function cleanMemory(value:unknown,now=Date.now()):Memory {
  const out=blankMemory();if(!value||typeof value!=="object"||(value as Memory).version!==1)return out;
  const raw=value as Memory;
  if(raw.votes&&typeof raw.votes==="object")for(const [key,v] of Object.entries(raw.votes).filter(([,v])=>v&&Number.isFinite(v.at)).sort((a,b)=>b[1].at-a[1].at).slice(0,500)){
    if(key.length>800||!v||!["like","dislike"].includes(v.vote)||!Array.isArray(v.routes))continue;
    const valid=[...new Set(v.routes.filter(r=>routes.includes(r)))];if(valid.length)out.votes[key]={vote:v.vote,routes:valid,at:v.at};
  }
  if(raw.recent&&typeof raw.recent==="object")for(const [key,at] of Object.entries(raw.recent).filter(([,at])=>Number.isFinite(at)&&at>now-COOLDOWN&&at<=now).sort((a,b)=>b[1]-a[1]).slice(0,1000))if(key.length<=800)out.recent[key]=at;
  return out;
}
