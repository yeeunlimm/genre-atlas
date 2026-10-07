// Scores must come from a validated analyzer, not likes, views or star ratings.
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
};

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
