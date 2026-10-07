const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

const station = fs.readFileSync('components/hybrid-discovery-station.tsx', 'utf8');
assert.doesNotMatch(station, /PlaylistImport|playlist-import|Add songs from a list/,
  'The active station must not expose the bulk text-list importer.');
assert.doesNotMatch(station, /Sign in again before importing|tracks\.reduce\(\(result,track\)=>addLiked/,
  'The bulk-import callback must be disconnected as well as its UI.');
assert.match(station, /const next=addLiked\(liked,track\);setLiked\(next\)/,
  'Individual song likes remain available.');
assert.match(station, /onRemove=\{removeLiked\}/,
  'The existing one-song removal action remains available.');
assert.match(station, /<LikedPlaylist\b[^>]*liked=\{liked\}/,
  'Sentiment-filtered playlists still receive the member\'s likes.');
assert.match(station, /localStorage\.getItem\(profileKey\(id\)\)/,
  'Existing account-specific saved likes are still read.');
assert.match(station, /localStorage\.setItem\(profileKey\(userId\)/,
  'Account-specific storage remains connected.');

// Confirm existing saved songs survive reading and adding one song, without
// relying on the removed list-import UI. Fixture-only data; no account/network.
const modules = {};
function load(name) {
  if (modules[name]) return modules[name];
  const module = {exports: {}};
  const code = ts.transpileModule(fs.readFileSync('lib/' + name + '.ts', 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  new Function('exports', 'require', 'module', code)(module.exports,
    id => id.startsWith('./') ? load(id.slice(2)) : require(id), module);
  modules[name] = module.exports;
  return module.exports;
}
const profile = load('station-profile');
const fixture = load('station-catalog').stationCatalog[0];
const saved = Array.from({length: 59}, (_, index) => ({
  ...fixture, id: 'saved-' + index, recordingId: 'saved-' + index,
  title: 'Saved song ' + index,
}));
const restored = profile.readProfile({version: 2, liked: saved}, true);
assert.equal(restored.liked.length, saved.length, 'Previously imported likes are preserved.');
const single = {...fixture, id: 'single-like', recordingId: 'single-like', title: 'Single new like'};
const updated = profile.addLiked(restored.liked, single);
assert.equal(updated.length, saved.length + 1, 'One-song liking continues to work.');
assert.equal(restored.liked.length, saved.length, 'Adding a like does not mutate existing stored data.');
assert.deepEqual(updated.slice(1).map(track => track.id), restored.liked.map(track => track.id));
assert.notEqual(profile.profileKey('account-a'), profile.profileKey('account-b'));
assert.equal(profile.readProfile({liked: saved}, false).liked.length, 0, 'Guest state cannot read member likes.');
console.log('PASS: bulk list import removed; individual likes, remove action, existing songs, account storage and filtered playlists preserved.');
