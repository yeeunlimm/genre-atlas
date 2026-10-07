"use client";
import {useState,useEffect,useRef,useMemo,type CSSProperties} from 'react';
import type {StationTrack} from '@/lib/station-catalog';
import {trackYouTubeUrl} from '@/lib/discovery-station';
import {songKey} from '@/lib/hybrid-station';
import {shuffledVinyl} from '@/lib/vinyl-layout';
import {StationArtwork} from './station-artwork';
import styles from './liked-songs.module.css';

function RecordCaption({title,artist}:{title:string;artist:string}){
  const box=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const el=box.current;if(!el)return;
    const fit=()=>{
      let size=14;el.style.fontSize=size+'px';
      while(size>5&&(el.scrollHeight>el.clientHeight||el.scrollWidth>el.clientWidth)){
        size-=.5;el.style.fontSize=size+'px';
      }
    };
    fit();const observer=new ResizeObserver(fit);observer.observe(el);
    return()=>observer.disconnect();
  },[title,artist]);
  return <div ref={box} className={styles.labelCopy}><b>{title}</b><small>{artist}</small></div>;
}

export function LikedSongs({liked,onExplore,onRemove,disabled=false}:{liked:StationTrack[];onExplore:(track:StationTrack)=>void;onRemove:(track:StationTrack)=>void;disabled?:boolean}){
  const [selected,setSelected]=useState<string|null>(null),[hovered,setHovered]=useState<string|null>(null);
  const [shuffleSeed,setShuffleSeed]=useState(1);
  useEffect(()=>{setShuffleSeed(crypto.getRandomValues(new Uint32Array(1))[0]);},[]);
  const arranged=useMemo(()=>shuffledVinyl(liked,shuffleSeed),[liked,shuffleSeed]);
  const center=Math.max(0,arranged.findIndex(t=>songKey(t)===selected));
  const slots=Math.min(9,arranged.length);
  const visible=Array.from({length:slots},(_,offset)=>{
    const relative=offset-Math.floor(slots/2);
    const index=(center+relative+arranged.length)%arranged.length;
    const t=.5+relative/10;
    return {track:arranged[index],t};
  });
  const step=(delta:number)=>{if(arranged.length){setSelected(songKey(arranged[(center+delta+arranged.length)%arranged.length]));setHovered(null);}};
  const active=liked.find(t=>songKey(t)===(hovered||selected))||arranged[center];
  return <section className={styles.sleeve} id="liked-songs" aria-label="Liked songs">
    <header className={styles.header}><span>YOUR PLAYLIST / {String(liked.length).padStart(2,'0')} TRACKS</span></header>
    <div className={`${styles.stage} ${styles.arcStage}`}>
      <div className={styles.record} aria-hidden="true"><div className={styles.label}><i/><RecordCaption title={active?.title||'SIDE A'} artist={active?.artist||'33⅓ RPM'}/></div></div>
      <div className={styles.covers} role="group" aria-label="Liked songs around the record">
        {visible.map(({track,t})=>{const key=songKey(track);
          return <button key={key} type="button" className={styles.cover} style={{left:(10+35*Math.sin(Math.PI*t))+'%',top:(2+96*t)+'%','--tilt':(-65+130*t)+'deg','--dx':'8px','--dy':'0px','--depth':1} as CSSProperties} data-active={t===.5} aria-label={`${track.title} — ${track.artist}`} aria-pressed={t===.5} aria-controls="liked-song-detail" onMouseEnter={()=>setHovered(key)} onMouseLeave={()=>setHovered(null)} onClick={()=>{setSelected(key);setHovered(null);}} onKeyDown={e=>{if(e.key==='ArrowDown'||e.key==='ArrowRight'){e.preventDefault();step(1);}if(e.key==='ArrowUp'||e.key==='ArrowLeft'){e.preventDefault();step(-1);}}}>
            <StationArtwork track={track} size="seed"/>
          </button>;
        })}
      </div>
    </div>
    {liked.length>1&&<div className={styles.actions} aria-label="Playlist navigation"><button onClick={()=>step(-1)} aria-label="Previous playlist cover">←</button><button onClick={()=>step(1)} aria-label="Next playlist cover">→</button></div>}
    <div id="liked-song-detail" className={styles.detail}>
      {active?<><span className={styles.eyebrow}>ON YOUR RECORD</span><h4>{active.title}</h4><p>{active.artist} <span> / {active.album}</span></p><div className={styles.actions}>
        <a href={trackYouTubeUrl(active)} target="_blank" rel="noreferrer" aria-label={'Listen to '+active.title}>Listen ↗</a>
        <button disabled={disabled} onClick={()=>onExplore(active)}>Explore song</button>
        <button disabled={disabled} onClick={()=>onRemove(active)} aria-label={'Remove '+active.title+' from liked songs'}>Remove like</button>
      </div></>:<p>No liked songs yet. Search and select a song, then press Like. A personal playlist cannot be created without likes.</p>}
    </div>
    <small className={styles.footer}>Saved in this browser for your account. Removing a like does not change past ratings.</small>
  </section>;
}
