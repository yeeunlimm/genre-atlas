import {createClient} from "@supabase/supabase-js";

export async function verifiedAccount(request:Request) {
  const authorization=request.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer "))return null;
  const token=authorization.slice(7);
  if(!token||token.length>8192)return null;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key)throw new Error("Account service is not configured.");
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)})}});
  // Verify with Auth; never trust a decoded JWT, body userId, or forwarded headers.
  const {data,error}=await client.auth.getUser(token);
  if(error){if(error.status===401||error.status===403)return null;throw new Error("Account verification unavailable.");}
  return data.user;
}
