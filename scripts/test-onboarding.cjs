const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
const mod={exports:{}};
const code=ts.transpileModule(fs.readFileSync('lib/onboarding.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
new Function('exports','module',code)(mod.exports,mod);
const {shouldShowOnboarding,ONBOARDING_KEY}=mod.exports;
assert.equal(shouldShowOnboarding(new URL('https://example.com/'),false),true);
assert.equal(shouldShowOnboarding(new URL('https://example.com/'),true),false);
for(const path of ['/#liked-songs','/#artist-discover','/#discovery-station','/?stationTrack=itunes:1','/?songQuery=hello','/?albumArtist=Blur','/?code=private','/auth/callback','/album?id=1']){
 assert.equal(shouldShowOnboarding(new URL(path,'https://example.com'),false),false,path);
}
assert.equal(ONBOARDING_KEY,'genre-atlas:welcome:v1');
console.log('PASS: first-visit policy, dismissal, deep-link/auth/album exclusions.');
