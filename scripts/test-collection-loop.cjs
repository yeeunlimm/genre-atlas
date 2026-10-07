const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};
new Function('exports','module',ts.transpileModule(fs.readFileSync('lib/collection-loop.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);
const {wrapAlbumIndex:wrap,loopScrollTop:loop}=m.exports;
for(const [index,expected] of [[0,0],[28,0],[-1,27],[57,1],[-57,27]])assert.equal(wrap(index,28),expected);
assert.equal(wrap(3,0),0);
for(const [top,expected] of [[99,199],[100,100],[199,199],[200,100],[0,100],[-3,197],[301,101]])assert.equal(loop(top,100),expected);
for(const span of [50,100,1980.5])for(let top=-6000;top<6000;top+=37.25){
 const actual=loop(top,span);
 assert.ok(actual>=span&&actual<2*span);
 assert.ok(Math.abs((actual-top)/span-Math.round((actual-top)/span))<1e-9,'Visible scroll phase is preserved');
}
assert.equal(loop(100,0),0);assert.equal(loop(NaN,100),0);assert.equal(loop(100,Infinity),0);
const source=fs.readFileSync('components/album-wall.tsx','utf8');
assert.ok(!source.includes('setInterval'),'Shelf only moves through user interaction');
console.log('PASS collection wraps both ways, keeps fractional scroll position, validates spans and has no autoplay.');
