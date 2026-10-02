import {rankCandidates,type Candidate,type Memory,type Route} from "./hybrid-station";
import type {StationTrack} from "./station-catalog";

export type Job={seed:StationTrack;route:Route;offset:number};
export type Progress=Job & {state:"loading"|"ready"|"empty"|"disabled"|"partial"|"error";count:number;note:string;nextOffset:number|null};
export const jobKey=(job:Job)=>job.seed.id+"|"+job.route;
export const attemptKey=(job:Job)=>jobKey(job)+"|"+job.offset;
export const AUTO_REQUEST_LIMIT=8;
// Continue unseen pages before retrying failed pages, once each, with a hard
// budget. Disabled sources never retry and a bad cursor cannot create a loop.
export function recoveryJobs(progress:Progress[],attempted:Set<string>):Job[]{
  if(progress.some(p=>p.state==="loading")||attempted.size>=AUTO_REQUEST_LIMIT)return [];
  const more=progress.filter(p=>p.state!=="disabled"&&p.nextOffset!==null&&p.nextOffset>p.offset)
    .map(p=>({seed:p.seed,route:p.route,offset:p.nextOffset!}));
  const retries=progress.filter(p=>p.state==="partial"||p.state==="error");
  return [...more,...retries].filter((p,i,a)=>!attempted.has(attemptKey(p))&&a.findIndex(x=>jobKey(x)===jobKey(p))===i).slice(0,Math.min(2,AUTO_REQUEST_LIMIT-attempted.size));
}
export function emptyStationMessage(rows:Candidate[],seeds:StationTrack[],memory:Memory,consumed:StationTrack[],progress:Progress[]){
  const failed=progress.some(p=>p.state==="error"||p.state==="partial");
  const more=progress.some(p=>p.nextOffset!==null);
  const recentOnly=rankCandidates(rows,seeds,{...memory,recent:{}},consumed).length>0;
  if(recentOnly)return {title:"You’ve seen these discoveries recently.",detail:"The remaining matches were shown in the last three days. Your likes are safe; try another song for a different starting point.",failed,more};
  if(failed)return {title:"Some music sources are unavailable.",detail:"We could not finish gathering songs. This is a data lookup problem, not a sign that your song has no matches. Retry the sources below.",failed,more};
  if(!rows.length)return {title:"No connected songs found yet.",detail:"The sources checked returned no usable songs for this recording. More sources may have results; shared credits are not required.",failed,more};
  return {title:more?"More discoveries to check.":"You’ve reached the end of this mix.",detail:"The songs gathered so far belong to excluded albums, artists already shown, or your dislikes. Your preferences have not been cleared.",failed,more};
}
