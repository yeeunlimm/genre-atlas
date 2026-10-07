// Server/worker only. Never import this module into a client component.
export type YouTubeComment = {id:string;text:string};
export type CommentBatch = {status:"ready"|"empty"|"disabled";comments:YouTubeComment[];hasMore:boolean};
export const REVIEW_COMMENT_LIMIT=50;
// Distinguish a missing recording from an account-wide quota/provider failure.
export class YouTubeCommentError extends Error {
  constructor(public kind:'quota'|'video-unavailable'|'provider',message:string){super(message);}
}

export async function youtubeReviewComments(videoId:string, apiKey:string, request:typeof fetch=fetch):Promise<CommentBatch> {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID.");
  if (!apiKey?.trim()) throw new Error("YouTube server key is not configured.");
  const comments:YouTubeComment[]=[];
  const seenIds=new Set<string>(),seenText=new Set<string>();
  // One relevance-ordered page per video. Duplicates or short pages stay short;
  // never follow nextPageToken to fill the sample or consume the daily quota.
  const query=new URLSearchParams({part:"snippet",videoId,maxResults:String(REVIEW_COMMENT_LIMIT),order:"relevance",textFormat:"plainText",fields:"items(id,snippet(topLevelComment(snippet(textDisplay)))),nextPageToken"});
  let response:Response;
  try { response=await request("https://www.googleapis.com/youtube/v3/commentThreads?"+query,{headers:{"X-Goog-Api-Key":apiKey},signal:AbortSignal.timeout(15000),cache:"no-store"}); }
  catch { throw new YouTubeCommentError('provider',"YouTube comments request timed out or could not connect."); }
  let body:any;
  try { body=await response.json(); } catch { throw new YouTubeCommentError('provider',"YouTube returned an invalid response."); }
  if (!response.ok) {
    const reasons=(body.error?.errors||[]).map((e:{reason?:string})=>e.reason);
    if (reasons.includes("commentsDisabled")) return {status:"disabled",comments:[],hasMore:false};
    // Never log provider error messages, request headers or URLs with credentials.
    if (reasons.some((reason:string)=>['quotaExceeded','dailyLimitExceeded'].includes(reason))) throw new YouTubeCommentError('quota',"YouTube daily quota exhausted.");
    if (reasons.includes('videoNotFound')) throw new YouTubeCommentError('video-unavailable','The matched recording is unavailable.');
    throw new YouTubeCommentError('provider',"YouTube comment lookup failed (HTTP "+response.status+").");
  }
  if (!Array.isArray(body.items)) throw new YouTubeCommentError('provider',"YouTube comments payload is invalid.");
  const hasMore=Boolean(body.nextPageToken);
  for (const item of body.items) {
    const id=item.id,text=item.snippet?.topLevelComment?.snippet?.textDisplay;
    if (typeof id!=="string"||typeof text!=="string"||!text.trim()) continue;
    const normalized=text.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
    if (seenIds.has(id)||seenText.has(normalized)) continue;
    seenIds.add(id);seenText.add(normalized);comments.push({id,text});
    if(comments.length>=REVIEW_COMMENT_LIMIT)break;
  }
  return {status:comments.length?"ready":"empty",comments,hasMore};
}
