const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){
  if(modules[name])return modules[name];
  const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const m={exports:{}};new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;
}
const live=load('live-station'),{parseAppleCredits}=load('apple-credits');
const track=live.parseApple({kind:'song',trackId:999001,artistId:7,collectionId:8,artistName:'Fixture Artist',trackName:'Unlisted Song',collectionName:'Original Album'});
const page=(id=999001)=>'<script type="application/json" id="serialized-server-data">'+JSON.stringify([{data:{sections:[
  {itemKind:'songDetailHeader',items:[{contentDescriptor:{identifiers:{storeAdamID:String(id)}}}]},
  {id:'performer',items:[{name:'Not A Producer',roleNames:['Producer']}]},
  {id:'production-and-engineering',items:[{name:'Fixture Engineer',roleNames:['Producer','Mixing Engineer','Mastering Engineer','Additional Producer']}]},
  {id:'more-by-artist',items:[{name:'Wrong Person',roleNames:['Producer']}]},
]}}])+'</script>';
assert.deepEqual(parseAppleCredits(page(),track).map(c=>c.role),['producer','mixing','mastering']);
assert.ok(parseAppleCredits(page(),track).every(c=>c.scope==='track'&&c.source.url.endsWith('999001')));
assert.throws(()=>parseAppleCredits(page(111),track),/selected song ID/);
assert.throws(()=>parseAppleCredits('<html>changed structure</html>',track),/format/);
assert.deepEqual(parseAppleCredits(page().replaceAll('roleNames','missingRoles'),track),[]);
assert.equal(live.chooseCreditPerson([{id:'a',name:'Fixture Engineer'}],'Fixture Engineer').id,'a');
assert.equal(live.chooseCreditPerson([{id:'a',name:'Someone Else',aliases:[{name:'Fixture Engineer'}]}],'Fixture Engineer').id,'a');
assert.equal(live.chooseCreditPerson([{id:'a',name:'Fixture Engineer'},{id:'b',name:'Fixture Engineer'}],'Fixture Engineer'),undefined);
assert.equal(live.chooseCreditPerson([{id:'a',name:'Fixture Engineers'}],'Fixture Engineer'),undefined);

// End-to-end regression: arbitrary song absent from MB recording search, with Apple credits.
// No featured real artist, song ID or hardcoded recommendation is involved in this fixture.
const person='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',recording='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
global.fetch=async input=>{
  const u=new URL(String(input));
  const result=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  if(u.hostname==='itunes.apple.com')return result({results:[{kind:'song',trackId:999001,artistId:7,collectionId:8,artistName:track.artist,trackName:track.title,collectionName:track.album}]});
  if(u.hostname==='music.apple.com')return new Response(page());
  if(u.pathname==='/ws/2/recording/')return result({recordings:[]});
  if(u.pathname==='/ws/2/artist/')return result({count:1,artists:[{id:person,name:'Fixture Engineer'}]});
  if(u.pathname==='/ws/2/artist/'+person)return result({id:person,name:'Fixture Engineer',relations:[{type:'producer',recording:{id:recording}}]});
  if(u.pathname==='/ws/2/recording/'+recording)return result({id:recording,title:'Beyond The Fixture',length:180000,'artist-credit':[{name:'Another Artist',artist:{id:'another'}}],releases:[{id:'release',title:'Different Album',status:'Official'}],relations:[]});
  throw new Error('Unexpected fixture request '+u);
};
(async()=>{
  const r=await live.liveStation(track.id);
  assert.equal(r.status,'connected');assert.equal(r.partial,false);assert.equal(r.rows.length,1);
  assert.equal(r.rows[0].track.title,'Beyond The Fixture');
  assert.ok(r.rows[0].reasons.some(x=>x.kind==='credit'&&x.sources.some(s=>s.label.includes('Apple Music'))));
  assert.ok(!live.sameAlbum(r.seed,r.rows[0].track));
  // Cached Apple credits must not be mutated by the MB identity resolver.
  assert.ok(parseAppleCredits(page(),track).every(c=>c.person.startsWith('apple-credit:')));
  console.log('PASS: exact Apple song ID, role parsing, source isolation, alias/ambiguity safety, generic non-catalog song → Apple credits → MB participation → recommendation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
