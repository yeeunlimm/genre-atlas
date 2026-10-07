import type {StationTrack} from './station-catalog';
import {nonYouTubeSource} from './seed-pair-features';

// A separate contract from the credit model. No listener profile, artist ID,
// feedback count, producer score or training-catalog lookup is an input.
export const CONTEXT_FEATURE_VERSION = 1;
export const CONTEXT_BASE_FEATURES = [
  'genre_jaccard', 'seed_genre_coverage', 'candidate_genre_coverage',
  'duration_similarity', 'seed_genres_known', 'candidate_genres_known',
  'seed_duration_known', 'candidate_duration_known',
] as const;
export const normalizeContextGenre = (s: string) => s.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
export const contextFeatureNames = (vocabulary: string[]) => [
  ...CONTEXT_BASE_FEATURES,
  ...vocabulary.map((_, i) => `seed_genre_${i}`),
  ...vocabulary.map((_, i) => `candidate_genre_${i}`),
];
export type SongContextMetadata = {genres: string[]; durationMs?: number};
export function contextMetadata(t: StationTrack): SongContextMetadata {
  // Training uses recording genres, not an artist/album genre backfill.
  return {
    genres: t.genres.filter(g => g.scope === 'track' && nonYouTubeSource(g.source.url)).map(g => normalizeContextGenre(g.name)).filter(Boolean),
    durationMs: nonYouTubeSource(t.source.url) ? t.durationMs : undefined,
  };
}
export function songContextFeatures(seed: SongContextMetadata, candidate: SongContextMetadata, vocabulary: string[]): number[] {
  const a = new Set(seed.genres.map(normalizeContextGenre).filter(Boolean));
  const b = new Set(candidate.genres.map(normalizeContextGenre).filter(Boolean));
  const intersection = [...a].filter(x => b.has(x)).length;
  const validDuration = (x: number | undefined): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 1000 && x <= 3600000;
  const ad = validDuration(seed.durationMs), bd = validDuration(candidate.durationMs);
  return [
    a.size && b.size ? intersection / new Set([...a, ...b]).size : -1,
    a.size && b.size ? intersection / a.size : -1,
    a.size && b.size ? intersection / b.size : -1,
    ad && bd ? Math.min(seed.durationMs!, candidate.durationMs!) / Math.max(seed.durationMs!, candidate.durationMs!) : -1,
    Number(a.size > 0), Number(b.size > 0), Number(ad), Number(bd),
    ...vocabulary.map(g => a.size ? Number(a.has(g)) : -1),
    ...vocabulary.map(g => b.size ? Number(b.has(g)) : -1),
  ];
}
