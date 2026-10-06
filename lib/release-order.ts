import type {ReleaseCard} from "./releases";
export type ReleaseOrder="popular"|"latest";
export function albumFans(release:ReleaseCard):number|null {
 return typeof release.fans==="number"&&Number.isSafeInteger(release.fans)&&release.fans>=0?release.fans:null;
}
export function orderReleases(releases:ReleaseCard[],order:ReleaseOrder):ReleaseCard[]{
 return [...releases].sort((a,b)=>{
  if(order==="popular"){
   const af=albumFans(a),bf=albumFans(b);
   if(af!==bf)return af===null?1:bf===null?-1:bf-af;
  }
  return b.date.localeCompare(a.date)||a.title.localeCompare(b.title)||a.id.localeCompare(b.id);
 });
}
