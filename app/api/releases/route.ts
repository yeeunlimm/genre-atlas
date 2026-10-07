import {artistReleases,albumDetail} from "@/lib/releases";
import {catalogReleases} from "@/lib/release-fallback";
import {musicRequest,logMusicError} from "@/lib/music-request";
import {StationError} from "@/lib/live-station";
import {collectionAlbumDetail} from "@/lib/collection-release";
export async function GET(request:Request){
 return musicRequest(async()=>{const p=new URL(request.url).searchParams;
  try{
   if(p.get("kind")==="collection")return Response.json(await collectionAlbumDetail(p.get("source")||""));
   const albums=p.getAll("album");
   if(albums.length>4||albums.some(a=>a.length>200))throw new StationError("Invalid album matching hints.",400);
   return Response.json(p.get("kind")==="album"?await albumDetail(p.get("provider")||"",p.get("id")||""):await catalogReleases(p.get("artist")||"",p.get("provider")||"musicbrainz",p.get("id")||"",Number(p.get("offset")||0),{albums,choose:p.get("choose")==="1"}));
  }
  catch(e){logMusicError("Releases","catalog",e);return Response.json({error:e instanceof StationError?e.message:"The release catalog could not load. Retry or try the other catalog."},{status:e instanceof StationError?e.status:502});}
 },28000);
}
