const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const m={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('lib/vinyl-layout.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(m.exports,m);
for(const n of [1,2,5,20,100]){
 const positions=Array.from({length:n},(_,i)=>m.exports.vinylPosition(i,n));
 assert.equal(new Set(positions.map(p=>p.x.toFixed(4)+','+p.y.toFixed(4))).size,n);
 for(const p of positions)assert.ok(Math.abs(Math.hypot(p.x-50,p.y-50)-36)<1e-8);
 if(n>1){assert.ok(Math.abs(positions.reduce((s,p)=>s+p.x,0)/n-50)<1e-8);assert.ok(Math.abs(positions.reduce((s,p)=>s+p.y,0)/n-50)<1e-8);}
}
console.log('PASS: 1/2/5/20/100 covers use equally spaced positions on the complete circle.');
