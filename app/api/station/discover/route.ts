import {env} from "cloudflare:workers";
import {discoverSource} from "@/lib/hybrid-sources";
import {musicRequest,logMusicError,MusicLookupError} from "@/lib/music-request";
export async function GET(request:Request){
 return musicRequest(async()=>{
  const p=new URL(request.url).searchParams,id=p.get("id")||"",route=p.get("route"),offset=Number(p.get("offset")||0);
  if(!id||id.length>80||!["related-artists","similar-tracks"].includes(route||"")||!Number.isInteger(offset)||offset<0||offset>24||offset%6!==0)return Response.json({error:"Invalid discovery request."},{status:400});
  try{
    const key=(env as unknown as Record<string,string|undefined>).LASTFM_API_KEY;
    return Response.json(await discoverSource(id,route as "related-artists"|"similar-tracks",offset,key),{headers:{"Cache-Control":"no-store"}});
  }catch(e){logMusicError("Station",route||"discovery",e);return Response.json({error:e instanceof MusicLookupError?e.message:"This discovery source could not load. Retry it; other sources remain available."},{status:502});}
 });
}
