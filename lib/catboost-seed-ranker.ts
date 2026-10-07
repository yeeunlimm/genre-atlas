import {rankCandidates, type Candidate, type Memory} from './hybrid-station';
import {PAIR_FEATURE_NAMES, PAIR_FEATURE_VERSION, creditRouteScore, pairFeatures} from './seed-pair-features';
import type {StationTrack} from './station-catalog';

export type RankerArtifact = {
  format: 'genre-atlas-seed-catboost'; version: 1; modelId: string; approved: boolean;
  featureVersion: number; featureNames: string[];
  normalization: {low: number; high: number}; scale: number; bias: number;
  trees: {splits: {feature: number; border: number}[]; leaves: number[]}[];
};
// Only a bounded, numeric, symmetric-tree export is supported. No CTR/categorical
// encodings, artist-ID lookup, Python execution, raw training rows or secrets.
export function readRankerArtifact(value: unknown): RankerArtifact | null {
  if (!value || typeof value !== 'object') return null;
  const a = value as RankerArtifact;
  if (a.format !== 'genre-atlas-seed-catboost' || a.version !== 1 || a.featureVersion !== PAIR_FEATURE_VERSION || a.approved !== true ||
      typeof a.modelId !== 'string' || !/^[a-zA-Z0-9._-]{1,100}$/.test(a.modelId) ||
      !Array.isArray(a.featureNames) || JSON.stringify(a.featureNames) !== JSON.stringify(PAIR_FEATURE_NAMES) ||
      !a.normalization || !bounded(a.normalization.low) || !bounded(a.normalization.high) || a.normalization.high - a.normalization.low < 1e-9 ||
      !bounded(a.scale) || !bounded(a.bias) || !Array.isArray(a.trees) || !a.trees.length || a.trees.length > 1000) return null;
  for (const t of a.trees) {
    if (!t || !Array.isArray(t.splits) || t.splits.length > 8 || !Array.isArray(t.leaves) || t.leaves.length !== 2 ** t.splits.length || !t.leaves.every(bounded)) return null;
    for (const s of t.splits) if (!s || !Number.isInteger(s.feature) || s.feature < 0 || s.feature >= PAIR_FEATURE_NAMES.length || !Number.isFinite(s.border)) return null;
  }
  // Whitelist fields: accidental training rows or CatBoost model_info must not be served.
  return {format: a.format, version: 1, modelId: a.modelId, approved: true, featureVersion: a.featureVersion, featureNames: [...a.featureNames],
    normalization: {low: a.normalization.low, high: a.normalization.high}, scale: a.scale, bias: a.bias,
    trees: a.trees.map(t => ({splits: t.splits.map(s => ({feature: s.feature, border: s.border})), leaves: [...t.leaves]}))};
}
const bounded = (n: number) => Number.isFinite(n) && Math.abs(n) <= 1e6;
export function predictPair(model: RankerArtifact, x: number[]): number {
  if (x.length !== PAIR_FEATURE_NAMES.length || !x.every(n => Number.isFinite(n) && (n === -1 || n >= 0 && n <= 1))) throw new Error('Invalid seed-pair features');
  let total = 0;
  for (const t of model.trees) {
    let index = 0;
    t.splits.forEach((s, depth) => { if (Math.fround(x[s.feature]) > s.border) index += 2 ** depth; });
    total += t.leaves[index];
  }
  return total * model.scale + model.bias;
}
export function blendScore(credits: number, raw: number, normalization: RankerArtifact['normalization']) {
  const modelScore = Math.max(0, Math.min(1, (raw - normalization.low) / (normalization.high - normalization.low)));
  return {credits, modelScore, total: .8 * credits + .2 * modelScore};
}
export function rankSongCandidates(rows: Candidate[], seeds: StationTrack[], memory: Memory, consumed: StationTrack[] = [], model: RankerArtifact | null = null, now = Date.now()): Candidate[] {
  if (!model || seeds.length !== 1) return rankCandidates(rows, seeds, memory, consumed, now);
  try {
    return rankCandidates(rows, seeds, memory, consumed, now, row => {
      const score = blendScore(creditRouteScore(row, seeds[0]), predictPair(model, pairFeatures(seeds[0], row)), model.normalization).total;
      if (!Number.isFinite(score)) throw new Error('Invalid ranking score');
      return score;
    });
  } catch {
    // All-or-nothing fallback: never mix old and new score scales in one queue.
    return rankCandidates(rows, seeds, memory, consumed, now);
  }
}
