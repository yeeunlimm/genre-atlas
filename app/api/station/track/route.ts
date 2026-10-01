import {loadTrack,StationError} from "@/lib/live-station";
export async function GET(request:Request){
  const id=new URL(request.url).searchParams.get("id")||"";
  if(!id||id.length>80)return Response.json({error:"Choose a song."},{status:400});
  try{return Response.json({track:await loadTrack(id)});}
  catch(e){return Response.json({error:"The selected song could not be restored. Search for it again."},{status:e instanceof StationError?e.status:502});}
}
