// Server/worker only. Never import this module into a client component.
export type YouTubeComment = {id:string;text:string};
export type CommentBatch = {status:"ready"|"empty"|"disabled";comments:YouTubeComment[];hasMore:boolean};

export async function youtubeReviewComments(videoId:string, apiKey:string, request:typeof fetch=fetch):Promise<CommentBatch> {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID.");
  if (!apiKey) throw new Error("YouTube server key is not configured.");
  const comments:YouTubeComment[]=[];
  const seenIds=new Set<string>(),seenText=new Set<string>();
  let hasMore=false;
  // A bounded sample: recent and relevant top-level comments, not all comments.
  for (const order of ["time","relevance"]) {
    const query=new URLSearchParams({part:"snippet",videoId,maxResults:"100",order,textFormat:"plainText",fields:"items(id,snippet(topLevelComment(snippet(textDisplay)))),nextPageToken"});
    let response:Response;
    try { response=await request("https://www.googleapis.com/youtube/v3/commentThreads?"+query,{headers:{"X-Goog-Api-Key":apiKey},signal:AbortSignal.timeout(15000),cache:"no-store"}); }
    catch { throw new Error("YouTube comments request timed out or could not connect."); }
    let body:any;
    try { body=await response.json(); } catch { throw new Error("YouTube returned an invalid response."); }
    if (!response.ok) {
      const reasons=(body.error?.errors||[]).map((e:{reason?:string})=>e.reason);
      if (reasons.includes("commentsDisabled")) return {status:"disabled",comments:[],hasMore:false};
      // Never log provider error messages, request headers or URLs with credentials.
      if (reasons.includes("quotaExceeded")) throw new Error("YouTube daily quota exhausted.");
      throw new Error("YouTube comment lookup failed (HTTP "+response.status+").");
    }
    if (!Array.isArray(body.items)) throw new Error("YouTube comments payload is invalid.");
    hasMore=hasMore||Boolean(body.nextPageToken);
    for (const item of body.items) {
      const id=item.id,text=item.snippet?.topLevelComment?.snippet?.textDisplay;
      if (typeof id!=="string"||typeof text!=="string"||!text.trim()) continue;
      const normalized=text.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
      if (seenIds.has(id)||seenText.has(normalized)) continue;
      seenIds.add(id);seenText.add(normalized);comments.push({id,text});
    }
  }
  return {status:comments.length?"ready":"empty",comments,hasMore};
}

export function assertYouTubeAnalysisApproved(config:NodeJS.ProcessEnv=process.env) {
  if(config.YOUTUBE_DERIVED_METRICS_APPROVED!=="true")
    throw new Error("YouTube sentiment analysis is not enabled: approved use case must be confirmed first.");
}
