import {discoverGenre} from "@/lib/genre-discovery";
import {NamuError} from "@/lib/namu";
import {discoverMusicBrainzGenre} from "@/lib/musicbrainz-genres";
export const maxDuration=60;
export async function GET(request:Request){
 const u=new URL(request.url),title=u.searchParams.get("title")||"",offset=Number(u.searchParams.get("offset")||"0");
 if(!Number.isSafeInteger(offset)||offset<0||offset>720)return Response.json({error:"Invalid genre page."},{status:400});
 try{return Response.json(await (title.startsWith('musicbrainz:')?discoverMusicBrainzGenre(title,offset):discoverGenre(title,offset)),{headers:{"Cache-Control":"no-store"}});}
 catch(e){return Response.json({error:"Genre discovery is unavailable. Retry or open the source page."},{status:e instanceof NamuError?e.status:502,headers:{"Cache-Control":"no-store"}});}
}
