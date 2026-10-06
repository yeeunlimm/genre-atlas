import collection from "./album-collection.json";
import type {AlbumArtwork} from "./youtube-music";

type ArtistAlbums={name:string;albumArtwork?:AlbumArtwork;albumArtworks?:AlbumArtwork[]};
const normalize=(s:string)=>s.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/g,"");
const artistKey=(s:string)=>["ye","kanyewest"].includes(normalize(s))?"kanyewest":normalize(s);
export function cassetteAlbums(artist?:ArtistAlbums|null):AlbumArtwork[]{
 // Before a search, show a sample from the existing collection. After selection,
 // never substitute a different artist's artwork when album data is unavailable.
 const covers=[...collection.albums,...collection.rightColumn];
 const curated=artist?covers.filter(a=>artistKey(a.artist)===artistKey(artist.name)):covers.slice(0,4);
 const candidates=artist?[...(artist.albumArtworks||[]),...(artist.albumArtwork?[artist.albumArtwork]:[]),...curated]:curated;
 const seen=new Set<string>();
 return candidates.filter(album=>{
  const key=album.title.normalize("NFKC").toLowerCase().replace(/\s+/g," ").trim();
  if(!key||seen.has(key))return false;
  seen.add(key);return true;
 }).slice(0,2);
}
