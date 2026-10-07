import {songKey,type Candidate,type Memory} from './hybrid-station';
import type {StationTrack} from './station-catalog';

// Saved likes are an exclusion list, never extra seeds or ranking signals here.
// Keep this policy separate from the explicitly like-based playlist builder.
export function selectedSongRows(rows:Candidate[],liked:StationTrack[]):Candidate[]{
  const saved=new Set(liked.map(songKey));
  return rows.filter(row=>!saved.has(songKey(row.track)));
}
export function selectedSongMemory(memory:Memory):Memory{
  return {...memory,votes:Object.fromEntries(Object.entries(memory.votes)
    .filter(([,vote])=>vote.vote==='dislike')
    .map(([key,vote])=>[key,{...vote,routes:[]}]))};
}
