"use client";
import {useEffect,useRef,useState} from "react";
import {Disc3} from "lucide-react";
import type {StationTrack} from "@/lib/station-catalog";

const covers=new Map<string,string|null>();
export function StationArtwork({track,size}:{track:StationTrack;size:"seed"|"recommendation"}){
  const release=track.artworkReleaseId;
  const initial=track.artworkUrl||(release&&/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(release)?"https://coverartarchive.org/release/"+release+"/front-500":null);
  const [url,setUrl]=useState<string|null>(initial),[lookup,setLookup]=useState(!initial),[unavailable,setUnavailable]=useState(false);
  const attempted=useRef(false);
  useEffect(()=>{
    if(!lookup)return;
    const abort=new AbortController(),key=track.artist+"\n"+track.album;
    attempted.current=true;
    if(covers.has(key)){const saved=covers.get(key)!;setUrl(saved);setUnavailable(!saved);setLookup(false);return;}
    void fetch("/api/station/artwork?"+new URLSearchParams({artist:track.artist,album:track.album}),{signal:abort.signal}).then(async r=>{
      if(!r.ok)throw new Error("Artwork unavailable");
      const data=await r.json() as {url:string|null};
      if(abort.signal.aborted)return;
      if(covers.size>=100)covers.delete(covers.keys().next().value!);
      covers.set(key,data.url);setUrl(data.url);setUnavailable(!data.url);
    }).catch(()=>{if(!abort.signal.aborted)setUnavailable(true);}).finally(()=>{if(!abort.signal.aborted)setLookup(false);});
    return ()=>abort.abort();
  },[lookup,track.artist,track.album]);
  return <figure className={"station-artwork station-artwork--"+size} aria-label={size==="seed"?"Starting album cover":"Recommended album cover"}>
    {url?<img src={url} alt={track.album+" — album cover"} width={600} height={600} decoding="async" onError={()=>{setUrl(null);if(!attempted.current)setLookup(true);else setUnavailable(true);}}/>:<div className="station-artwork-placeholder"><Disc3 size={28} strokeWidth={1} aria-hidden="true"/><span>{unavailable?"Cover unavailable":"Loading cover…"}</span></div>}
  </figure>;
}
