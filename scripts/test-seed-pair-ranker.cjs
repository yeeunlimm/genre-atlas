const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};function load(name){if(modules[name])return modules[name];const m={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const h=load('hybrid-station'),f=load('seed-pair-features'),r=load('catboost-seed-ranker'),learning=load('station-learning');
const source={label:'Test metadata',url:'https://musicbrainz.org/recording/test'};
const track=(id,credits=[])=>({id,recordingId:id,title:id,artist:id+' artist',artistId:id+'-artist',album:id+' album',albumFamily:id+' album',source,checkedAt:'2026-10-07',credits,genres:[]});
const credit=(person,role='producer',scope)=>({person,name:person,role,scope,source});
const seed=track('seed',[credit('producer-A'),credit('master-A','mastering','release')]);
const row=(t,confidence=.76)=>({track:t,score:0,feedbackBoost:false,reasons:[{kind:'credit',label:'Production',detail:'Test',sources:[source]}],paths:[{route:'credits',seedId:seed.id,confidence}]});
const a=row(track('a',[credit('producer-A')])),b=row(track('b',[credit('producer-B')]));
const get=(x,name)=>x[f.PAIR_FEATURE_NAMES.indexOf(name)];
let x=f.pairFeatures(seed,a);
assert.equal(get(x,'shared_producer'),1);
assert.equal(get(x,'shared_mastering'),-1,'missing is not known non-overlap');
assert.equal(get(x,'shared_track_producer'),-1,'unspecified scope is not recording evidence');
assert.equal(get(f.pairFeatures(seed,b),'shared_producer'),0);
assert.equal(get(f.pairFeatures(seed,row(track('cross',[credit('producer-A','mastering')]))),'shared_producer'),-1,'mastering is not producing');
assert.equal(get(f.pairFeatures(seed,row(track('release',[credit('master-A','mastering','release')]))),'shared_release_mastering'),1);
assert.equal(get(f.pairFeatures({...seed,durationMs:200000},{...a,track:{...a.track,durationMs:250000}}),'duration_similarity'),.8);
assert.equal(get(x,'sample_artist_connection'),-1,'no sample record is unknown, not evidence of no sample');
const genres=[{name:'Jangle Pop',scope:'track',source},{name:'Indie Rock',scope:'track',source}];
assert.equal(get(f.pairFeatures({...seed,genres},{...a,track:{...a.track,genres:genres.slice(0,1)}}),'track_genre_jaccard'),.5);
assert.deepEqual(f.pairFeatures({...seed,artist:'Unseen Artist',artistId:'never-trained'},a),x,'artist identity is not X');
const youtube={label:'YouTube Music',url:'https://music.youtube.com/browse/test'};
assert.equal(get(f.pairFeatures(seed,{...a,track:{...a.track,credits:[{...credit('producer-A'),source:youtube}]}}),'shared_producer'),-1);
assert.equal(f.makePairSnapshot({...a,track:{...a.track,source:youtube}},[seed]).trainable,false);
assert.equal(f.makePairSnapshot(a,[seed,a.track]),undefined,'general single-seed training only');

const artifact={format:'genre-atlas-seed-catboost',version:1,modelId:'unit-test-only',approved:true,featureVersion:1,featureNames:[...f.PAIR_FEATURE_NAMES],normalization:{low:0,high:1},scale:1,bias:0,trees:[{splits:[{feature:0,border:.5}],leaves:[1,0]}]};
const model=r.readRankerArtifact(artifact);
assert.ok(model);
assert.equal(r.readRankerArtifact({...artifact,approved:false}),null);
assert.equal(r.readRankerArtifact({...artifact,featureNames:learning.FEATURE_NAMES}),null,'old model cannot be relabelled');
assert.equal(r.readRankerArtifact({...artifact,trees:[{splits:[{feature:99,border:0}],leaves:[0,1]}]}),null);
assert.equal(r.readRankerArtifact({...artifact,normalization:{low:1,high:1}}),null);
assert.equal(r.readRankerArtifact({...artifact,privateTrainingRows:['do not publish']}).privateTrainingRows,undefined);
assert.equal(r.predictPair(model,x),0);
assert.equal(r.predictPair(model,f.pairFeatures(seed,b)),1);
assert.ok(Math.abs(r.blendScore(.7,.5,{low:0,high:1}).total-.66)<1e-12);
assert.equal(r.blendScore(0,999,{low:0,high:1}).total,.2,'ML contribution is capped at 20%');
assert.equal(r.blendScore(.5,-99,{low:0,high:1}).total,.4);
assert.equal(f.creditRouteScore({...a,paths:[...a.paths,...a.paths]},seed),.8,'repeated routes do not inflate score');
assert.equal(r.rankSongCandidates([a,b],[seed],h.blankMemory(),[],model)[0].track.id,'b','model can reorder equally connected candidates');
assert.deepEqual(r.rankSongCandidates([a,b],[seed],h.blankMemory(),[],null,100),h.rankCandidates([a,b],[seed],h.blankMemory(),[],100),'exact fallback parity');
const sameAlbum=row({...b.track,id:'same-album',recordingId:'same-album',albumFamily:seed.albumFamily});
const sameArtist=row({...b.track,id:'another-b',recordingId:'another-b',title:'other song'});
assert.equal(r.rankSongCandidates([a,b,sameArtist,sameAlbum],[seed],h.blankMemory(),[],model).length,2,'album exclusion and artist cap survive new scoring');
assert.equal(r.rankSongCandidates([a,b],[seed],h.recordVote(h.blankMemory(),b,'dislike'),[],model)[0].track.id,'a');
assert.equal(r.rankSongCandidates([a,b],[seed],h.remember(h.blankMemory(),b.track),[],model)[0].track.id,'a');
assert.equal(r.rankSongCandidates([a,b],[seed],h.blankMemory(),[b.track],model)[0].track.id,'a');
const corrupted={...model,trees:[{splits:[],leaves:[NaN]}]};
assert.deepEqual(r.rankSongCandidates([a,b],[seed],h.blankMemory(),[],corrupted,100),h.rankCandidates([a,b],[seed],h.blankMemory(),[],100),'invalid inference falls back for entire queue');

const event=learning.makeExposure(a,[seed],learning.emptyLearning(),'query-1','exposure-1',100);
let data=learning.appendExposure(learning.emptyLearning(),event),before=JSON.stringify(event.seedPair);
data=learning.rateExposure(data,event.id,'skip',101);
assert.equal(data.events[0].label,null);
data=learning.rateExposure(data,event.id,'like',102);
assert.equal(JSON.stringify(data.events[0].seedPair),before,'X remains frozen when label changes');
assert.equal(learning.readLearning(data).events[0].seedPair.x.length,16);
assert.equal(learning.exportLearning(data).seedPairFeatureNames.length,16);
const old={...event};delete old.seedPair;
assert.equal(learning.readLearning({version:1,events:[old]}).events.length,1,'old ratings are preserved, not backfilled');
assert.equal(learning.readLearning({version:1,events:[{...event,seedPair:{...event.seedPair,x:[1]}}]}).events[0].seedPair,undefined,'malformed new snapshot does not destroy old feedback');
const component=fs.readFileSync('components/hybrid-discovery-station.tsx','utf8');
assert.ok(component.includes('rankSongCandidates(discoveryRows,seeds,discoveryMemory,consumed,seedRanker.model)'));
assert.ok(component.includes('no approved model for these features'));
assert.ok(!component.includes('modelScore('),'old linear model is not used as CatBoost');

// Optional fixture from native Python CatBoost. Contains synthetic test data only.
if(process.argv[2]){
  const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
  const nativeModel=r.readRankerArtifact({...fixture.artifact,approved:true,modelId:'native-parity-test-only'});
  assert.ok(nativeModel);
  fixture.x.forEach((x,i)=>assert.ok(Math.abs(r.predictPair(nativeModel,x)-fixture.predictions[i])<1e-7,'TypeScript/native CatBoost parity'));
}
console.log('PASS seed-pair features, missingness, provenance, frozen X/Y, numeric CatBoost scoring, 80:20 blend, fallback and exclusions.');

// Test the route without ever installing a synthetic model in the live work path.
async function testEndpoint(){
  const data={...artifact,privateTrainingRows:['must never reach browser']};
  function endpoint(model){const api={exports:{}};
  new Function('exports','require','module',ts.transpileModule(fs.readFileSync('app/api/station/ranking/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText)(api.exports,p=>p==='@/lib/catboost-seed-ranker'?r:p==='@/models/station-ranker.json'?model:require(p),api);return api;}
  const api=endpoint(data);
  let response=await api.exports.GET(),body=await response.json();
  assert.equal(body.status,'ready');
  assert.equal(body.artifact.privateTrainingRows,undefined);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(body.deploymentMode,'experimental');
  assert.equal(body.qualityImprovementVerified,false);
  assert.equal((await(await endpoint({...artifact,approved:false}).exports.GET()).json()).status,'unavailable');
  assert.equal((await(await endpoint({...artifact,trees:Array(1001).fill(artifact.trees[0])}).exports.GET()).json()).status,'unavailable');
  const deployed=JSON.parse(fs.readFileSync('models/station-ranker.json','utf8'));
  assert.ok(r.readRankerArtifact(deployed));
  assert.equal(deployed.trees.length,98);
  assert.equal((await(await endpoint(deployed).exports.GET()).json()).artifact.modelId,deployed.modelId);
  assert.deepEqual(Object.keys(deployed).sort(),Object.keys(r.readRankerArtifact(deployed)).sort(),'no training rows or identifiers in deployed artifact');
  console.log('PASS experimental deployment, approval, sanitization, tree bounds and real 98-tree model.');
}
testEndpoint().catch(error=>{console.error(error);process.exitCode=1;});
