import {verifiedAccount} from '@/lib/supabase/server';
import {reviewKey,PLAYLIST_CANDIDATE_LIMIT,PLAYLIST_TRACK_LIMIT} from '@/lib/liked-playlist';
import {reviewAvailability,analyzePlaylistTrack} from '@/lib/playlist-review-service';
import {playlistReviewStream} from '@/lib/playlist-review-stream';
import type {ReviewTrack} from '@/lib/playlist-review-types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
// Per warm process only. Provider quota remains the cross-instance hard ceiling.
let running=false;
const recent=new Map<string,number>();
export async function GET(request:Request){
  try{
    if(!await verifiedAccount(request))return Response.json({error:'Sign in to create your personal playlist.'},{status:401,headers});
    return Response.json({...reviewAvailability(),experimental:true,candidateLimit:PLAYLIST_CANDIDATE_LIMIT,playlistLimit:PLAYLIST_TRACK_LIMIT},{headers});
  }catch{return Response.json({error:'Account verification is unavailable. Try again later.'},{status:503,headers});}
}
function validTrack(track:unknown):track is ReviewTrack{
  if(!track||typeof track!=='object')return false;
  const t=track as ReviewTrack;
  return typeof t.title==='string'&&!!t.title.trim()&&t.title.length<=300
    &&typeof t.artist==='string'&&!!t.artist.trim()&&t.artist.length<=300
    &&(t.primaryArtistName===undefined||(typeof t.primaryArtistName==='string'&&!!t.primaryArtistName.trim()&&t.primaryArtistName.length<=300))
    &&(t.durationMs===undefined||(Number.isFinite(t.durationMs)&&t.durationMs>=30000&&t.durationMs<=1800000));
}
export async function POST(request:Request){
  try{
    const account=await verifiedAccount(request);
    if(!account)return Response.json({error:'Sign in to create your personal playlist.'},{status:401,headers});
    if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Use this site.'},{status:403,headers});
    const raw=await request.text();
    if(raw.length>30000)return Response.json({error:'Too many candidates.'},{status:413,headers});
    let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid request.'},{status:400,headers});}
    if(!Array.isArray(body?.tracks)||!body.tracks.length||body.tracks.length>PLAYLIST_CANDIDATE_LIMIT||!body.tracks.every(validTrack)||new Set(body.tracks.map(reviewKey)).size!==body.tracks.length)return Response.json({error:'Send between 1 and '+PLAYLIST_CANDIDATE_LIMIT+' distinct candidate songs.'},{status:400,headers});
    const availability=reviewAvailability();
    if(!availability.ready)return Response.json({error:availability.reason},{status:503,headers});
    for(const [id,at] of recent)if(at<Date.now()-60000)recent.delete(id);
    if(running||recent.has(account.id))return Response.json({error:'Another comment analysis is running, or you just started one. Please retry in a minute.'},{status:429,headers:{...headers,'Retry-After':'60'}});
    running=true;recent.set(account.id,Date.now());
    const stream=playlistReviewStream(body.tracks,analyzePlaylistTrack,request.signal,()=>{running=false;});
    return new Response(stream,{headers:{...headers,'Content-Type':'application/x-ndjson; charset=utf-8','X-Content-Type-Options':'nosniff'}});
  }catch{return Response.json({error:'Playlist analysis could not start. Try again later.'},{status:503,headers});}
}
