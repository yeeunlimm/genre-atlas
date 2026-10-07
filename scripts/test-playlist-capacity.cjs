const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const modules={};function load(name){if(modules[name])return modules[name];const m={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m.exports,p=>p.startsWith('./')?load(p.slice(2)):require(p),m);return modules[name]=m.exports;}
const p=load('station-profile'),fixture=load('station-catalog').stationCatalog[0];
const tracks=Array.from({length:59},(_,i)=>({...fixture,id:'test'+i,recordingId:'test'+i,title:'Song '+i}));
const result=tracks.reduce((list,t)=>p.addLiked(list,t),[]);
assert.equal(result.length,59);assert.equal(p.readProfile({liked:result},true).liked.length,59);
assert.equal(p.addLiked(result,tracks[0]).length,59);assert.equal(p.readProfile({liked:result},false).liked.length,0);
console.log('PASS: 59 songs survive additions and reload, duplicate-safe, guest isolation.');
