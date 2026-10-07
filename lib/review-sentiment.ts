// Validate score structure, not music-domain accuracy. Never use likes/views as sentiment.
export type ReviewMethod = 'en-model-v1' | 'ko-lexicon-v1';
export type ScoredReview = {commentId:string; relevantToSong:boolean; score:number; method:ReviewMethod};
export type ReviewPrediction = {
  commentId: string;
  relevantToSong: boolean;
  positive: number;
  neutral: number;
  negative: number;
};
export type ReviewSummary = {
  status: "ready" | "no-evidence";
  score: number | null;
  sampleCount: number;
  analyzedAt: string;
  methodCounts?: Partial<Record<ReviewMethod, number>>;
};

// Selection policy only: this is NOT a measured neutral sentiment score.
export type NoCommentsFallback = {
  status:'no-comments'; score:0; sampleCount:0; checkedAt:string;
  videosChecked:number; disabled:number; empty:number;
};
export type PlaylistReviewEvidence = ReviewSummary | NoCommentsFallback;
export function playlistSelectionScore(evidence:PlaylistReviewEvidence|undefined,now=Date.now()):number|null {
  if(!evidence)return null;
  if(evidence.status==='no-comments'){
    const age=now-Date.parse(evidence.checkedAt);
    return evidence.score===0&&evidence.sampleCount===0&&Number.isFinite(age)&&age>=0&&age<3600000&&
      Number.isInteger(evidence.videosChecked)&&evidence.videosChecked>=1&&evidence.videosChecked<=3&&
      Number.isInteger(evidence.disabled)&&evidence.disabled>=0&&Number.isInteger(evidence.empty)&&evidence.empty>=0&&
      evidence.disabled+evidence.empty===evidence.videosChecked?0:null;
  }
  return positiveReviewCandidates([{trackId:'check'}],new Map([['check',evidence]]),now).length?evidence.score:null;
}

// Keep lexicon scores distinct from model probabilities; average signed scores
// only after validation. This is a heuristic gate, not a calibrated probability.
export function summarizeScoredReviews(rows:ScoredReview[], now=new Date()):ReviewSummary {
  const seen=new Set<string>(),values:number[]=[];
  const methodCounts:Partial<Record<ReviewMethod,number>>={};
  for(const row of rows){
    if(!row.relevantToSong||!row.commentId||seen.has(row.commentId)||
      !Number.isFinite(row.score)||row.score < -1||row.score > 1||
      !['en-model-v1','ko-lexicon-v1'].includes(row.method))continue;
    seen.add(row.commentId);values.push(row.score);
    methodCounts[row.method]=(methodCounts[row.method]||0)+1;
  }
  return {status:values.length?'ready':'no-evidence',score:values.length?values.reduce((a,b)=>a+b,0)/values.length:null,
    sampleCount:values.length,analyzedAt:now.toISOString(),methodCounts};
}

export function summarizeReviews(rows: ReviewPrediction[], now = new Date()): ReviewSummary {
  const seen = new Set<string>();
  const values: number[] = [];
  for (const row of rows) {
    if (!row.relevantToSong || !row.commentId || seen.has(row.commentId)) continue;
    const probabilities = [row.positive, row.neutral, row.negative];
    if (probabilities.some(x => !Number.isFinite(x) || x < 0 || x > 1)) continue;
    if (Math.abs(probabilities.reduce((a,b) => a+b,0)-1) > 0.001) continue;
    seen.add(row.commentId);
    values.push(row.positive-row.negative);
  }
  return {
    status: values.length ? "ready" : "no-evidence",
    score: values.length ? values.reduce((a,b) => a+b,0)/values.length : null,
    sampleCount: values.length,
    analyzedAt: now.toISOString(),
  };
}

// Preserve the personalized candidate order. This is a gate, not a popularity ranker.
// Missing, zero, negative, invalid and expired evidence must never fill empty slots.
export function positiveReviewCandidates<T extends {trackId:string}>(
  candidates: T[], summaries: ReadonlyMap<string,ReviewSummary>, now=Date.now(), limit=10,
): T[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    if (seen.has(candidate.trackId)) return false;
    const evidence = summaries.get(candidate.trackId);
    if (!evidence || evidence.status !== "ready" || !Number.isFinite(evidence.score) ||
        evidence.score === null || evidence.score <= 0 || evidence.score > 1 ||
        !Number.isInteger(evidence.sampleCount) || evidence.sampleCount < 1) return false;
    const age = now-Date.parse(evidence.analyzedAt);
    if (!Number.isFinite(age) || age < 0 || age >= 24*60*60*1000) return false;
    seen.add(candidate.trackId);
    return true;
  }).slice(0,Math.max(0,Math.min(10,Math.floor(limit)||0)));
}
