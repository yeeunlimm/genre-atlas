import {artistGenres} from '@/lib/musicbrainz-genres';
import {NamuError} from '@/lib/namu';
export const maxDuration=60;
export async function GET(request:Request){
 try{return Response.json(await artistGenres(new URL(request.url).searchParams.get('title')||''),{headers:{'Cache-Control':'no-store'}});}
 catch(e){return Response.json({error:e instanceof NamuError?e.message:'Genre sources are temporarily unavailable. Please retry.'},{status:e instanceof NamuError?e.status:502,headers:{'Cache-Control':'no-store'}});}
}
