// Use ordinary YouTube search for every artist, including wiki-only artists
// without a verified YouTube channel ID. No YouTube Music sign-in dependency.
export const youtubeSearchUrl=(artist:string)=>"https://www.youtube.com/results?search_query="+encodeURIComponent(artist.trim()+" music");
