# Review-filtered playlists: implementation boundary

## Implemented, 2026-10-07

- `lib/youtube-review-comments.ts`: server-side Data API reader for a supplied,
  verified video ID. At most two requests (recent/relevant), up to 200 top-level
  comments before duplicate removal. No author details requested, no disk cache.
- `lib/review-sentiment.ts`: aggregate validated model probabilities using mean
  `P(positive) - P(negative)` for song-relevant comments; no evidence is null.
  Keep personalized candidate order and admit only fresh scores strictly > 0.
- Synthetic tests cover invalid/missing/expired/zero/negative evidence, duplicate
  comments and tracks, disabled comments, request budget and approval guard.
- A one-off authorized live lookup found the official SKELETONS audio and
  retrieved 20 top-level comments. Only status/count were reported. No live
  comments were analyzed, committed, or persisted.

## Not enabled / not implemented

These modules are **not connected to the public playlist button**. There is no
trained or deployed sentiment classifier, automatic official-video matching,
server-side member favorites/playlist persistence, or daily worker yet. Existing
likes remain browser-local and the current playlist button is unchanged.

Before production use, confirm the approved YouTube analytics use case and call
`assertYouTubeAnalysisApproved` before collection for sentiment analysis. Merely
setting the configuration flag does not constitute provider approval. Keep the
API key in server/worker secrets, never a NEXT_PUBLIC value. No credential is in
this implementation. Neither a paid inference service nor a schedule is enabled.

The analyzer must separately establish that a comment evaluates the song, not
the video's visuals, artist's appearance, copied lyrics, spam, or unrelated text.
Sentiment probabilities alone cannot establish relevance. Validate on labeled
music comments, including sarcasm and supported languages, before activation.
Track score, sample count, language/model version and source linkage together.

Daily work should share one analysis per verified recording/video across users,
not repeatedly analyze it per member. Build each member's candidates from saved
favorites first; review sentiment is a final eligibility gate, not their personal
preference model. Apply album/artist diversity rules after this gate. Return fewer
than 10 tracks when necessary. Use bounded resumable jobs, account ownership
checks and RLS; do not add one unbounded request that loops over every member.
Refreshing a score timestamp without fetching and analyzing evidence is invalid.

Sources:
- https://developers.google.com/youtube/v3/docs/commentThreads/list
- https://developers.google.com/youtube/terms/developer-policies
- https://developers.google.com/youtube/terms/derived-metrics-policy

Tests: `node scripts/test-review-sentiment.cjs`.
