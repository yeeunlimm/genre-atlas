"use client";
import {useEffect,useRef,useState} from "react";
import {browserAuth} from "@/lib/supabase/browser";
import {AUTH_RETURN_KEY,safeAuthReturn} from "@/lib/auth-return";
import {AccountButton} from "@/components/account-provider";

export default function AuthCallback(){
  const [failed,setFailed]=useState(false);
  const exchange=useRef<Promise<void>|null>(null);
  useEffect(()=>{
    // Reuse one exchange under React Strict Mode: authorization codes are single-use.
    if(!exchange.current)exchange.current=(async()=>{
      const params=new URLSearchParams(location.search),code=params.get("code");
      const denied=params.has("error")||params.has("error_code");
      history.replaceState(null,"","/auth/callback");
      if(denied||!code)throw new Error("No authorization code");
      const {error}=await browserAuth().auth.exchangeCodeForSession(code);
      if(error)throw error;
      const target=safeAuthReturn(sessionStorage.getItem(AUTH_RETURN_KEY));
      sessionStorage.removeItem(AUTH_RETURN_KEY);
      location.replace(target);
    })();
    void exchange.current.catch(()=>setFailed(true));
  },[]);
  return <main className="account-page"><a href="/">GENRE ATLAS</a><h1>{failed?"로그인을 완료하지 못했어요":"카카오 로그인 연결 중…"}</h1><p role="status">{failed?"취소했거나 로그인 요청이 만료됐습니다. 같은 브라우저에서 다시 시도해 주세요.":"로그인이 끝나면 보고 계시던 화면으로 돌아갑니다."}</p>{failed&&<><AccountButton/><p><a href="/">로그인 없이 돌아가기</a></p></>}</main>;
}
