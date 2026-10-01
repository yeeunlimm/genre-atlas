import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import ts from "typescript";
import {parseDocument} from "../lib/namu.ts";

// Transpile the server module for Node without altering the app's bundler imports.
const source=await readFile(new URL("../lib/genre-discovery.ts",import.meta.url),"utf8");
const code=ts.transpileModule(source.replace('"./namu"',JSON.stringify(new URL("../lib/namu.ts",import.meta.url).href)).replace('"./english-display"',JSON.stringify(new URL("../lib/english-display.ts",import.meta.url).href)),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {verifyGenreArtist,discoverGenre}=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
const link=(title)=>'<a class="wiki-link-internal" href="/w/'+encodeURIComponent(title)+'">'+title+'</a>';
const page=(title,body)=>'<html><head><title>'+title+' - 나무위키</title></head><body>'+body+'</body></html>';
const bio=(name,genre)=>page(name,'<table><tr><td>본명</td><td>'+name+'</td></tr><tr><td>장르</td><td>'+link(genre)+'</td></tr></table>');
const wrapped=page("Fixture genre",'<div><h2>1. 개요</h2></div><div class="wiki-paragraph">'+link("City")+'</div><div><h2>2. 대표 뮤지션</h2></div><ul><li>'+link("Artist A")+'<ul><li>'+link("Artist B")+'</li></ul></li></ul><div><h2>3. 역사</h2></div><div class="wiki-paragraph">'+link("Not an artist")+'</div>');
assert.deepEqual(parseDocument(wrapped,"Fixture genre","genre").artists.map(a=>[a.title,a.evidence]),[["Artist A","list"],["Artist B","list"]]);
assert.equal(parseDocument(page("Directory",link("분류:가수")),"Directory","artist").isMusician,false);
assert.equal(parseDocument(bio("Album","Rock").replace("본명","발매일"),"Album","artist").isMusician,false);
assert.equal(parseDocument(bio("Artist","Rock"),"Artist","artist").isMusician,true);
const candidate={name:"Artist",title:"Artist",sourceTitle:"Rock",evidence:"tag"};
const doc={name:"Artist",title:"Artist",isMusician:true,genres:[{title:"Rock",name:"Rock"}],stars:null,checkedAt:"2026-09-21"};
for(const [english,korean] of [["2Pac","투팍 샤커"],["50 Cent","50 센트"],["Ace Hood","에이스 후드"]]){
 const result=verifyGenreArtist({...candidate,name:english,evidence:"list"},{...doc,name:korean,title:korean,englishName:null},["Rock"]);
 assert.equal(result.name,english);assert.equal(result.title,korean);
}
assert.equal(verifyGenreArtist(candidate,doc,["Jazz"]),null);
assert.equal(verifyGenreArtist(candidate,doc,["Rock"]).stars,null);
assert.equal(verifyGenreArtist({...candidate,evidence:"list"},doc,["Jazz"]).title,"Artist");
assert.equal(verifyGenreArtist({...candidate,evidence:"list"},{...doc,isMusician:false},["Rock"]),null);

const fixtures=new Map();
fixtures.set("Fixture independent genre",page("Fixture independent genre",'<div><h2>개요</h2></div><div class="wiki-paragraph">'+link("Fixture independent genre/뮤지션")+'</div>'));
fixtures.set("Fixture independent genre/뮤지션",page("Fixture independent genre/뮤지션",'<ul>'+Array.from({length:22},(_,i)=>'<li>'+link("Fixture artist "+i)+'</li>').join("")+'</ul>'));
for(let i=0;i<22;i++)fixtures.set("Fixture artist "+i,bio("Fixture artist "+i,"Fixture independent genre"));
fixtures.set("Fixture southern",page("Fixture southern",'<h2>개요</h2><div class="wiki-paragraph">'+link("Fixture alias artist")+link("Fixture unrelated")+link("Fixture city")+'</div>'));
fixtures.set("Fixture alias artist",bio("Fixture alias artist","Fixture alias"));
fixtures.set("Fixture alias",page("Fixture southern","Genre alias resolved"));
fixtures.set("Fixture unrelated",bio("Fixture unrelated","Fixture other"));
fixtures.set("Fixture other",page("Fixture other","Other genre"));
fixtures.set("Fixture city",page("Fixture city","A city, not a musician"));
const requests=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=async input=>{
 const url=new URL(input);requests.push(url.href);
 assert.equal(url.origin,"https://namu.wiki","Genre discovery must never use the related artist provider");
 const html=fixtures.get(decodeURIComponent(url.pathname.slice(3)));
 assert.ok(html,"Unexpected fixture request: "+url.href);
 return new Response(html,{headers:{"Content-Type":"text/html"}});
};
try{
 const first=await discoverGenre("Fixture independent genre");
 assert.equal(first.artists.length,20);
 assert.equal(first.nextOffset,20);
 const second=await discoverGenre("Fixture independent genre",first.nextOffset);
 assert.equal(second.artists.length,2);
 assert.equal(second.nextOffset,null);
 assert.equal(new Set([...first.artists,...second.artists].map(a=>a.id)).size,22);
 const alias=await discoverGenre("Fixture southern");
 assert.deepEqual(alias.artists.map(a=>a.title),["Fixture alias artist"]);
 assert.equal(alias.excluded,2);
 assert.equal(alias.unavailable,0);
 await assert.rejects(discoverGenre("Fixture southern",-1),/Invalid/);
 assert.ok(requests.length>22);
}finally{globalThis.fetch=originalFetch;}
console.log("PASS: wrapped genre headings, musician validation, evidence rules, independent source, pagination, alias resolution, exclusion, invalid offset.");
