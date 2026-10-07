import {songKey, type Candidate} from './hybrid-station';
import type {CreditRole, StationTrack} from './station-catalog';

// Separate contract from station-learning v1. Never reinterpret old 16-column rows.
export const PAIR_FEATURE_VERSION = 1;
export const PAIR_FEATURE_NAMES = [
  'shared_producer', 'shared_mastering', 'shared_mixing', 'shared_songwriter', 'shared_arranger',
  'shared_track_producer', 'shared_track_mastering',
  'shared_release_producer', 'shared_release_mastering',
  'sample_artist_connection', 'track_genre_jaccard', 'album_genre_jaccard',
  'route_credits', 'route_related_non_youtube', 'route_similar_non_youtube', 'duration_similarity',
] as const;
export type PairSnapshot = {
  version: 1; seedSong: string; seedArtist: string; candidateArtist: string;
  x: number[]; creditScore: number; legacyScore: number; trainable: boolean;
};
const norm = (s: string) => s.normalize('NFKC').toLowerCase().trim();
export function nonYouTubeSource(url: string): boolean {
  try { const u = new URL(url); return u.protocol === 'https:' && !/(^|\.)(youtube\.com|youtu\.be|googlevideo\.com)$/.test(u.hostname); }
  catch { return false; }
}
const credits = (t: StationTrack, role: CreditRole, scope?: 'track' | 'release') =>
  t.credits.filter(c => c.person && c.role === role && (!scope || c.scope === scope) && nonYouTubeSource(c.source.url));

// 0 means no overlap in the supplied lists, NOT proof that all credits are complete.
// -1 means one or both lists are unavailable. Unknown scope is not a track-level credit.
function shared(a: StationTrack, b: StationTrack, role: CreditRole, scope?: 'track' | 'release') {
  const ac = credits(a, role, scope), bc = credits(b, role, scope);
  return !ac.length || !bc.length ? -1 : Number(ac.some(x => bc.some(y => x.person === y.person)));
}
function genres(a: StationTrack, b: StationTrack, scope: 'track' | 'album') {
  const values = (t: StationTrack) => new Set(t.genres.filter(g => g.scope === scope && nonYouTubeSource(g.source.url)).map(g => norm(g.name)).filter(Boolean));
  const av = values(a), bv = values(b);
  return !av.size || !bv.size ? -1 : [...av].filter(g => bv.has(g)).length / new Set([...av, ...bv]).size;
}
export function pairFeatures(seed: StationTrack, row: Candidate): number[] {
  const t = row.track;
  const evidence = row.reasons.filter(r => r.sources.length && r.sources.every(s => nonYouTubeSource(s.url)));
  const route = (name: string, kind: string) => Number(row.paths.some(p => p.seedId === seed.id && p.route === name) && evidence.some(r => r.kind === kind));
  const sample = t.sampledArtists?.some(s => s.artistId === seed.artistId && nonYouTubeSource(s.source.url)) || seed.sampledArtists?.some(s => s.artistId === t.artistId && nonYouTubeSource(s.source.url));
  const durationsKnown = nonYouTubeSource(seed.source.url) && nonYouTubeSource(t.source.url) && Number.isFinite(seed.durationMs) && Number.isFinite(t.durationMs) && seed.durationMs! > 0 && t.durationMs! > 0;
  return [
    ...(['producer', 'mastering', 'mixing', 'songwriter', 'arranger'] as const).map(role => shared(seed, t, role)),
    shared(seed, t, 'producer', 'track'), shared(seed, t, 'mastering', 'track'),
    shared(seed, t, 'producer', 'release'), shared(seed, t, 'mastering', 'release'),
    sample ? 1 : -1, genres(seed, t, 'track'), genres(seed, t, 'album'),
    Math.max(route('credits', 'credit'), route('credits', 'sample')),
    route('related-artists', 'related-artist'), route('similar-tracks', 'similar-track'),
    durationsKnown ? Math.min(seed.durationMs!, t.durationMs!) / Math.max(seed.durationMs!, t.durationMs!) : -1,
  ];
}
// Preserve the existing credits/samples route signal (capped at .95 by asCredits).
// Normalize against its fixed cap, NOT against whichever candidates arrived first.
export function creditRouteScore(row: Candidate, seed: StationTrack): number {
  return Math.min(1, Math.max(0, ...row.paths.filter(p => p.seedId === seed.id && p.route === 'credits' && Number.isFinite(p.confidence)).map(p => p.confidence)) / .95);
}
export function makePairSnapshot(row: Candidate, seeds: StationTrack[]): PairSnapshot | undefined {
  // General song discovery only. Do not turn a multi-like playlist into a fake single-seed query.
  if (seeds.length !== 1) return undefined;
  const seed = seeds[0];
  const perRoute = ['credits', 'related-artists', 'similar-tracks'].map(route => Math.max(0, ...row.paths.filter(p => p.route === route).map(p => p.confidence))).sort((a,b) => b-a);
  return {version: 1, seedSong: songKey(seed), seedArtist: norm(seed.primaryArtistName || seed.artist), candidateArtist: norm(row.track.primaryArtistName || row.track.artist),
    x: pairFeatures(seed, row), creditScore: creditRouteScore(row, seed),
    legacyScore: perRoute[0] + .2 * (perRoute[1] + perRoute[2]),
    trainable: nonYouTubeSource(seed.source.url) && nonYouTubeSource(row.track.source.url),
  };
}
export function readPairSnapshot(value: unknown): PairSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const p = value as PairSnapshot;
  if (p.version !== 1 || ![p.seedSong, p.seedArtist, p.candidateArtist].every(s => typeof s === 'string' && s.length > 0 && s.length < 1000) ||
      !Array.isArray(p.x) || p.x.length !== PAIR_FEATURE_NAMES.length || !p.x.every(n => Number.isFinite(n) && (n === -1 || n >= 0 && n <= 1)) ||
      !Number.isFinite(p.creditScore) || p.creditScore < 0 || p.creditScore > 1 || !Number.isFinite(p.legacyScore) || p.legacyScore < 0 || p.legacyScore > 3 || typeof p.trainable !== 'boolean') return undefined;
  return {version: 1, seedSong: p.seedSong, seedArtist: p.seedArtist, candidateArtist: p.candidateArtist, x: [...p.x], creditScore: p.creditScore, legacyScore: p.legacyScore, trainable: p.trainable};
}
