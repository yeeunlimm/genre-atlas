const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const p=load('station-profile'),h=load('hybrid-station'),{stationCatalog:c}=load('station-catalog');
assert.notEqual(p.profileKey(null),p.profileKey('alice'));assert.notEqual(p.profileKey('bob'),p.profileKey('alice'));
assert.equal(p.stationSeeds(c[0],[]).length,1,'one starting song is sufficient');
const liked=p.addLiked([c[0],c[1]],c[1]);assert.equal(liked.length,2);assert.equal(liked[0].id,c[1].id);
const seeds=p.stationSeeds(c[0],liked);assert.equal(seeds.length,2);assert.equal(seeds[0].id,c[0].id);assert.equal(p.stationSeeds(c[0],c).length,5,'recent likes are selected automatically within a bounded request budget');
const row={track:c[0],score:1,reasons:[],paths:[{route:'credits',seedId:'other',confidence:1}]};
const raw={version:2,memory:h.recordVote(h.blankMemory(),row,'like'),liked:[c[0],c[1]]};
assert.equal(p.readProfile(raw,false).liked.length,0,'anonymous user cannot reuse signed-in likes');assert.equal(Object.keys(p.readProfile(raw,false).memory.votes).length,0);
assert.equal(p.readProfile(raw,true).liked.length,2);assert.equal(Object.keys(p.readProfile(raw,true).memory.votes).length,1);
assert.deepEqual(p.readProfile({liked:[{},null,{...c[0],source:{url:'javascript:bad'}}]},true).liked,[]);
assert.equal(p.readProfile({liked:[c[0],c[0]]},true).liked.length,1);
const html=fs.readFileSync('components/hybrid-discovery-station.tsx','utf8');assert.ok(!html.includes('Build my station'));assert.ok(!html.includes('Choose 1–5'));assert.ok(html.includes('target="_top"'));assert.ok(html.includes('method:"POST"'));
console.log('PASS single-song start, automatic liked seeds, separate user/guest browser profiles, safe saved-track parsing, no build button, top-level sign-in');
