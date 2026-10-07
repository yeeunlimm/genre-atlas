"use client";
import type {StationTrack} from '@/lib/station-catalog';
import {trackYouTubeUrl} from '@/lib/discovery-station';
import {songKey} from '@/lib/hybrid-station';

export function LikedSongs({liked,onExplore,onRemove,disabled=false}:{liked:StationTrack[];onExplore:(track:StationTrack)=>void;onRemove:(track:StationTrack)=>void;disabled?:boolean}){
  return <section className="station-playlist station-liked-songs" id="liked-songs" aria-labelledby="liked-songs-title">
    <h3 id="liked-songs-title">Liked songs · 찜 목록 <span>({liked.length})</span></h3>
    <p>Saved in this browser for your account. These likes are the starting point for your personal playlist.</p>
    {liked.length?<ol>{liked.map(track=><li key={songKey(track)}>
      <div><b>{track.title}</b><small>{track.artist} · {track.album}</small>
        <div className="station-feedback">
          <a href={trackYouTubeUrl(track)} target="_blank" rel="noreferrer" aria-label={'Listen to '+track.title}>Listen ↗</a>
          <button disabled={disabled} onClick={()=>onExplore(track)} aria-label={'Explore '+track.title}>Explore song</button>
          <button disabled={disabled} onClick={()=>onRemove(track)} aria-label={'Remove '+track.title+' from liked songs'}>Remove like</button>
        </div>
      </div>
    </li>)}</ol>:<p>No liked songs yet. Search and select a song, then press Like. A personal playlist cannot be created without likes.</p>}
    <small>Removing a like removes this playlist seed; it is not a dislike and does not erase past ratings.</small>
  </section>;
}
