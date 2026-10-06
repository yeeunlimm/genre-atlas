const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(path){const m={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,require,m);return m.exports;}
const {resolveAlbumArtist}=load('lib/release-identity.ts');
(async()=>{
 const rows=[{id:1,name:'Artist',nb_fan:1000000,nb_album:4},{id:2,name:'Artist',nb_fan:5,nb_album:0}];
 const albums={1:{data:[{title:'Currents'},{title:'The Slow Rush (Deluxe Edition)'}],total:2},2:{data:[],total:0}};
 const hints={albums:['Currents','The Slow Rush']};let calls=0;
 const read=async id=>{calls++;return albums[id];};
 let r=await resolveAlbumArtist('Artist',rows,hints,read);assert.equal(r.id,'1');assert.equal(r.identity,'album-match');assert.equal(calls,2);assert.equal(r.page,albums[1]);
 r=await resolveAlbumArtist('Artist',[...rows].reverse(),hints,read);assert.equal(r.id,'1','not tied to first result');
 r=await resolveAlbumArtist('Artist',rows,{albums:['Currents']},read);assert.equal(r.id,'1','one match allowed only when competing catalog is confirmed empty');
 r=await resolveAlbumArtist('Artist',rows,{},read);assert.equal(r.id,undefined,'fan counts and empty duplicate alone cannot establish identity');assert.equal(r.choices.length,2);
 r=await resolveAlbumArtist('Artist',rows,{...hints,choose:true},read);assert.equal(r.id,undefined,'Change artist bypasses automatic match');assert.equal(r.choices[0].albums[0],'Currents');
 r=await resolveAlbumArtist('Artist',rows,hints,async id=>id==='2'?{data:[{title:'Currents'}],total:1}:albums[1]);assert.equal(r.id,undefined,'overlapping identities stay ambiguous');
 r=await resolveAlbumArtist('Artist',rows,hints,async id=>{if(id==='2')throw Error('timeout');return albums[1];});assert.equal(r.id,undefined,'unavailable is not empty');assert.match(r.choices[1].detail,/unavailable/);
 r=await resolveAlbumArtist('Artist',rows,hints,async id=>id==='2'?{data:[],total:1,next:'more'}:albums[1]);assert.equal(r.id,'1','two independent matches can identify against different known releases');
 r=await resolveAlbumArtist('Artist',rows,{albums:['Currents']},async id=>id==='2'?{data:[],total:1,next:'more'}:albums[1]);assert.equal(r.id,undefined,'incomplete empty page is not an empty catalog');
 calls=0;r=await resolveAlbumArtist('Artist',[rows[0],rows[0],{id:3,name:'Different'}],{},read);assert.equal(r.id,'1');assert.equal(calls,0,'unique exact artist costs no extra lookup');
 calls=0;r=await resolveAlbumArtist('Artist',Array.from({length:6},(_,i)=>({id:i+1,name:'Artist'})),hints,read);assert.equal(r.choices.length,6);assert.equal(calls,0,'bound external lookup fanout');
 const store=new Map();global.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
 const prefs=load('lib/album-artist-preference.ts'),a={id:'youtube:1',name:'Artist'};
 assert.equal(prefs.preferredAlbumArtist(a),'');prefs.rememberAlbumArtist(a,'1');assert.equal(prefs.preferredAlbumArtist(a),'1');
 assert.equal(load('lib/album-artist-preference.ts').preferredAlbumArtist(a),'1','survives component/module remount');
 assert.equal(prefs.preferredAlbumArtist({...a,id:'youtube:2'}),'','do not merge homonyms');assert.equal(prefs.preferredAlbumArtist({...a,name:'Changed'}),'');
 prefs.rememberAlbumArtist(a,'../../bad');assert.equal(prefs.preferredAlbumArtist(a),'1');prefs.forgetAlbumArtist(a);assert.equal(prefs.preferredAlbumArtist(a),'');
 store.set('genre-atlas:album-artist:v1','{broken');assert.equal(prefs.preferredAlbumArtist(a),'');
 Object.defineProperty(global,'localStorage',{configurable:true,get(){throw Error('disabled');}});assert.equal(prefs.preferredAlbumArtist(a),'');prefs.rememberAlbumArtist(a,'1');prefs.forgetAlbumArtist(a);
 console.log('PASS: evidence matching, reversed ranking, ambiguous/failed/incomplete candidates, force picker, deduplication, lookup bounds, saved selection and unavailable storage.');
})().catch(e=>{console.error(e);process.exit(1);});
