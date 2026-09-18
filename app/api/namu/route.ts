import {getNamu,NamuError} from "@/lib/namu";
export async function GET(request:Request){
 const u=new URL(request.url),kind=u.searchParams.get("kind")||"artist",title=u.searchParams.get("title")||"";
 if(kind!=="artist"&&kind!=="genre")return Response.json({error:"지원하지 않는 검색 종류입니다."},{status:400});
 try{return Response.json(await getNamu(title,kind),{headers:{"Cache-Control":"no-store"}});}
 catch(e){return Response.json({error:e instanceof Error?e.message:"문서를 읽지 못했습니다."},{status:e instanceof NamuError?e.status:502});}
}
