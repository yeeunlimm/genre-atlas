const assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync("lib/"+name+".ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function("exports","require","module",code)(m.exports,p=>p.startsWith("./")?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const l=load("station-learning"),h=load("hybrid-station"),{onePerArtist}=load("discovery-station");
const source={label:"Test fixture",url:"https://musicbrainz.org/recording/test"};
function track(id,artist="Artist "+id,album="Album "+id){return {id,recordingId:id,title:"Song "+id,artist,artistId:artist,album,albumFamily:album,source,credits:[],genres:[],checkedAt:""};}
function row(t){return {track:t,score:0,feedbackBoost:false,reasons:[],paths:[{route:"credits",seedId:"seed",confidence:.8}]};}
const credit=(role,person="person-a",scope="track")=>({role,person,name:"Name",source,scope});
const seed=track("seed");seed.credits=[credit("producer"),credit("mastering")];seed.genres=[{name:"Rock",scope:"track",source}];
const a=row(track("a"));a.track.credits=[credit("mastering")];a.track.genres=[{name:"Rock",scope:"track",source},{name:"Pop",scope:"track",source}];a.reasons=[{kind:"credit",label:"Shared mastering",detail:"Test",sources:[source]}];
let data=l.emptyLearning(),x=l.featureVector(a,[seed],data,100);
assert.equal(x[0],0,"mastering is not production");assert.equal(x[1],1);assert.equal(x[3],.5);assert.equal(x[9],0,"unknown producer availability is separate");assert.equal(x[10],1);
assert.equal(l.featureVector(row(track("unknown")),[seed],data,100)[11],0,"missing genre is marked");
const e=l.makeExposure(a,[seed],data,"session-a","event-a",100);
data=l.appendExposure(data,e);
const skipped=l.rateExposure(data,e.id,"skip",110);assert.equal(skipped.events[0].label,null);assert.equal(l.trainRanker(skipped).labels,0);
data=l.rateExposure(data,e.id,"like",120);
assert.deepEqual(data.events[0].features,e.features,"label does not rewrite pre-feedback features");
assert.equal(l.featureVector(a,[seed],data,120)[8],0,"same-time rating not prior history");
assert.equal(l.featureVector(a,[seed],data,121)[8],1);
assert.ok(l.featureVector(a,[seed],data,121)[7]>0,"liked creator history");
const youtube=row(track("youtube"));youtube.paths=[{route:"related-artists",seedId:"seed",confidence:.9}];youtube.reasons=[{kind:"related-artist",label:"Similar",detail:"Test",sources:[{label:"YouTube",url:"https://music.youtube.com/browse/test"}]}];
assert.equal(l.featureVector(youtube,[seed],data)[5],0,"YouTube evidence not a training route feature");
assert.notEqual(l.learningKey("user-one"),l.learningKey("user-two"));assert.notEqual(l.learningKey(null),l.learningKey("user-one"));
assert.equal(l.readLearning({version:1,events:[{...e,features:[Infinity]}]}).events.length,0);
assert.equal(l.readLearning({version:1,events:[{...e,action:"skip",label:0}]}).events.length,0);
assert.equal(l.readLearning({version:1,events:[{...e,action:"like",label:1,ratedAt:99}]}).events.length,0);
const synthetic=l.emptyLearning();
for(let g=0;g<8;g++)for(let i=0;i<6;i++){
 const event=l.makeExposure(row(track(g+"-"+i)),[seed],synthetic,"group-"+g,"event-"+g+"-"+i,g*1000+i*10);
 event.features=Array(l.FEATURE_NAMES.length).fill(0);event.features[0]=i<3?1:0;
 event.label=i<3?1:0;event.action=i<3?"like":"dislike";event.ratedAt=event.at+1;synthetic.events.push(event);
}
const model=l.trainRanker(synthetic);assert.equal(model.active,true);assert.ok(model.weights[0]>0);assert.equal(model.holdoutAccuracy,1,"synthetic-only direction check, not user quality");
const inverted={...synthetic,events:synthetic.events.map(e=>({...e,label:1-e.label,action:e.label?"dislike":"like"}))};assert.ok(l.trainRanker(inverted).weights[0]<0,"learned direction reverses from labels");
assert.equal(l.trainRanker(l.emptyLearning()).active,false);
const same1=row(track("same1","Same")),same2=row(track("same2","Same")),other=row(track("other"));
const ranked=h.rankCandidates([same1,same2,other],[seed],h.blankMemory(),[],Date.now(),r=>r.track.id==="same2"?3:1);
assert.equal(ranked.filter(r=>r.track.artist==="Same").length,1);assert.equal(ranked[0].track.id,"same2","learned ordering precedes artist cap");
const forbidden=row({...track("forbidden"),albumFamily:seed.albumFamily});assert.equal(h.rankCandidates([forbidden],[seed],h.blankMemory(),[],Date.now(),()=>100).length,0,"ML cannot bypass same album exclusion");
assert.equal(onePerArtist([...ranked,...ranked]).length,2);
assert.equal(l.exportLearning(data).featureNames.length,16);
console.log("PASS: feature provenance, missingness, explicit labels, frozen snapshots, temporal history, identity separation, learned ranking, holdout and hard constraints (synthetic fixtures only).");
