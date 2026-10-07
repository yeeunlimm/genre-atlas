// Local explicit-seed trial. Uses production helpers; never reads account/browser data.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const usage = `Local explicit-seed playlist trial (not an account test).
  node scripts/preview-liked-playlist.mjs --seed-id sundress
  node scripts/preview-liked-playlist.mjs --seed-id ID [--seed-id ID ...]
  node scripts/preview-liked-playlist.mjs --artist "Tame Impala" --title "Let It Happen" --album "Currents"

Requires YOUTUBE_API_KEY in the process environment. LASTFM_API_KEY is optional.
Uses up to five explicit seeds, actual recommendation sources, up to 30 candidate
analyses and the production positive-only selection (up to 10 songs).
Stores aggregate metadata only in a new, ignored work/live-playlist-*.json file.
No account data, saved likes, learned preferences or repeat history are loaded.
`;

function options(args) {
  const result = {ids: []};
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === '--help' || name === '-h') return {help: true};
    if (!['--seed-id', '--artist', '--title', '--album'].includes(name)) throw new Error('Unknown argument. Use --help.');
    const value = args[++i];
    if (!value?.trim() || value.startsWith('--')) throw new Error('Missing argument value. Use --help.');
    if (name === '--seed-id') result.ids.push(value.trim());
    else {
      const field = name.slice(2);
      if (result[field]) throw new Error('Artist/title/album may each be specified once. Use repeated --seed-id for multiple seeds.');
      result[field] = value.trim();
    }
  }
  if (result.ids.length > 5) throw new Error('Supply at most five seed IDs.');
  if (result.ids.length && (result.artist || result.title || result.album)) throw new Error('Choose seed IDs or an artist/title pair, not both.');
  if (!result.ids.length && !(result.artist && result.title)) throw new Error('Supply --seed-id or both --artist and --title. Use --help.');
  return result;
}

// Match the existing script loader, with the REAL ESM analyzer supplied to CJS.
// No fixture predictions, mocked fetches or replacement scoring functions.
function loader(analyzer) {
  const ts = require('typescript');
  const modules = new Map();
  function load(file) {
    file = path.resolve(root, file);
    if (modules.has(file)) return modules.get(file).exports;
    const module = {exports: {}};
    modules.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    }).outputText;
    new Function('exports', 'module', 'require', code)(module.exports, module, id => {
      if (id === './review-analyzer.mjs') return analyzer;
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id.endsWith('.ts') ? id : id + '.ts'));
      return require(id);
    });
    return module.exports;
  }
  return load;
}

function bounded(promise, signal) {
  return new Promise((resolve, reject) => {
    const stop = () => reject(signal.reason);
    if (signal.aborted) { promise.catch(() => {}); reject(signal.reason); return; }
    signal.addEventListener('abort', stop, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

const metadata = track => ({
  id: track.id, title: track.title, artist: track.artist, album: track.album,
  ...(track.primaryArtistName ? {primaryArtistName: track.primaryArtistName} : {}),
  ...(track.durationMs ? {durationMs: track.durationMs} : {}),
});

async function main() {
  const opts = options(process.argv.slice(2));
  if (opts.help) { console.log(usage); return; }
  if (!process.env.YOUTUBE_API_KEY?.trim()) throw new Error('YOUTUBE_API_KEY is missing. No sources or comments were requested.');
  console.log('[scope] Local explicit-seed trial; neutral preferences; no account or browser storage.');
  const analyzer = await import('../lib/review-analyzer.mjs');
  const load = loader(analyzer);
  const live = load('lib/live-station.ts');
  const {discoverSource} = load('lib/hybrid-sources.ts');
  const {musicRequest} = load('lib/music-request.ts');
  const {blankMemory, songKey} = load('lib/hybrid-station.ts');
  const {collectLikedCandidates, shortlistLikedCandidates, selectLikedPlaylist, reviewKey,
    PLAYLIST_CANDIDATE_LIMIT, PLAYLIST_TRACK_LIMIT} = load('lib/liked-playlist.ts');
  const {analyzePlaylistTrack} = load('lib/playlist-review-service.ts');
  const {playlistReviewStream} = load('lib/playlist-review-stream.ts');
  const {readReviewStream} = load('lib/read-review-stream.ts');
  let liked = [];
  console.log('[seed] Resolving explicit song metadata...');
  if (opts.ids.length) {
    for (const id of new Set(opts.ids)) liked.push(await bounded(musicRequest(() => live.loadTrack(id), 10000), AbortSignal.timeout(12000)));
  } else {
    const result = await bounded(musicRequest(() => live.liveSearch(opts.artist + ' ' + opts.title), 10000), AbortSignal.timeout(12000));
    const matches = result.tracks.filter(t => live.normalize(t.artist) === live.normalize(opts.artist)
      && live.normalize(t.title) === live.normalize(opts.title)
      && (!opts.album || live.normalize(t.album) === live.normalize(opts.album)));
    if (matches.length !== 1) {
      console.log('[seed] Exact matches:', JSON.stringify(matches.map(metadata)));
      throw new Error(matches.length ? 'Ambiguous recording: rerun with one listed --seed-id.' : 'No exact artist/title/album match. No substitute seed was used.');
    }
    liked = matches;
  }
  liked = liked.filter((t, i) => liked.findIndex(other => songKey(other) === songKey(t)) === i);
  assert.ok(liked.length > 0 && liked.length <= 5);
  console.log('[seed] ' + liked.map(t => t.artist + ' — ' + t.title).join(' | '));

  const memory = blankMemory(), recent = {}, sourceResults = [];
  // Expired jobs fail individually, so completed sources survive the deadline,
  // matching the UI collector's partial-source behavior.
  const deadline = Date.now() + 90000, candidateSignal = new AbortController().signal;
  console.log('[candidates] Production collector: two concurrent jobs, 90-second total budget.');
  const collected = await bounded(collectLikedCandidates(liked, async (seed, route) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      sourceResults.push({seedId: seed.id, route, state: 'timeout', count: 0});
      throw new Error('Candidate collection time limit reached.');
    }
    const budget = Math.min(30000, remaining), signal = AbortSignal.timeout(budget);
    try {
      let rows, state;
      if (route === 'credits') {
        const data = await bounded(musicRequest(() => live.liveStation(seed.id, 0), budget), signal);
        rows = data.rows.filter(row => row.reasons.some(reason => reason.kind === 'credit' || reason.kind === 'sample'))
          .map(row => ({...row, paths: [{route: 'credits', seedId: seed.id, confidence: Math.min(.95, .6 + row.score * .035)}]}));
        state = data.partial ? 'partial' : rows.length ? 'ready' : 'empty';
      } else {
        const data = await bounded(musicRequest(() => discoverSource(seed.id, route, 0, process.env.LASTFM_API_KEY), budget), signal);
        rows = data.rows; state = data.state;
      }
      sourceResults.push({seedId: seed.id, route, state, count: rows.length});
      return rows;
    } catch (error) {
      sourceResults.push({seedId: seed.id, route, state: signal.aborted ? 'timeout' : 'failed', count: 0});
      throw error;
    }
  }, candidateSignal, (done, total) => console.log(`[candidates] ${done}/${total} sources checked.`)), AbortSignal.timeout(95000));
  const candidates = shortlistLikedCandidates(collected.rows, liked, memory, recent);
  assert.ok(candidates.length <= PLAYLIST_CANDIDATE_LIMIT);
  console.log(`[candidates] ${collected.rows.length} merged → ${candidates.length} independent shortlist candidates; ${collected.failed} failed sources.`);

  const reviews = new Map(), summaries = new Map(), wanted = new Set(candidates.map(row => reviewKey(row.track)));
  let streamComplete = false;
  if (candidates.length) {
    assert.equal(wanted.size, candidates.length, 'Shortlist review keys must be unique.');
    console.log('[analysis] Actual production YouTube matching, comments and local sentiment model.');
    const signal = AbortSignal.timeout(270000);
    const stream = playlistReviewStream(candidates.map(row => row.track), analyzePlaylistTrack, signal, () => {});
    await bounded(readReviewStream(new Response(stream), event => {
      if (event.type === 'heartbeat') return;
      if (event.type === 'complete') {
        assert.equal(event.total, candidates.length);
        assert.equal(reviews.size, candidates.length);
        streamComplete = true;
        return;
      }
      const result = event.result;
      assert.ok(wanted.has(result.key) && !reviews.has(result.key), 'Unexpected or repeated analysis result.');
      assert.equal(event.total, candidates.length);
      assert.equal(event.completed, reviews.size + 1);
      reviews.set(result.key, result);
      if (result.status === 'ready' && result.summary) summaries.set(result.key, result.summary);
      console.log(`[analysis] ${event.completed}/${event.total}: ${result.status}${result.summary?.score != null ? ' score=' + result.summary.score.toFixed(3) : ''}`);
    }, signal), signal);
    assert.ok(streamComplete, 'Incomplete analysis cannot produce a saved playlist.');
  }

  const selected = selectLikedPlaylist(candidates, liked, memory, recent, summaries);
  assert.ok(selected.length <= PLAYLIST_TRACK_LIMIT);
  for (const row of selected) {
    assert.ok(wanted.has(reviewKey(row.track)));
    assert.ok(summaries.get(reviewKey(row.track))?.score > 0, 'Every selected song must have actual positive evidence.');
  }
  const statusCounts = {};
  for (const result of reviews.values()) statusCounts[result.status] = (statusCounts[result.status] || 0) + 1;
  const selectedKeys = new Set(selected.map(row => reviewKey(row.track)));
  const positiveCount = [...summaries.values()].filter(summary => summary.score > 0).length;
  const output = {
    kind: 'local-explicit-seed-trial', accountTest: false, accountDataUsed: false,
    preferenceMode: 'neutral-memory-no-learned-model', generatedAt: new Date().toISOString(),
    status: !candidates.length ? 'no-candidates' : selected.length ? 'completed' : 'completed-no-positive-selection',
    limits: {candidateCollectionMs: 90000, candidates: PLAYLIST_CANDIDATE_LIMIT, selected: PLAYLIST_TRACK_LIMIT},
    seeds: liked.map(metadata), sourceResults,
    counts: {merged: collected.rows.length, candidates: candidates.length, checked: reviews.size,
      ready: summaries.size, positive: positiveCount, selected: selected.length, failedSources: collected.failed, statuses: statusCounts},
    analysisComplete: streamComplete,
    candidates: candidates.map(row => {
      const result = reviews.get(reviewKey(row.track));
      return {...metadata(row.track), recommendationScore: row.score, paths: row.paths,
        selected: selectedKeys.has(reviewKey(row.track)),
        review: result ? {status: result.status, ...(result.summary ? {summary: result.summary} : {}),
          ...(result.videoId && /^[\w-]{11}$/.test(result.videoId) ? {videoId: result.videoId, videoUrl: 'https://www.youtube.com/watch?v=' + result.videoId, videoTitle: result.videoTitle} : {})} : null};
    }),
    selected: selected.map(row => ({...metadata(row.track), score: summaries.get(reviewKey(row.track)).score})),
  };
  const directory = path.join(root, 'work');
  await mkdir(directory, {recursive: true});
  const file = path.join(directory, 'live-playlist-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8) + '.json');
  // Exclusive creation also protects against an unlikely timestamp/UUID collision.
  await writeFile(file, JSON.stringify(output, null, 2) + '\n', {encoding: 'utf8', flag: 'wx'});
  console.log(`[result] ${reviews.size}/${candidates.length} checked; ${positiveCount} positive; ${selected.length}/${PLAYLIST_TRACK_LIMIT} selected.`);
  for (const row of selected) console.log('[selected] ' + row.track.artist + ' — ' + row.track.title);
  console.log('[saved] ' + file);
}

// Native model initialization does not accept an AbortSignal. Bound the CLI too.
const watchdog = setTimeout(() => {
  console.error('[stopped] Local trial exceeded its total time limit. No incomplete playlist was saved.');
  process.exit(1);
}, 420000);
watchdog.unref();
try {
  await main();
} catch (error) {
  let message = error instanceof Error ? error.message : 'Local trial failed.';
  for (const value of [process.env.YOUTUBE_API_KEY, process.env.LASTFM_API_KEY]) if (value) message = message.split(value).join('[redacted]');
  console.error('[stopped] ' + message);
  // Stop outstanding provider/model work too when the bounded trial fails.
  process.exit(1);
} finally {
  clearTimeout(watchdog);
}
