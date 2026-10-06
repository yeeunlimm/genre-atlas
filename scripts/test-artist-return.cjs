const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('lib/artist-return.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const m={exports:{}};new Function('exports','require','module',code)(m.exports,require,m);
const nav=m.exports,prefix='genre-atlas:artist-return:';
const saved={query:'Tame Impala',artist:{id:'artist-1',name:'Tame Impala'},related:[{id:'peer'}],genres:[],genreSource:'',genreStatus:'',note:'',provider:'YouTube Music',catalog:{artistId:'artist-1',data:{artistId:'134790',nextOffset:50},cards:[{id:'record-1'},{id:'record-2'}],filter:'Album',order:'latest',releaseId:'record-2',viewportTop:180},scrollY:1000};
const storage={};
for(const [name,fn] of Object.entries({getItem:key=>storage[key]??null,setItem:(key,v)=>{storage[key]=v;},removeItem:key=>{delete storage[key];}}))Object.defineProperty(storage,name,{value:fn});
global.sessionStorage=storage;
let location=new URL('https://site.test/#discovery-station'),events=new Map(),frames=new Map(),nextFrame=0;
global.window={get location(){return location;},history:{state:{router:'preserve'},length:3,scrollRestoration:'auto',replaceState(state,_,url){this.state=state;if(url)location=new URL(url,location);}},scrollY:0,scrollTo({top}){this.scrollY=top;},addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn);},removeEventListener(type,fn){events.get(type)?.delete(fn);}};
global.requestAnimationFrame=fn=>{frames.set(++nextFrame,fn);return nextFrame;};
global.cancelAnimationFrame=id=>frames.delete(id);
let cardY=1180,available=true,focus=0;
global.document={referrer:'',getElementById:id=>available&&id==='release-record-2'?{focus(options){assert(options.preventScroll);focus++;},getBoundingClientRect:()=>({top:cardY-window.scrollY})}:null};
function tick(time){const jobs=[...frames.values()];frames.clear();for(const fn of jobs)fn(time);}
function fire(type){for(const fn of [...(events.get(type)||[])])fn();}
const key=nav.saveArtistReturn(saved);
assert(key);assert.equal(location.searchParams.get('return'),key);assert.equal(location.searchParams.get('albumArtist'),'Tame Impala');assert.equal(location.hash,'');assert.equal(window.history.state.router,'preserve');
// Simulate a router overwriting custom history state: the source URL still restores.
window.history.state={router:'new'};assert.deepEqual(nav.readArtistReturn(),{version:1,savedAt:JSON.parse(storage[prefix+key]).savedAt,...saved});
assert.equal(nav.readArtistReturn().catalog.data.nextOffset,50);assert.equal(nav.readArtistReturn().catalog.cards.length,2);
const old=JSON.parse(storage[prefix+key]);old.savedAt=Date.now()-2*60*60*1000;storage[prefix+key]=JSON.stringify(old);assert(nav.readArtistReturn(key),'still works after spending two hours on a record');
document.referrer=location.href;assert.equal(nav.canReturnThroughHistory(key),true);
document.referrer='https://site.test/';assert.equal(nav.canReturnThroughHistory(key),false,'do not assume every same-site home is the matching entry');
document.referrer='https://elsewhere.test/?return='+key;assert.equal(nav.canReturnThroughHistory(key),false);
assert.equal(nav.readArtistReturn('../other'),null);
assert.equal(nav.artistReturnHref('A & B',null),'/?albumArtist=A+%26+B#artist-discover');
nav.clearArtistReturnMarker();assert.equal(location.searchParams.has('return'),false);assert.equal(location.searchParams.has('albumArtist'),false);assert.equal(nav.readArtistReturn(),null);
old.savedAt=Date.now()-25*60*60*1000;storage[prefix+key]=JSON.stringify(old);assert.equal(nav.readArtistReturn(key),null);
storage[prefix+key]='{bad json';assert.equal(nav.readArtistReturn(key),null);
for(let i=0;i<12;i++)nav.saveArtistReturn(saved);assert.equal(Object.keys(storage).length,8,'tab history is bounded');
const cancel=nav.restoreAlbumPosition(saved.catalog,saved.scrollY);tick(0);assert.equal(window.scrollY,1000);assert.equal(focus,1);assert.equal(window.history.scrollRestoration,'manual');
window.scrollY=0;cardY+=40;tick(100);assert.equal(window.scrollY,1040,'correct late browser resets and layout changes');
tick(800);assert.equal(window.history.scrollRestoration,'auto');assert.equal(frames.size,0);assert.equal([...events.values()].reduce((n,x)=>n+x.size,0),0);cancel();
nav.restoreAlbumPosition(saved.catalog,saved.scrollY);tick(1000);fire('wheel');window.scrollY=55;tick(1100);assert.equal(window.scrollY,55,'never fight user scrolling');assert.equal(frames.size,0);
available=false;window.scrollY=0;nav.restoreAlbumPosition(saved.catalog,saved.scrollY);tick(2000);assert.equal(window.scrollY,1000,'fallback while the card mounts');available=true;cardY=1400;tick(2100);assert.equal(window.scrollY,1220,'card anchor takes over once mounted');fire('pagehide');assert.equal(frames.size,0);assert.equal(window.history.scrollRestoration,'auto');
console.log('PASS: URL-backed restore, router-state loss, catalog/filter/order persistence, two-hour stay, bounded storage, invalid/expired records, safe Back, late layout, scroll cancellation and cleanup.');
