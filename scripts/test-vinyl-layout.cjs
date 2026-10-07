const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('lib/vinyl-layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);
for(const n of [1,2,5,20,100]){
 const positions=Array.from({length:n},(_,i)=>m.exports.vinylPosition(i,n));
 assert.equal(new Set(positions.map(p=>p.tilt)).size,n);
 for(const p of positions){const rad=p.tilt*Math.PI/180;assert.ok(Math.abs(Math.sin(rad)-(p.x-50)/40)<1e-8);assert.ok(Math.abs(-Math.cos(rad)-(p.y-50)/40)<1e-8);assert.ok((p.x-50)*p.dx+(p.y-50)*p.dy>0);}
 assert.equal(new Set(positions.map(p=>p.x.toFixed(4)+','+p.y.toFixed(4))).size,n);
 for(const p of positions)assert.ok(Math.abs(Math.hypot(p.x-50,p.y-50)-40)<1e-8);
 if(n>1){assert.ok(Math.abs(positions.reduce((s,p)=>s+p.x,0)/n-50)<1e-8);assert.ok(Math.abs(positions.reduce((s,p)=>s+p.y,0)/n-50)<1e-8);}
}
console.log('PASS: 1/2/5/20/100 covers use equally spaced positions on the complete circle.');
const original=Array.from({length:59},(_,i)=>i),a=m.exports.shuffledVinyl(original,123),b=m.exports.shuffledVinyl(original,456);
assert.deepEqual([...a].sort((x,y)=>x-y),original);assert.notDeepEqual(a,original);assert.notDeepEqual(a,b);assert.deepEqual(a,m.exports.shuffledVinyl(original,123));
console.log('PASS: outward radial tilt/reveal, stable seeded shuffle with no missing or duplicate songs.');
