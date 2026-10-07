const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Execute the real component event handler with a minimal, one-render hook host.
// Networking, authentication, model training and browser storage are fixtures.
function loader(overrides = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(file);
    if (cache.has(file)) return cache.get(file);
    const module = {exports: {}};
    cache.set(file, module.exports);
    const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText;
    new Function('exports', 'module', 'require', compiled)(module.exports, module, id => {
      if (Object.hasOwn(overrides, id)) return overrides[id];
      if (id.startsWith('@/')) return load(id.slice(2) + '.ts');
      if (id.startsWith('.')) return load(path.resolve(path.dirname(file), id + '.ts'));
      return require(id);
    });
    return module.exports;
  }
  return load;
}

const load = loader();
const playlistLogic = load('lib/liked-playlist.ts');
const {blankMemory, songKey} = load('lib/hybrid-station.ts');
const {stationCatalog} = load('lib/station-catalog.ts');
const {reviewAvailability} = load('lib/playlist-review-service.ts');
const seed = stationCatalog[0];
const pool = Array.from({length: 40}, (_, i) => ({
  track: {
    ...seed,
    id: 'fixture-track-' + i,
    recordingId: 'fixture-recording-' + i,
    title: 'Song ' + i,
    artist: 'Artist ' + i,
    primaryArtistName: 'Artist ' + i,
    artistId: 'fixture-artist-' + i,
    album: 'Album ' + i,
    albumFamily: 'fixture-album-' + i,
    albumGroups: [],
    durationMs: 180000,
  },
  score: 0,
  feedbackBoost: false,
  reasons: [],
  paths: [{route: 'related-artists', seedId: seed.id, confidence: 1 - i * .01}],
}));

function find(node, predicate) {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  return predicate(node) ? node : find(node.props?.children, predicate);
}

