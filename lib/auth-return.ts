export const AUTH_RETURN_KEY="genre-atlas:auth-return";
// Only the home/discovery screen is an allowed return destination.
export function safeAuthReturn(value:unknown):string {
  if(typeof value!=="string"||value.length>400||/[\\\r\n]/.test(value))return "/";
  try{
    const url=new URL(value,"https://genre-atlas.invalid");
    if(!value.startsWith("/")||url.origin!=="https://genre-atlas.invalid"||url.pathname!=="/")return "/";
    const id=url.searchParams.get("stationTrack");
    const query=id&&/^[a-zA-Z0-9:-]{1,80}$/.test(id)?"?stationTrack="+encodeURIComponent(id):"";
    return "/"+query+(url.hash==="#discovery-station"?url.hash:"");
  }catch{return "/";}
}
