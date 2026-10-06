import type {StationTrack} from "./station-catalog";
import {albumKey,songKey} from "./hybrid-station";
const norm=(s:string)=>s.toLowerCase().replaceAll("$","s").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^\p{L}\p{N}]+/gu,"");
export function mergeSearch(tracks:StationTrack[],query:string){
  const out=new Map<string,StationTrack>();
  for(const t of tracks){const key=songKey(t)+":"+albumKey(t.album)+":"+(t.explicitness==="cleaned"?"clean":"default");const old=out.get(key);if(!old||(!old.catalogKind&&t.catalogKind))out.set(key,t);}
  const terms=query.trim().split(/\s+/).map(norm).filter(Boolean);
  const relevance=(t:StationTrack)=>terms.filter(term=>norm(t.artist+" "+t.title).includes(term)).length;
  return [...out.values()].sort((a,b)=>relevance(b)-relevance(a));
}
