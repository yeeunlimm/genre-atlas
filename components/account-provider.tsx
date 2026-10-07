"use client";
import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {browserAuth} from "@/lib/supabase/browser";
import {AUTH_RETURN_KEY,safeAuthReturn} from "@/lib/auth-return";

type Account={userId:string|null;ready:boolean;busy:boolean;error:string;signIn:(returnTo?:string)=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<Account|null>(null);
export function AccountProvider({children}:{children:ReactNode}){
  const [userId,setUserId]=useState<string|null>(null),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{
    let active=true;
    try{
      const client=browserAuth();
      const {data:{subscription}}=client.auth.onAuthStateChange((_event,session)=>{
        if(!active)return;setUserId(session?.user.id??null);setReady(true);
        window.dispatchEvent(new Event("genre-atlas:account-changed"));
      });
      void client.auth.getSession().then(({error})=>{if(active&&error){setError("Sign-in could not be restored. Please try signing in again.");setReady(true);}});
      return()=>{active=false;subscription.unsubscribe();};
    }catch(e){setError(e instanceof Error?e.message:"Sign-in is unavailable.");setReady(true);}
    return()=>{active=false;};
  },[]);
  async function signIn(returnTo?:string){
    if(busy)return;setBusy(true);setError("");
    try{
      sessionStorage.setItem(AUTH_RETURN_KEY,safeAuthReturn(returnTo??location.pathname+location.search+location.hash));
      const {error}=await browserAuth().auth.signInWithOAuth({provider:"kakao",options:{redirectTo:location.origin+"/auth/callback",scopes:"profile_nickname profile_image"}});
      if(error)throw error;
    }catch{setError("Could not start Kakao sign-in. Allow browser storage and try again.");setBusy(false);}
  }
  async function signOut(){
    if(busy)return;setBusy(true);setError("");
    try{const {error}=await browserAuth().auth.signOut({scope:"local"});if(error)throw error;}
    catch{setError("Sign-out failed. Please try again.");}finally{setBusy(false);}
  }
  return <Context.Provider value={{userId,ready,busy,error,signIn,signOut}}>{children}</Context.Provider>;
}
export function useAccount(){const account=useContext(Context);if(!account)throw new Error("AccountProvider is required");return account;}
export function AccountButton({returnTo}:{returnTo?:string}){
  const account=useAccount();
  return <span className="account-control"><button className={account.userId?"account-button":"account-button kakao-button"} disabled={!account.ready||account.busy} onClick={()=>void(account.userId?account.signOut():account.signIn(returnTo))}>{!account.ready?"Checking sign-in…":account.busy?"Please wait…":account.userId?"Sign out":"카카오 로그인"}</button>{account.error&&<span className="account-error" role="alert">{account.error}</span>}</span>;
}
