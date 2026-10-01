import assert from "node:assert/strict";
import {parseDocument,validTitle} from "../lib/namu.ts";
const artist='<title>테스트 가수 - 나무위키</title><a href="/member/star/test" count="42"></a><table><tr><td>장르</td><td><a class="wiki-link-internal" href="/w/rock">록</a></td></tr><tr><td>데뷔</td><td>2000</td></tr></table>';
const parsed=parseDocument(artist,"test","artist");
assert.equal(parsed.stars,42);assert.equal(parsed.isMusician,true);assert.equal(parsed.genres[0].title,"rock");
const album=artist.replace("데뷔","발매일");
assert.equal(parseDocument(album,"album","artist").isMusician,false,"Albums must not be recommended as artists");
assert.equal(parseDocument(artist.replace(' count="42"',''),"test","artist").stars,null,"Missing counts must not become zero");
assert.throws(()=>validTitle(""),/1~100/);
assert.throws(()=>validTitle("x".repeat(101)),/1~100/);
const bad='<title>Just a moment...</title>';
assert.throws(()=>parseDocument(bad,"x","artist"),/자동 접근/);
const r=await fetch("http://127.0.0.1:3108/api/namu?kind=wrong&title=x");
assert.equal(r.status,400);
console.log("PASS: genre extraction, metric, album exclusion, missing metric, input validation, blocked page, invalid API kind.");

