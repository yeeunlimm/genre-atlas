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
      // `scopes` appends to Kakao's default account_email scope in Supabase Auth.
      // Override the provider scope instead; the project also allows users without email.
      const {error}=await browserAuth().auth.signInWithOAuth({provider:"kakao",options:{redirectTo:location.origin+"/auth/callback",queryParams:{scope:"profile_nickname profile_image"}}});
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
// Official Kakao Login symbol, preserving its path and proportions:
// https://developers.kakao.com/tool/images/resource/preview/login-complete-en.svg
function KakaoSymbol(){return <svg className="kakao-symbol" viewBox="44 16 14 14" width="20" height="20" aria-hidden="true" focusable="false"><path d="M50.501 16.5225C46.9222 16.5225 44.0225 19.0037 44.0225 22.0641C44.0225 24.0312 45.2219 25.7596 47.0292 26.7423L46.4181 29.2113C46.3954 29.285 46.4132 29.364 46.4619 29.4184C46.4975 29.457 46.5461 29.478 46.5931 29.478C46.6337 29.478 46.6742 29.464 46.7082 29.4341L49.334 27.5144C49.7117 27.5723 50.1007 27.6039 50.4994 27.6039C54.0767 27.6039 56.978 25.1226 56.978 22.0623C56.978 19.002 54.0783 16.5225 50.501 16.5225Z" fill="#000"/></svg>;}
export function AccountButton({returnTo}:{returnTo?:string}){
  const account=useAccount();
  return <span className="account-control"><button type="button" className={account.userId?"account-button":"account-button kakao-button"} disabled={!account.ready||account.busy} onClick={()=>void(account.userId?account.signOut():account.signIn(returnTo))}>{!account.userId&&<KakaoSymbol/>}<span>{!account.ready?"Checking sign-in…":account.busy?"Please wait…":account.userId?"Sign out":"Login with Kakao"}</span></button>{account.error&&<span className="account-error" role="alert">{account.error}</span>}</span>;
}
