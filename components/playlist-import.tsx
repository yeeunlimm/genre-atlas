"use client";
import {useEffect,useRef,useState} from 'react';
import type {StationTrack} from '@/lib/station-catalog';
import {songKey} from '@/lib/hybrid-station';

type Row={query:string;tracks:StationTrack[];selected:string;note:string};
const norm=(s:string)=>s.toLowerCase().normalize('NFKC').replace(/\band\b/g,'').replace(/[^\p{L}\p{N}]/gu,'');
export function PlaylistImport({onAdd}:{onAdd:(tracks:StationTrack[])=>Promise<void>}){
 const [input,setInput]=useState(''),[rows,setRows]=useState<Row[]>([]),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const request=useRef<AbortController|null>(null);
 useEffect(()=>()=>request.current?.abort(),[]);
 async function lookup(){
  const lines=input.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!lines.length||lines.length>100){setMessage('Enter 1–100 songs, one per line.');return;}
  request.current?.abort();const c=new AbortController();request.current=c;
  setBusy(true);setRows([]);setMessage('Searching…');
  const next:Row[]=lines.map(query=>({query,tracks:[],selected:'',note:'Waiting'}));setRows([...next]);
  try{for(let i=0;i<lines.length&&!c.signal.aborted;i++){
   const parts=lines[i].split(/\s+-\s+/),title=parts[0],artist=parts.slice(1).join(' - ');
   let tracks:StationTrack[]=[],success=false;
   for(const catalog of ['deezer','apple-only']){
    try{const r=await fetch('/api/station?'+new URLSearchParams({q:title+' '+artist,catalog,limit:'40'}),{signal:AbortSignal.any([c.signal,AbortSignal.timeout(14000)])});
     if(!r.ok)continue;const d=await r.json() as {tracks?:StationTrack[]};success=true;tracks=d.tracks||[];
     if(tracks.length)break;
    }catch{if(c.signal.aborted)break;}
   }
   const unique=[...new Map(tracks.map(t=>[songKey(t),t])).values()].slice(0,15);
   const exact=unique.find(t=>norm(t.title)===norm(title)&&norm(t.artist)===norm(artist));
   next[i]={query:lines[i],tracks:unique,selected:exact?.id||'',note:unique.length?'Review match':success?'Not found':'Search unavailable — retry'};
   setRows([...next]);setMessage(`Checked ${i+1} / ${lines.length}`);
  }}finally{if(!c.signal.aborted)setBusy(false);}
 }
 async function save(){setBusy(true);try{const selected=rows.flatMap(r=>r.tracks.filter(t=>t.id===r.selected));await onAdd(selected);setMessage(`Added selected songs (${selected.length}); existing duplicates kept once.`);setRows([]);setInput('');}catch(e){setMessage(e instanceof Error?e.message:'Could not save.');}finally{setBusy(false);}}
 const count=rows.filter(r=>r.selected).length;
 return <details className="station-playlist-import"><summary>Add songs from a list</summary>
  <label htmlFor="playlist-import-text">Songs to add — Title - Artist, one per line</label>
  <textarea id="playlist-import-text" value={input} onChange={e=>setInput(e.target.value)} disabled={busy} rows={6} maxLength={16000} style={{display:'block',width:'100%',background:'#151515',color:'#eee',border:'1px solid #555',padding:12,marginBlock:12}}/>
  <button disabled={busy||!input.trim()} onClick={()=>void lookup()}>Find listed songs</button>
  <p role="status">{message}</p>
  {rows.map((r,i)=><div key={i} style={{marginBlock:12}}><label htmlFor={'import-song-'+i}>{i+1}. {r.query}</label><select id={'import-song-'+i} disabled={busy} value={r.selected} onChange={e=>setRows(prev=>prev.map((x,j)=>j===i?{...x,selected:e.target.value}:x))} style={{display:'block',width:'100%',background:'#151515',color:'#eee',minHeight:44}}><option value="">Skip — {r.note}</option>{r.tracks.map(t=><option key={t.id} value={t.id}>{t.title} — {t.artist} / {t.album}</option>)}</select></div>)}
  {rows.length>0&&<button disabled={busy||!count} onClick={()=>void save()}>Add {count} selected songs</button>}
 </details>;
}
