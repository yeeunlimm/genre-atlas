import assert from "node:assert/strict";
import {parseDocument} from "../lib/namu.ts";
import {parseArtist} from "../lib/youtube-music.ts";
import {youtubeSearchUrl} from "../lib/listen-link.ts";
import {englishText,hasKorean} from "../lib/english-display.ts";
for(const raw of ["새로운 가수","한글 앨범 (Live)","ㄱㅏ", "50 센트", "에이스 후드", "장르명"]){
 assert.equal(hasKorean(englishText(raw)),false,raw);
 assert.ok(englishText(raw).length>0);
}
assert.equal(englishText("A$AP Rocky"),"A$AP Rocky");
assert.equal(englishText("Beyoncé"),"Beyoncé");
const profile=(heading)=>'<title>테스트 밴드 - 나무위키</title><table><tr><td colspan="2"><div class="wiki-paragraph">'+heading+'</div></td></tr><tr><td>장르</td><td><a class="wiki-link-internal" href="/w/Rock">Rock</a></td></tr><tr><td>결성</td><td>2000</td></tr></table>';
for(const heading of ["테스트 밴드<br>Test Band","Test Band<br>테스트 밴드"]){
 const doc=parseDocument(profile(heading),"테스트 밴드","artist");
 assert.equal(doc.name,"Test Band");assert.equal(doc.title,"테스트 밴드");
}
assert.equal(parseDocument(profile("테스트 밴드"),"테스트 밴드","artist").name,"테스트 밴드");
const url=new URL(youtubeSearchUrl("A$AP Rocky & Friends"));
assert.equal(url.origin,"https://www.youtube.com");
assert.equal(url.searchParams.get("search_query"),"A$AP Rocky & Friends music");
const albumRow={
 title:{runs:[{text:"An Album"}]},
 navigationEndpoint:{browseEndpoint:{browseEndpointContextSupportedConfigs:{browseEndpointContextMusicConfig:{pageType:"MUSIC_PAGE_TYPE_ALBUM"}}}},
 thumbnailRenderer:{musicThumbnailRenderer:{thumbnail:{thumbnails:[{url:"https://yt3.googleusercontent.com/fixture",width:544}]}}}
};
const data={header:{musicImmersiveHeaderRenderer:{title:{runs:[{text:"Test Band"}]}}},contents:[{musicCarouselShelfRenderer:{header:{musicCarouselShelfBasicHeaderRenderer:{title:{runs:[{text:"Albums"}]}}},contents:[{musicTwoRowItemRenderer:albumRow}]}}]};
assert.equal(parseArtist(data,"UCabcdefghijklmnopqrstuv").artist.albumArtwork.title,"An Album");
data.contents[0].musicCarouselShelfRenderer.contents[0].musicTwoRowItemRenderer.thumbnailRenderer.musicThumbnailRenderer.thumbnail.thumbnails[0].url="https://untrusted.example/image";
assert.equal(parseArtist(data,"UCabcdefghijklmnopqrstuv").artist.albumArtwork,undefined);
console.log("PASS: bilingual names, source identity, name fallback, YouTube search encoding, album artwork and image host validation.");
