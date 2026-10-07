"use client";
import {useState,type CSSProperties} from 'react';
import type {StationTrack} from '@/lib/station-catalog';
import {trackYouTubeUrl} from '@/lib/discovery-station';
import {songKey} from '@/lib/hybrid-station';
import {vinylPosition} from '@/lib/vinyl-layout';
import {StationArtwork} from './station-artwork';
import styles from './liked-songs.module.css';

export function LikedSongs({liked,onExplore,onRemove,disabled=false}:{liked:StationTrack[];onExplore:(track:StationTrack)=>void;onRemove:(track:StationTrack)=>void;disabled?:boolean}){
  const [selected,setSelected]=useState<string|null>(null),[hovered,setHovered]=useState<string|null>(null);
  const active=liked.find(t=>songKey(t)===(hovered||selected))||liked[0];
  return <section className={styles.sleeve} id="liked-songs" aria-labelledby="liked-songs-title">
    <header className={styles.header}><span>YOUR PERSONAL PRESSING / {String(liked.length).padStart(2,'0')} TRACKS</span><h3 id="liked-songs-title">MY RECENT <em>favs.</em></h3><p>Liked songs · 찜 목록 ({liked.length})</p></header>
    <p className={styles.hint}>Hover, focus or tap a cover · 커버를 선택해 보세요</p>
    <div className={styles.stage}>
      <div className={styles.record} aria-hidden="true"><div className={styles.label}><span>GENRE ATLAS</span><i/><b>{active?.title||'SIDE A'}</b><small>{active?.artist||'33⅓ RPM'}</small></div></div>
      <div className={styles.covers} role="group" aria-label="Liked songs around the record">
        {liked.map((track,index)=>{const key=songKey(track),p=vinylPosition(index,liked.length);
          return <button key={key} type="button" className={styles.cover} style={{left:p.x+'%',top:p.y+'%','--tilt':p.tilt+'deg','--dx':p.dx+'px','--dy':p.dy+'px'} as CSSProperties} data-active={!!active&&songKey(active)===key} aria-label={`${index+1}. ${track.title} — ${track.artist}`} aria-pressed={selected===key} aria-controls="liked-song-detail" onMouseEnter={()=>setHovered(key)} onMouseLeave={()=>setHovered(null)} onFocus={()=>setSelected(key)} onClick={()=>setSelected(key)} onKeyDown={e=>{if(e.key==='Escape'){setSelected(null);setHovered(null);}}}>
            <StationArtwork track={track} size="seed"/><span className={styles.number}>{String(index+1).padStart(2,'0')}</span>
          </button>;
        })}
      </div>
    </div>
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
