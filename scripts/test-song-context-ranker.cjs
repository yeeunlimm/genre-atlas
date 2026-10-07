const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};function load(name){if(modules[name])return modules[name];const m={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const f=load('song-context-features'),r=load('catboost-seed-ranker'),h=load('hybrid-station'),s=load('selected-song-discovery');
const source={label:'Test recording',url:'https://musicbrainz.org/recording/test'};
const track=(id,genre)=>({id,recordingId:id,title:id,artist:id+' artist',artistId:id+'-artist',album:id+' album',albumFamily:id+' album',source,checkedAt:'2026-10-07',credits:[],durationMs:200000,genres:genre?[{name:genre,scope:'track',source}]:[]});
const vocab=['indie rock','pop'];
const seed=track('seed','Indie Rock'),a=track('a','indie rock'),b=track('b','pop');
const row=t=>({track:t,score:0,feedbackBoost:false,reasons:[],paths:[{route:'credits',seedId:seed.id,confidence:.76}]});
const x=f.songContextFeatures(f.contextMetadata(seed),f.contextMetadata(a),vocab);
assert.deepEqual(x,[1,1,1,1,1,1,1,1,1,0,1,0]);
assert.equal(f.songContextFeatures({genres:[],durationMs:NaN},{genres:['pop']},vocab)[0],-1);
assert.equal(f.contextMetadata({...a,genres:[{name:'pop',scope:'album',source}]}).genres.length,0,'album tags are not silently relabelled as recording tags');
assert.equal(f.contextMetadata({...a,genres:[{name:'pop',scope:'track',source:{url:'https://music.youtube.com/browse/test'}}]}).genres.length,0);
assert.deepEqual(f.songContextFeatures(f.contextMetadata({...seed,artist:'Never seen',artistId:'never-seen',credits:[{person:'P'}]}),f.contextMetadata(a),vocab),x,'artist IDs and producer IDs are not model inputs');
const artifact={format:'genre-atlas-song-context-catboost',version:1,modelId:'synthetic-test-only',approved:true,featureVersion:1,genreVocabulary:vocab,featureNames:f.contextFeatureNames(vocab),normalization:{low:0,high:1},scale:1,bias:0,trees:[{splits:[{feature:0,border:.5}],leaves:[0,1]}]};
const model=r.readRankerArtifact(artifact);
assert.ok(model);
assert.equal(r.readRankerArtifact({...artifact,approved:false}),null);
assert.equal(r.readRankerArtifact({...artifact,genreVocabulary:['pop','pop']}),null);
assert.equal(r.readRankerArtifact({...artifact,genreVocabulary:['POP']}),null);
assert.equal(r.readRankerArtifact({...artifact,featureNames:['artist_id']}),null);
assert.equal(r.readRankerArtifact({...artifact,format:'arbitrary-format'}),null);
assert.equal(r.readRankerArtifact({...artifact,privateRows:['not public']}).privateRows,undefined);
assert.equal(r.rankerCanScoreSeed(model,[track('no-genre')]),false);
assert.equal(r.rankerCanScoreSeed(model,[track('blank-genre','  ')]),false);
assert.equal(r.rankSongCandidates([row(b),row(a)],[seed],h.blankMemory(),[],model)[0].track.id,'a');
assert.equal(r.rankSongCandidates([row(b),row(a)],[{...seed,genres:b.genres}],h.blankMemory(),[],model)[0].track.id,'b','the selected song affects ranking');
const votes=h.recordVote(h.blankMemory(),row(track('unrelated','pop')),'like',100);
assert.deepEqual(r.rankSongCandidates([row(b),row(a)],[seed],s.selectedSongMemory(votes),[],model,100),r.rankSongCandidates([row(b),row(a)],[seed],s.selectedSongMemory(h.blankMemory()),[],model,100),'saved history is not used for scoring');
assert.equal(r.rankSongCandidates([row(b),row(a)],[seed],h.recordVote(h.blankMemory(),row(a),'dislike'),[],model)[0].track.id,'b','explicit exclusions remain');
assert.deepEqual(r.rankSongCandidates([row(b),row(a)],[{...seed,genres:[]}],h.blankMemory(),[],model,100),h.rankCandidates([row(b),row(a)],[{...seed,genres:[]}],h.blankMemory(),[],100));
if(process.argv[2]){
 const fixture=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 assert.equal(r.readRankerArtifact(fixture.artifact),null,'offline experiment is not approved for service');
 const native=r.readRankerArtifact({...fixture.artifact,approved:true,modelId:'native-parity-test-only'});
 assert.ok(native);
 let maxError=0;
 fixture.examples.forEach((example,i)=>{
   const computed=f.songContextFeatures(example.seed,example.candidate,native.genreVocabulary);
   assert.deepEqual(computed,example.x,'Python/TypeScript feature parity');
   maxError=Math.max(maxError,Math.abs(r.predictPair(native,computed)-fixture.predictions[i]));
 });
 assert.ok(maxError<1e-7,'Python/TypeScript prediction parity');
 console.log('Native-model parity; maximum error:',maxError);
}
console.log('PASS selected-song context, unseen identity, no personal history, approval guard, fallback and exclusions.');
