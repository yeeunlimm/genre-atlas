import type {CreditRole, Source, StationTrack} from "./station-catalog";
export type Feedback = Record<string, "like" | "dislike">;
export type Reason = {kind: "credit" | "sample" | "genre"; label: string; detail: string; sources: Source[]};
export type Recommendation = {track: StationTrack; score: number; reasons: Reason[]; feedbackBoost: boolean};
export function searchTracks(query: string, catalog: StationTrack[]) {
  const normalize=(text:string)=>text.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
  const terms=query.trim().split(/\s+/).map(normalize).filter(Boolean);
  return catalog.filter(t=>terms.every(term=>normalize(t.artist+" "+t.title+" "+t.album).includes(term)));
}
const roles: Record<CreditRole, string> = {producer:"production",mixing:"mixing",mastering:"mastering",songwriter:"songwriting",arranger:"arrangement"};
const weights: Record<CreditRole, number> = {producer:5,mixing:4,mastering:2,songwriter:2,arranger:4};
export function connection(seed: StationTrack, candidate: StationTrack) {
  const reasons: Reason[] = []; let score = 0;
  // Count each person once: multiple listed roles must not inflate one connection.
  for (const person of new Set(seed.credits.map(c=>c.person))) {
    const a=seed.credits.filter(c=>c.person===person), b=candidate.credits.filter(c=>c.person===person);
    if(!b.length)continue;
    const same=a.flatMap(x=>b.filter(y=>x.role===y.role).map(y=>({x,y,value:weights[x.role]})));
    const cross=a.flatMap(x=>b.map(y=>({x,y,value:Math.min(weights[x.role],weights[y.role])*.7})));
    const best=[...same,...cross].sort((x,y)=>y.value-x.value)[0];
    score+=best.value;
    const shared=best.x.role===best.y.role;
    reasons.push({kind:"credit",label:shared ? "Shared "+roles[best.x.role] : "Connected credits",
      detail:best.x.name+" · "+(shared?roles[best.x.role]+" on both tracks":roles[best.x.role]+" on your starting track; "+roles[best.y.role]+" here")+(best.x.scope==="release"||best.y.scope==="release"?". Release-level credit: applies to the linked edition, not every version.":""),
      sources:[best.x.source,best.y.source]});
  }
  for(const link of candidate.sampledArtists||[])if(link.artistId===seed.artistId){
    score+=4; reasons.push({kind:"sample",label:"Sample connection",detail:"Samples "+link.name+". This is an artist-level link, not a verified sample of your exact starting track.",sources:[seed.source,link.source]});
  }
  for(const link of seed.sampledArtists||[])if(link.artistId===candidate.artistId){
    score+=4; reasons.push({kind:"sample",label:"Sample connection",detail:"Your starting track samples "+link.name+". This track explores that artist, not necessarily the sampled recording.",sources:[seed.source,candidate.source]});
  }
  const genres=seed.genres.filter(g=>candidate.genres.some(c=>c.name===g.name));
  if(genres.length){ score+=.5; reasons.push({kind:"genre",label:"Shared genre",detail:genres.map(g=>g.name).join(", ")+" · source genre labels; not an audio similarity measurement",sources:[...genres.map(g=>g.source),...candidate.genres.filter(g=>genres.some(x=>x.name===g.name)).map(g=>g.source)]}); }
  return {score,reasons};
}
export function recommend(seedId: string, catalog: StationTrack[], feedback: Feedback = {}, seen: string[] = []): Recommendation[] {
  const seed=catalog.find(t=>t.id===seedId); if(!seed)return [];
  const liked=catalog.filter(t=>feedback[t.id]==="like" && t.id!==seedId);
  const excluded=new Set(seen);
  const rows=catalog.filter(t=>t.id!==seed.id && t.recordingId!==seed.recordingId && t.albumFamily!==seed.albumFamily && feedback[t.id]!=="dislike" && !excluded.has(t.id))
    .map(track=>{
      const base=connection(seed,track);
      const boost=Math.min(1.5,liked.reduce((sum,t)=>sum+Math.min(1,connection(t,track).score/8),0));
      return {track,score:base.score+boost,reasons:base.reasons,feedbackBoost:boost>0};
    }).filter(r=>r.reasons.length>0);
  // A genre-only match cannot outrank a documented production/sample connection.
  const hasCredit=(r:Recommendation)=>r.reasons.some(x=>x.kind!=="genre");
  rows.sort((a,b)=>Number(hasCredit(b))-Number(hasCredit(a)) || b.score-a.score || a.track.id.localeCompare(b.track.id));
  // Spread artists out without silently dropping the rest of the verified queue.
  const queue:Recommendation[]=[];
  while(rows.length){
    const previous=queue.at(-1)?.track.artistId;
    const tier=hasCredit(rows[0]);
    const next=rows.findIndex(r=>hasCredit(r)===tier && r.track.artistId!==previous);
    queue.push(rows.splice(next<0?0:next,1)[0]);
  }
  return queue;
}
export function trackYouTubeUrl(track: StationTrack) {
  return "https://www.youtube.com/results?search_query="+encodeURIComponent(track.artist+" "+track.title+" official audio");
}
