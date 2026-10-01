import {liveSearch,liveStation,StationError} from "@/lib/live-station";
export async function GET(request:Request){
  const p=new URL(request.url).searchParams;
  try{
    if(p.has("q")){
      const limit=Number(p.get("limit")||40);
      if(![40,100,200].includes(limit))throw new StationError("Invalid search page size.",400);
      return Response.json(await liveSearch(p.get("q")||"",limit,p.get("catalog")==="musicbrainz"?"musicbrainz":"apple"));
    }
    const id=p.get("id")||"";
    if(!id||id.length>80)throw new StationError("Choose a starting track.",400);
    return Response.json(await liveStation(id,Number(p.get("offset")||0)));
  }catch(e){
    const status=e instanceof StationError?e.status:502;
    return Response.json({error:e instanceof StationError?e.message:"Music lookup took too long. Please retry; your selected track is kept."},{status});
  }
}
