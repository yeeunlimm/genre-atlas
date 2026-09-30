import {albumArtwork,StationError} from "@/lib/live-station";
export async function GET(request:Request){
  const p=new URL(request.url).searchParams;
  try{return Response.json(await albumArtwork(p.get("artist")||"",p.get("album")||""),{headers:{"Cache-Control":"public, max-age=900"}});}
  catch(e){return Response.json({url:null,error:"Album artwork is unavailable."},{status:e instanceof StationError?e.status:502});}
}
