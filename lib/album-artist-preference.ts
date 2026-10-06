type Artist={id:string;name:string};
type Choice={sourceId:string;name:string;deezerId:string;savedAt:number};
const KEY="genre-atlas:album-artist:v1",TTL=30*24*60*60*1000;
const norm=(s:string)=>s.trim().toLowerCase();
function read():Choice[]{
 try{const rows=JSON.parse(localStorage.getItem(KEY)||"[]");return Array.isArray(rows)?rows.filter((r:any)=>r&&typeof r.sourceId==="string"&&typeof r.name==="string"&&/^[1-9]\d{0,15}$/.test(r.deezerId)&&Number.isFinite(r.savedAt)&&r.savedAt<=Date.now()&&Date.now()-r.savedAt<TTL).slice(-50):[];}catch{return [];}
}
// Device-local picker preference only; not an authoritative cross-service ID registry.
export function preferredAlbumArtist(artist:Artist){return read().find(r=>r.sourceId===artist.id&&norm(r.name)===norm(artist.name))?.deezerId||"";}
export function rememberAlbumArtist(artist:Artist,deezerId:string){
 if(!/^[1-9]\d{0,15}$/.test(deezerId))return;
 try{const rows=read().filter(r=>r.sourceId!==artist.id);rows.push({sourceId:artist.id,name:artist.name,deezerId,savedAt:Date.now()});localStorage.setItem(KEY,JSON.stringify(rows.slice(-50)));}catch{/* Catalog browsing works even when browser storage is unavailable. */}
}
export function forgetAlbumArtist(artist:Artist){try{localStorage.setItem(KEY,JSON.stringify(read().filter(r=>r.sourceId!==artist.id)));}catch{}}
