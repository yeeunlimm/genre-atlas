// Per-provider limits are separate from the whole artist lookup budget.
export const YOUTUBE_TIMEOUT_MS = 15_000;
// Leave time for Deezer search + artist/related fallback after a slow YouTube call.
export const ARTIST_REQUEST_TIMEOUT_MS = 30_000;
export const ARTIST_CLIENT_TIMEOUT_MS = 32_000;
