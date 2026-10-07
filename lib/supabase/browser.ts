import {createClient, type SupabaseClient} from "@supabase/supabase-js";

let client: SupabaseClient | undefined;
export function browserAuth() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) throw new Error("Kakao sign-in is not configured on this deployment yet.");
  return client??=createClient(url,key,{auth:{flowType:"pkce",detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}});
}

export async function accountFetch(url:string,init:RequestInit={}) {
  const {data:{session},error}=await browserAuth().auth.getSession();
  if(error)throw error;
  const headers=new Headers(init.headers);
  if(session)headers.set("Authorization",`Bearer ${session.access_token}`);
  return fetch(url,{...init,headers,cache:"no-store"});
}