async function runComponent({likes = [seed], availability = {ready: true}, cached = null, userId = 'fixture-user', click = true, storageFails = false} = {}) {
  const liked = structuredClone(likes);
  const originalLikes = structuredClone(liked);
  const states = [], effects = [], cleanups = [], events = [], writes = [], requests = [];
  const originalStorage = Object.getOwnPropertyDescriptor(global, 'localStorage');
  const previousHistory = {recent: {'previous:selection': Date.now() - 60000}};
  let collectCalls = 0;
  Object.defineProperty(global, 'localStorage', {
    configurable: true,
    value: {
      getItem: key => key === 'genre-atlas.playlist-candidates.v1:fixture-user' ? cached : key.startsWith('genre-atlas.liked-playlist.v1:') ? JSON.stringify(previousHistory) : null,
      setItem: (key, value) => {if(storageFails)throw new Error('Storage full');writes.push({key, value: JSON.parse(value)});},
    },
  });
  const hooks = {
    useState(initial) {
      const index = states.length;
      states.push(typeof initial === 'function' ? initial() : initial);
      return [states[index], value => {
        states[index] = typeof value === 'function' ? value(states[index]) : value;
      }];
    },
    useRef: value => ({current: value}),
    useEffect: effect => effects.push(effect),
  };
  const accountFetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const request = {url, method, ...(options.body ? {body: JSON.parse(options.body)} : {})};
    requests.push(request);
    events.push(method + ' ' + url);
    if (url === '/api/station/reviews' && method === 'GET') return Response.json(availability);
    if (url === '/api/station/reviews' && method === 'POST') {
      const tracks = request.body.tracks;
      const results = tracks.map((track, index) => {
        const number = Number(track.title.replace('Song ', ''));
        return {
          type: 'progress', completed: index + 1, total: tracks.length,
          result: {
            key: playlistLogic.reviewKey(track), status: 'ready',
            summary: {
              status: 'ready', score: number < 5 ? -.4 : number === 5 ? 0 : number / 40,
              sampleCount: 3, analyzedAt: new Date().toISOString(),
            },
          },
        };
      });
      results.push({type: 'complete', total: tracks.length});
      return new Response(results.map(row => JSON.stringify(row)).join('\n') + '\n', {
        headers: {'Content-Type': 'application/x-ndjson'},
      });
    }
    if (url.startsWith('/api/station/discover?')) return Response.json({rows: pool});
    if (url.startsWith('/api/station?')) return Response.json({rows: []});
    throw new Error('Unexpected fixture request: ' + method + ' ' + url);
  };
  const componentLoad = loader({
    react: hooks,
    'react/jsx-runtime': {
      jsx: (type, props) => ({type, props}),
      jsxs: (type, props) => ({type, props}),
      Fragment: 'fragment',
    },
    '@/lib/supabase/browser': {accountFetch},
    './station-artwork': {StationArtwork:()=>null},
    '@/lib/station-learning': {trainRanker: () => ({active: false})},
    '@/lib/liked-playlist': {
      ...playlistLogic,
      collectLikedCandidates: async (...args) => {
        collectCalls++;
        events.push('collect');
        return playlistLogic.collectLikedCandidates(...args);
      },
    },
  });
  try {
    const {LikedPlaylist} = componentLoad('components/liked-playlist.tsx');
    const tree = LikedPlaylist({userId, liked, memory: blankMemory(), learning: {}});
    for (const effect of effects) {
      const cleanup = effect();
      if (typeof cleanup === 'function') cleanups.push(cleanup);
    }
    const button = find(tree, node => node.type === 'button' && node.props.children === 'Make a 10-track playlist');
    assert.ok(button, 'The real playlist button should be rendered.');
    assert.equal(button.props.disabled, !liked.length);
    // Invoke even when disabled to verify the handler itself enforces no-likes.
    if(click)button.props.onClick();
    for (let turn = 0; states[3] && turn < 100; turn++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(states[3], false, 'The mocked playlist operation should finish.');
    assert.deepEqual(liked, originalLikes, 'Playlist creation must not change the likes.');
    return {states, events, writes, requests, collectCalls, previousHistory};
  } finally {
    for (const cleanup of cleanups) cleanup();
    if (originalStorage) Object.defineProperty(global, 'localStorage', originalStorage);
    else delete global.localStorage;
  }
}

