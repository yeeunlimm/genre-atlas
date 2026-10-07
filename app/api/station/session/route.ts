import {verifiedAccount} from "@/lib/supabase/server";
import {stationCatalog} from "@/lib/station-catalog";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store",Vary:"Authorization"};
const validId=(id:unknown):id is string=>typeof id==="string"&&(stationCatalog.some(t=>t.id===id)||/^(?:itunes|deezer):\d{1,16}$/.test(id)||/^mb:[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id));
export async function GET(request:Request){
  try{const user=await verifiedAccount(request);return Response.json({userId:user?.id||null,provider:"kakao"},{headers});}
  catch{return Response.json({error:"Sign-in status could not be checked. You can still discover music."},{status:503,headers});}
}
export async function POST(request:Request){
  // Supabase verifies the bearer token; never accept a client-supplied identity.
  try{
    const user=await verifiedAccount(request);if(!user)return Response.json({error:"Sign in with Kakao to like a song."},{status:401,headers});
    if(request.headers.get("Origin")!==new URL(request.url).origin||request.headers.get("Sec-Fetch-Site")==="cross-site")return Response.json({error:"Use the like button on this site."},{status:403,headers});
    if(!request.headers.get("content-type")?.startsWith("application/json"))return Response.json({error:"Invalid request."},{status:415,headers});
    const body=await request.text();if(body.length>1024)return Response.json({error:"Request too large."},{status:413,headers});
    let data:{trackId?:unknown};try{data=JSON.parse(body);}catch{return Response.json({error:"Invalid request."},{status:400,headers});}
    if(!validId(data?.trackId))return Response.json({error:"Choose a valid song."},{status:400,headers});
    // User explicitly chose browser-only persistence. This endpoint authorizes the
    // action; it does not create an account database or promise cross-device sync.
    return Response.json({userId:user.id,trackId:data.trackId,allowed:true},{headers});
  }catch{return Response.json({error:"Your sign-in could not be verified. Try again."},{status:503,headers});}
}
