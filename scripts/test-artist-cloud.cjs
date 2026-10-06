const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};
function load(name){if(modules[name])return modules[name];const code=ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const m={exports:{}};modules[name]=m.exports;new Function('exports','require','module',code)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return m.exports;}
const cloud=load('artist-discovery'),net=load('music-request'),client=load('youtube-client'),yt=load('youtube-music');
const id='UC'+'a'.repeat(22),peer='UC'+'b'.repeat(22);
const endpoint=browseId=>({browseId,browseEndpointContextSupportedConfigs:{browseEndpointContextMusicConfig:{pageType:'MUSIC_PAGE_TYPE_ARTIST'}}});
const row={navigationEndpoint:{browseEndpoint:endpoint(peer)},title:{runs:[{text:'Peer'}]},subtitle:{runs:[{text:'1.2M monthly audience'}]}};
const fixture={header:{musicImmersiveHeaderRenderer:{title:{runs:[{text:'Seed'}]}}},contents:[{musicCarouselShelfRenderer:{header:{musicCarouselShelfBasicHeaderRenderer:{title:{runs:[{text:'Fans might also like'}]}}},contents:[{musicTwoRowItemRenderer:row},{musicTwoRowItemRenderer:row}]}}]};
async function main(){
 assert.deepEqual(client.parseClientConfig('ytcfg.set({"VISITOR_DATA":"anonymous-fixture","INNERTUBE_CONTEXT":{"client":{"clientVersion":"1.20261006.01.00"}}});'),{visitorData:'anonymous-fixture',clientVersion:'1.20261006.01.00'});
 assert.deepEqual(client.parseClientConfig('ytcfg.set('+JSON.stringify({VISITOR_DATA:'bad\nheader',INNERTUBE_CLIENT_VERSION:'bad'})+');'),{});
 assert.deepEqual(client.parseClientConfig('ytcfg.set(notJavaScript());'),{});
 const calls=[];let failure=false,empty=false;
 global.fetch=async(input,init)=>{
  const url=new URL(input);assert.equal(url.hostname,'music.youtube.com','never request Deezer on the artist path');calls.push({url,init});
  assert.equal(init.headers.Authorization,undefined);assert.equal(init.headers.Cookie,undefined);
  if(url.pathname==='/'){assert.equal(init.redirect,'manual','Worker-compatible redirect mode');return new Response('ytcfg.set({"VISITOR_DATA":"anonymous-fixture","INNERTUBE_CLIENT_VERSION":"1.20261006.01.00"});');}
  assert.equal(init.headers['X-Goog-Visitor-Id'],'anonymous-fixture');assert.equal(init.headers.Origin,'https://music.youtube.com');
  assert.equal(url.searchParams.get('alt'),'json');
  const body=JSON.parse(init.body);assert.equal(body.context.client.clientVersion,'1.20261006.01.00');assert.equal(body.context.client.hl,'en');
  if(failure)return new Response('',{status:403});
  if(url.pathname.endsWith('/search'))return Response.json({items:empty?[]:[{musicResponsiveListItemRenderer:row}]});
  return Response.json(empty?{...fixture,contents:[]}:fixture);
 };
 const result=await net.musicRequest(()=>cloud.artistDiscovery('artist',id,'Seed'));
 assert.equal(result.provider,'YouTube Music');assert.equal(result.state,'ready');assert.equal(result.related.length,1);assert.equal(result.related[0].audience,1200000);assert.equal(result.artist.audience,null);
 const firstCalls=calls.length;await net.musicRequest(()=>cloud.artistDiscovery('artist',id,'Seed'));assert.equal(calls.length,firstCalls,'completed results are cached');
 const search=await net.musicRequest(()=>cloud.artistDiscovery('search','Peer'));
 assert.equal(search.artists[0].id,peer);assert.equal(calls.filter(c=>c.url.pathname==='/').length,1,'reuse only completed anonymous config');
 empty=true;
 assert.equal((await net.musicRequest(()=>cloud.artistDiscovery('search','Unknown'))).state,'empty');
 assert.equal((await net.musicRequest(()=>cloud.artistDiscovery('artist',peer,'Peer'))).state,'empty');
 failure=true;const beforeFailure=calls.length;
 await assert.rejects(()=>net.musicRequest(()=>cloud.artistDiscovery('search','Denied')),/HTTP 403/);
 assert.equal(calls.length,beforeFailure+1,'no retry or provider switch after 403');
 await assert.rejects(()=>net.musicRequest(()=>cloud.artistDiscovery('search','Denied')),/HTTP 403/);
 assert.equal(calls.length,beforeFailure+2,'failed responses are not cached as results');
 await assert.rejects(()=>cloud.artistDiscovery('artist','deezer:10'),/Invalid artist/);
 await assert.rejects(()=>cloud.artistDiscovery('artist','https://example.com'),/Invalid artist/);
 assert.equal(yt.parseCount('263M monthly audience'),263000000);assert.equal(yt.parseCount('Unavailable'),null);
 const limits=load('music-timeouts');assert(limits.ARTIST_REQUEST_TIMEOUT_MS>=limits.YOUTUBE_TIMEOUT_MS+5000);assert(limits.ARTIST_CLIENT_TIMEOUT_MS>limits.ARTIST_REQUEST_TIMEOUT_MS);
 console.log('PASS: anonymous setup, request shape, config validation, dedup, cache, empty vs 403, no retries or Deezer switch.');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
