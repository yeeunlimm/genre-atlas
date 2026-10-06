// A deliberately bounded, source-checked catalog. No BPM or inferred audio features.
// Credits describe the listed release only; missing credits are not negative evidence.
export type CreditRole = "producer" | "mixing" | "mastering" | "songwriter" | "arranger";
export type Source = { label: string; url: string };
export type Credit = { person: string; name: string; role: CreditRole; source: Source; creditedAs?: string; scope?: "track" | "release" };
export type StationTrack = {
  id: string; recordingId: string; title: string; artist: string; artistId: string;
  primaryArtistName?: string;
  album: string; albumFamily: string; source: Source; checkedAt: string;
  genres: { name: string; scope: "track" | "album"; source: Source }[];
  credits: Credit[]; sampledArtists?: { artistId: string; name: string; source: Source }[];
  durationMs?: number; albumGroups?: string[]; catalogKind?: "apple" | "musicbrainz" | "deezer"; explicitness?: "explicit" | "cleaned" | "notExplicit";
  artworkUrl?: string; artworkReleaseId?: string;
};
const src = (label: string, url: string): Source => ({label, url});
const genie = src("Genie · official album credits", "https://www.genie.co.kr/detail/albumInfo?axnm=86563705");
const nate = src("Qobuz · for us credits", "https://www.qobuz.com/us-en/album/for-us-nate-sib/gnabn5y0ixtyc");
const star = src("Apple Music · star", "https://music.apple.com/us/album/star/1803726233");
const credit = (person: string, name: string, roles: CreditRole[], source: Source): Credit[] => roles.map(role => ({person, name, role, source}));
const kim = (source: Source) => credit("kimj", "kimj", ["songwriter", "arranger", "mixing", "mastering"], source);
function track(id: string, title: string, artist: string, album: string, albumFamily: string, source: Source, credits: Credit[], genre?: string, scope: "track" | "album" = "track"): StationTrack {
  return {id, recordingId: id, title, artist, artistId: artist.toLowerCase(), album, albumFamily, source, credits, checkedAt: "2026-09-30", genres: genre ? [{name: genre, scope, source}] : []};
}
const starTrack = (id: string, title: string, url: string) => {
  const s = src("Shazam · track credits", url);
  return track(id, title, "2hollis", "star", "2hollis-star", s, [
    ...credit("2hollis", "2hollis", ["producer", "songwriter"], s),
    ...credit("jonah-abraham", "Jonah Abraham", ["mixing"], s),
    ...credit("ojivolta", "Ojivolta", ["mastering"], s),
  ], "Pop");
};
const rosa = src("Shazam · Rosa credits", "https://www.shazam.com/song/1859906070/rosa");
const skeletons = src("Shazam · SKELETONS credits", "https://www.shazam.com/en-us/song/1421243024/skeletons");
const sundress = src("Shazam · Sundress credits", "https://www.shazam.com/en-us/song/1442955170/sundress");
const bandit = src("Apple Music · BANDIT credits", "https://music.apple.com/us/song/1754429229");
const newPerson = src("Shazam · track credits", "https://www.shazam.com/en-us/song/1440838708/new-person-same-old-mistakes");
const houdini = src("Shazam · Houdini credits", "https://www.shazam.com/song/1734980420/houdini");
export const stationCatalog: StationTrack[] = [
  ...[["makgeolli-banger", "MAKGEOLLI BANGER"], ["more-hyper", "MORE HYPER"], ["thankie-thankie", "thankie thankie"]].map(([id,title]) =>
    track(id,title,"Effie","pullup to busan 4 morE hypEr summEr it's gonna bE a fuckin moviE","effie-pullup-to-busan",genie,kim(genie))),
  ...["go", "secret", "tonight", "colors", "only1"].map(title => track("nate-"+title,title,"Nate Sib","for us","nate-for-us",nate,credit("kimj","kimj",["producer","mixing","mastering"],nate),"Pop","album")),
  track("back-and-forth","back & forth","Nate Sib & 2hollis","for us","nate-for-us",nate,credit("2hollis","2hollis",["producer","mixing","mastering"],nate),"Pop","album"),
  (() => { const s=src("Apple Music · destroy me credits","https://music.apple.com/us/song/1803726248"); return track("destroy-me","destroy me","2hollis","star","2hollis-star",s,[
    ...credit("2hollis","2hollis",["producer","songwriter"],s), ...credit("jonah-abraham","Jonah Abraham",["mixing"],s), ...credit("ojivolta","Ojivolta",["mixing","mastering"],s)
  ]); })(),
  starTrack("girl","girl","https://www.shazam.com/song/1803726250/girl"),
  starTrack("sidekick","sidekick","https://www.shazam.com/song/1803726258/sidekick"),
  starTrack("burn","burn","https://www.shazam.com/song/1803726249/burn/music-video"),
  track("rosa","Rosa","rommulas","Animál","rommulas-animal",rosa,[
    ...credit("jonah-abraham","Jonah Abraham",["producer","songwriter"],rosa),
    ...credit("elias-zavitsanos","Elias Zavitsanos",["producer","songwriter"],rosa)
  ],"Hip-Hop/Rap"),
  track("skeletons","SKELETONS","Travis Scott","ASTROWORLD","travis-astroworld",skeletons,[
    {...credit("kevin-parker","Kevin Parker",["producer"],skeletons)[0],creditedAs:"Tame Impala"},
    ...credit("kevin-parker","Kevin Parker",["songwriter"],skeletons),
    ...credit("mike-dean","MIKE DEAN",["mixing","mastering"],skeletons)
  ],"Hip-Hop/Rap"),
  track("sundress","Sundress","A$AP Rocky","Sundress - Single","asap-sundress",sundress,[
    ...credit("kevin-parker","Kevin Parker",["songwriter"],sundress), ...credit("danger-mouse","Danger Mouse",["producer"],sundress),
    ...credit("syk-sense","Syk Sense",["producer"],sundress), ...credit("tatsuya-sato","Tatsuya Sato",["mastering"],sundress)
  ],"Hip-Hop/Rap"),
  {...track("bandit","BANDIT","Don Toliver","HARDSTONE PSYCHO","don-hardstone-psycho",bandit,[
    ...credit("kevin-parker","Kevin Parker",["songwriter"],bandit), ...credit("joe-laporta","Joe LaPorta",["mastering"],bandit)
  ]),sampledArtists:[{artistId:"tame impala",name:"Tame Impala",source:bandit}]},
  track("new-person","New Person, Same Old Mistakes","Tame Impala","Currents","tame-currents",newPerson,[
    ...credit("kevin-parker","Kevin Parker",["producer","songwriter"],newPerson), ...credit("greg-calbi","Greg Calbi",["mastering"],newPerson)
  ],"Alternative"),
  track("houdini","Houdini","Dua Lipa","Radical Optimism","dua-radical-optimism",houdini,[
    ...credit("kevin-parker","Kevin Parker",["producer","songwriter"],houdini),
    ...credit("danny-harle","Danny L Harle",["producer","songwriter"],houdini),
    ...credit("josh-gudwin","Josh Gudwin",["mixing"],houdini), ...credit("chris-gehringer","Chris Gehringer",["mastering"],houdini)
  ],"Pop")
];
export const stationNotes = {starSource: star, checkedAt: "2026-09-30"};
