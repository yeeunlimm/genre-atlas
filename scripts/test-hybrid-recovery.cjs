const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const h=load('hybrid-station'),r=load('station-recovery'),sources=load('hybrid-sources'),live=load('live-station');
const seed={id:'seed',recordingId:'seed',artistId:'seed-artist',title:'Seed',artist:'Seed Artist',album:'Seed Album',albumFamily:'seed-album',credits:[],genres:[],source:{url:'https://example.com',label:'Test'},checkedAt:'2026-10-02'};
const progress=(state='empty',offset=0,nextOffset=6)=>({seed,route:'related-artists',offset,nextOffset,state,count:0,note:''});
const tried=new Set();
assert.equal(r.recoveryJobs([progress()],tried)[0].offset,6,'empty first page continues automatically');
assert.equal(r.recoveryJobs([progress('loading')],tried).length,0,'wait for in-flight requests');
assert.equal(r.recoveryJobs([progress('disabled')],tried).length,0,'never enable disabled Last.fm');
assert.equal(r.recoveryJobs([progress('empty',6,6)],tried).length,0,'reject nonadvancing cursor');
const retry=progress('error',0,null);tried.add(r.attemptKey(retry));
assert.equal(r.recoveryJobs([retry],tried).length,0,'one automatic retry only');
assert.equal(r.recoveryJobs([progress()],new Set(Array.from({length:r.AUTO_REQUEST_LIMIT},(_,i)=>String(i)))).length,0,'bounded recovery budget');
const candidate={track:{...seed,id:'other',recordingId:'other',artistId:'other',artist:'Peer',album:'Peer Album',albumFamily:'peer-album'},score:0,reasons:[],feedbackBoost:false,paths:[{route:'related-artists',seedId:seed.id,confidence:.8}]};
assert.match(r.emptyStationMessage([], [seed],h.blankMemory(),[],[retry]).title,/unavailable/);
assert.match(r.emptyStationMessage([], [seed],h.blankMemory(),[],[progress('empty',0,null)]).title,/No connected/);
assert.match(r.emptyStationMessage([candidate],[seed],h.remember(h.blankMemory(),candidate.track),[],[]).title,/recently/);
assert.match(r.emptyStationMessage([candidate],[seed],h.recordVote(h.blankMemory(),candidate,'dislike'),[],[]).title,/end of this mix/);

async function main(){
  const artistId='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',recordingId='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  modules['youtube-music'].music=async kind=>kind==='search'?{artists:[{id:'fixture',name:seed.artist,url:'https://music.youtube.com/channel/fixture'}]}:{related:[{name:'Fallback Peer',id:'peer'}]};
  global.fetch=async input=>{
    const url=new URL(String(input));
    if(url.hostname==='itunes.apple.com')return new Response('Unavailable',{status:503});
    if(url.pathname==='/ws/2/artist/')return Response.json({count:1,artists:[{id:artistId,name:'Fallback Peer'}]});
    assert.match(url.searchParams.get('query'),/arid:/,'recordings queried by resolved artist identity');
    const recording={id:recordingId,title:'Fallback Song','artist-credit':[{artist:{id:artistId,name:'Fallback Peer'}}],releases:[{id:'cccccccc-cccc-cccc-cccc-cccccccccccc',title:'Fallback Album',status:'Official'}]};
    return Response.json({recordings:[recording,{...recording,id:'wrong',title:'Cover','artist-credit':[{artist:{id:'other',name:'Cover Band'}}]}]});
  };
  const result=await sources.youtubeRelated(seed);
  assert.equal(result.state,'ready');assert.equal(result.rows.length,1,'Apple failure still yields MB recommendation');
  assert.equal(result.rows[0].track.title,'Fallback Song');
  assert.equal(result.rows[0].track.catalogKind,'musicbrainz');
  assert.equal(result.rows[0].paths[0].route,'related-artists','fallback does not fabricate a credit link');
  assert.match(result.rows[0].reasons[0].detail,/MusicBrainz/);
  global.fetch=async()=>Response.json({count:2,artists:[{id:'one',name:'Ambiguous Peer'},{id:'two',name:'Ambiguous Peer'}]});
  assert.deepEqual(await live.musicBrainzCatalog('Ambiguous Peer'),[],'namesakes cannot be merged');
  global.fetch=async()=>new Response('Unavailable',{status:503});
  await assert.rejects(()=>sources.catalog('Offline Peer'),/catalogs could not load/,'source failure must not become an empty successful result');
  console.log('PASS recovery: bounded auto-pagination/retry, truthful empty states, Apple outage -> exact MB catalog, wrong artist/ambiguous identity rejected');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
