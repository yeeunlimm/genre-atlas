import type {Credit, CreditRole, StationTrack} from "./station-catalog";

type Raw = Record<string, any>;
const roles: Record<string,CreditRole> = {
  "Producer":"producer", "Co-Producer":"producer", "Mixing Engineer":"mixing",
  "Mastering Engineer":"mastering", "Arranger":"arranger", "Songwriter":"songwriter", "Composer":"songwriter",
};

// Read the selected song's own credit section, never neighbouring album/artist cards.
// This public-page adapter is deliberately separate from Apple's catalog search API.
export function parseAppleCredits(html:string, track:StationTrack):Credit[] {
  const raw=html.match(/<script\b(?=[^>]*\bid=["']serialized-server-data["'])[^>]*>([\s\S]*?)<\/script>/i)?.[1];
  if(!raw)throw new Error("Apple credit page format is unavailable.");
  const data=JSON.parse(raw), id=track.id.replace(/^itunes:/, "");
  const pages:Raw[]=[];
  function visit(value:any){
    if(!value||typeof value!=="object")return;
    if(Array.isArray(value.sections))pages.push(value);
    for(const child of Object.values(value))visit(child);
  }
  visit(data);
  const page=pages.find(p=>p.sections.some((s:Raw)=>s.itemKind==="songDetailHeader"&&s.items?.some((i:Raw)=>String(i.contentDescriptor?.identifiers?.storeAdamID)===id)));
  if(!page)throw new Error("Apple credit page did not match the selected song ID.");
  const source={label:"Apple Music · song credits",url:"https://music.apple.com/us/song/"+id};
  const credits:Credit[]=[];
  for(const section of page.sections){
    if(!["production-and-engineering","composer-and-lyrics"].includes(section.id))continue;
    for(const item of section.items||[])for(const name of item.roleNames||[]){
      if(typeof item.name!=="string"||!roles[name])continue;
      credits.push({person:"apple-credit:"+item.name,name:item.name,role:roles[name],scope:"track",source});
    }
  }
  return credits;
}

export async function fetchAppleCredits(track:StationTrack):Promise<Credit[]>{
  if(!/^itunes:\d{1,16}$/.test(track.id))return [];
  const response=await fetch("https://music.apple.com/us/song/"+track.id.slice(7),{
    headers:{Accept:"text/html","Accept-Language":"en-US,en;q=0.9"},signal:AbortSignal.timeout(12000),
  });
  if(!response.ok)throw new Error("Apple song credits are temporarily unavailable.");
  const html=await response.text();
  if(html.length>3_000_000)throw new Error("Apple credit page exceeded the size limit.");
  return parseAppleCredits(html,track);
}
