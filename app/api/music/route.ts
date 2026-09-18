import {music,MusicError} from "@/lib/youtube-music";
export async function GET(request:Request){
 const u=new URL(request.url),kind=u.searchParams.get("kind")||"search",value=u.searchParams.get("q")||"";
 if(!["search","artist"].includes(kind))return Response.json({error:"지원하지 않는 요청입니다."},{status:400});
 try{return Response.json(await music(kind,value),{headers:{"Cache-Control":"no-store"}});}
 catch(e){return Response.json({error:e instanceof Error?e.message:"연결 실패"},{status:e instanceof MusicError?e.status:502});}
}