(async () => {
  // Accidental direct provider access fails instead of reaching the network.
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('Live network calls are forbidden in this test.'); };
  try {
    const unavailable = await runComponent({availability: {ready: false, reason: 'Fixture analysis is unavailable.'}});
    assert.deepEqual(unavailable.events, ['GET /api/station/reviews']);
    assert.equal(unavailable.collectCalls, 0);
    assert.equal(unavailable.requests.some(request => request.method === 'POST'), false);
    assert.deepEqual(unavailable.writes, []);
    assert.equal(unavailable.states[0], null);
    assert.deepEqual(unavailable.states[1], []);
    assert.equal(unavailable.states[5], 'Fixture analysis is unavailable.');

    const ready = await runComponent({availability: reviewAvailability({YOUTUBE_API_KEY: 'fixture-key'})});
    assert.equal(ready.events[0], 'GET /api/station/reviews');
    assert.equal(ready.events[1], 'collect');
    assert.equal(ready.collectCalls, 1);
    const posts = ready.requests.filter(request => request.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, '/api/station/reviews');
    assert.equal(posts[0].body.tracks.length, 20);
    assert.equal(ready.events.at(-1), 'POST /api/station/reviews');
    const selected = ready.states[0], shortlist = ready.states[1];
    assert.equal(shortlist.length, 20);
    assert.equal(Object.keys(ready.states[2]).length, 20);
    assert.equal(selected.length, 10);
    assert.deepEqual(selected.map(row => row.track.title), Array.from({length: 10}, (_, i) => 'Song ' + (19 - i)));
    assert.ok(selected.every(row => shortlist.some(candidate => candidate.track.id === row.track.id)));
    assert.equal(new Set(selected.map(row => row.track.artistId)).size, 10);
    assert.equal(ready.states[5], '');
    const historyWrites=ready.writes.filter(w=>w.key==='genre-atlas.liked-playlist.v1:fixture-user');
    assert.equal(historyWrites.length, 1);
    assert.equal(historyWrites[0].value.recent['previous:selection'], ready.previousHistory.recent['previous:selection']);
    for (const row of selected) assert.ok(Number.isFinite(historyWrites[0].value.recent[songKey(row.track)]));
    assert.equal(Object.keys(historyWrites[0].value.recent).length, 11);
    const snapshots=ready.writes.filter(w=>w.key==='genre-atlas.playlist-candidates.v1:fixture-user');
    assert.equal(snapshots.length,22,'Save shortlist immediately, each result, and final selection');
    const cached=JSON.stringify(snapshots.at(-1).value);
    const restored=await runComponent({cached,click:false});
    assert.equal(restored.states[1].length,20);assert.equal(restored.states[0].length,10);
    assert.equal(Object.keys(restored.states[2]).length,20);
    assert.deepEqual(restored.requests,[],'Restoring must not collect or analyse again');
    assert.deepEqual(restored.writes,[]);
    const other=await runComponent({cached,click:false,userId:'other-user'});
    assert.deepEqual(other.states[1],[],'Another account must not restore this snapshot');
    const changedLikes=await runComponent({cached,click:false,likes:[]});
    assert.equal(changedLikes.states[1].length,20,'Removing likes keeps historical candidates');
    const failedRetry=await runComponent({cached,availability:{ready:false}});
    assert.equal(failedRetry.states[1].length,20,'Failed preflight keeps previous candidates');
    assert.deepEqual(failedRetry.writes,[]);
    const partial=await runComponent({cached:JSON.stringify(snapshots[0].value),click:false});
    assert.equal(partial.states[1].length,20);assert.equal(partial.states[0],null);
    assert.deepEqual(partial.states[2],{},'Interrupted analysis keeps candidates without invented scores');
    const full=await runComponent({storageFails:true});
    assert.equal(full.states[0].length,10);assert.match(full.states[8],/could not be saved/);
    const codec=load('lib/playlist-candidate-cache.ts');
    for(const raw of ['bad', '{}', JSON.stringify({...snapshots[0].value,candidates:[{}]}),JSON.stringify({...snapshots[0].value,candidates:Array(21).fill(shortlist[0])})])assert.equal(codec.readCandidateSnapshot(raw),null);
    const malformed=JSON.parse(cached);const firstKey=Object.keys(malformed.reviews)[0];malformed.reviews[firstKey].summary.score='oops';
    assert.equal(codec.readCandidateSnapshot(JSON.stringify(malformed)).reviews[firstKey],undefined);

    const empty = await runComponent({likes: []});
    assert.deepEqual(empty.requests, []);
    assert.equal(empty.collectCalls, 0);
    assert.deepEqual(empty.writes, []);
    assert.equal(empty.states[0], null);

    for (const approval of [undefined, 'false', 'true']) {
      const config = approval === undefined ? {} : {YOUTUBE_DERIVED_METRICS_APPROVED: approval};
      assert.equal(reviewAvailability(config).ready, false);
      assert.equal(reviewAvailability({...config, YOUTUBE_API_KEY: ''}).ready, false);
      assert.equal(reviewAvailability({...config, YOUTUBE_API_KEY: ' \t\n '}).ready, false);
      assert.equal(reviewAvailability({...config, YOUTUBE_API_KEY: 'fixture-key'}).ready, true);
    }
    console.log('PASS: real playlist button checks readiness before collecting; unavailable/no-likes do not collect, analyse or write history; ready flow shortlists 40 to 20, checks all 20 and keeps the 10 highest strictly positive scores; likes unchanged; missing/blank keys rejected regardless of legacy approval; key enables analysis with absent/false legacy approval. All API/comment/model data are mocked.');
  } finally {
    global.fetch = originalFetch;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
