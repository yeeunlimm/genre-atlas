import {readFile} from 'node:fs/promises';
import {verifiedAccount} from '@/lib/supabase/server';
import {reviewKey} from '@/lib/liked-playlist';
import {positiveReviewCandidates,type ReviewSummary} from '@/lib/review-sentiment';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store',Vary:'Authorization'};
export async function GET(request:Request){
  try{
    if(!await verifiedAccount(request))return Response.json({error:'Sign in to create your personal playlist.'},{status:401,headers});
    if(process.env.NODE_ENV==='production'&&process.env.YOUTUBE_DERIVED_METRICS_APPROVED!=='true')return Response.json({error:'Comment-filtered playlists are not enabled on this server yet. Your discovery queue is not reused.'},{status:503,headers});
    const data=JSON.parse(await readFile(/* turbopackIgnore: true */ process.env.REVIEW_SCORES_PATH||'work/review-summaries.json','utf8'));
    if(data.version!==1||!Array.isArray(data.items)||!data.items.some((r:ReviewSummary)=>r.status==='ready'&&Date.now()-Date.parse(r.analyzedAt)>=0&&Date.now()-Date.parse(r.analyzedAt)<86400000))return Response.json({error:'No fresh review analysis is available. Run the review batch first.'},{status:503,headers});
    return Response.json({ready:true,experimental:true},{headers});
  }catch{return Response.json({error:'The review analysis batch is not available yet. No unanalysed songs were added.'},{status:503,headers});}
}
export async function POST(request:Request){
  try {
    if(!await verifiedAccount(request))return Response.json({error:'Sign in to create your personal playlist.'},{status:401,headers});
    if(request.headers.get('origin')!==new URL(request.url).origin)return Response.json({error:'Use this site.'},{status:403,headers});
    const raw=await request.text();if(raw.length>40000)return Response.json({error:'Too many candidates.'},{status:413,headers});
    let body;try{body=JSON.parse(raw);}catch{return Response.json({error:'Invalid request.'},{status:400,headers});}
    if(!Array.isArray(body.tracks)||body.tracks.length>100||body.tracks.some((t:any)=>!t||typeof t.title!=='string'||typeof t.artist!=='string'||t.title.length>800||t.artist.length>800))return Response.json({error:'Invalid candidates.'},{status:400,headers});
    // Do not pretend a developer flag constitutes YouTube approval.
    if(process.env.NODE_ENV==='production'&&process.env.YOUTUBE_DERIVED_METRICS_APPROVED!=='true')return Response.json({error:'Comment-filtered playlists are not enabled on this server yet. Your discovery queue is not reused.'},{status:503,headers});
    let data;try{data=JSON.parse(await readFile(/* turbopackIgnore: true */ process.env.REVIEW_SCORES_PATH||'work/review-summaries.json','utf8'));}catch{return Response.json({error:'The review analysis batch is not available yet. No unanalysed songs were added.'},{status:503,headers});}
    if(data.version!==1||!Array.isArray(data.items))throw new Error('Invalid review store');
    const wanted=new Set(body.tracks.map(reviewKey));
    const summaries:Record<string,ReviewSummary>={};
    for(const row of data.items){if(typeof row.artist!=='string'||typeof row.title!=='string')continue;const key=reviewKey(row);if(wanted.has(key)&&positiveReviewCandidates([{trackId:key}],new Map([[key,row]])).length)summaries[key]={status:row.status,score:row.score,sampleCount:row.sampleCount,analyzedAt:row.analyzedAt};}
    return Response.json({summaries,experimental:true},{headers});
  }catch{return Response.json({error:'Review results could not be loaded. Retry later.'},{status:503,headers});}
}
