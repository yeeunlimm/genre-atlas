import {liveSearch,liveStation,StationError} from "@/lib/live-station";
import {musicRequest,logMusicError,MusicLookupError} from "@/lib/music-request";
export async function GET(request:Request){
 return musicRequest(async()=>{
  const p=new URL(request.url).searchParams;
  try{
    if(p.has("q")){
      const limit=Number(p.get("limit")||40);
      if(![40,100,200].includes(limit))throw new StationError("Invalid search page size.",400);
      const catalog=p.get("catalog")||"apple";
      if(!["apple","apple-only","deezer","musicbrainz"].includes(catalog))throw new StationError("Invalid catalog.",400);
      return Response.json(await liveSearch(p.get("q")||"",limit,catalog));
    }
    const id=p.get("id")||"";
    if(!id||id.length>80)throw new StationError("Choose a starting track.",400);
    return Response.json(await liveStation(id,Number(p.get("offset")||0)));
  }catch(e){
    logMusicError("Station",p.has("q")?"search":"credits",e);
    const status=e instanceof StationError?e.status:502;
    return Response.json({error:e instanceof StationError||e instanceof MusicLookupError?e.message:"Music lookup took too long. Please retry; your selected track is kept."},{status});
  }
 },new URL(request.url).searchParams.has("q")?10000:30000);
}
