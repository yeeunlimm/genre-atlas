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

The playlist button now uses `components/liked-playlist.tsx`, not the station
queue. It independently fetches credits/samples, related artists and similar
songs from up to five recent likes, with concurrency two. It checks available
review scores before collection, filters strictly positive fresh evidence before
ranking/artist diversity, and records its own three-day repeat history per user
in this browser. It does not clear or consume the song discovery queue.

`scripts/analyze-youtube-reviews.mjs` performs local CPU inference with pinned
Transformers.js 3.8.1 and the quantized
`Xenova/twitter-roberta-base-sentiment-latest` model, revision
`f3ec4d0925f90c3ca7ee7814f52d6ee7cf180445`. This is a PRETRAINED English sentiment
model, not a model trained on this site's ratings. A conservative explicit music
evaluation rule filters text first; it is not a validated relevance classifier
or reliable language detector. Sarcasm, quoted lyrics and other Latin-script
languages can still be misclassified. Do not claim measured recommendation quality.

Actual local trial on 2026-10-07: verified SKELETONS audio `tAyYYKcySXA`, 196
deduplicated recent/relevant comments, 25 rule-eligible comments analysed;
17 positive / 4 neutral / 4 negative, mean P(positive)-P(negative) = 0.545446.
Model load plus authored positive/negative sanity checks: 6.032 s;
comment fetch plus inference: 0.949 s. This is one biased comment sample, not
a popularity measure or a 54.5% probability that a member likes the song.
Only aggregates were written to ignored `work/review-summaries.json`; no raw
comments, author details, comment IDs, API key or model weights enter Git.

Run locally after setting server-only `YOUTUBE_API_KEY` in the process environment:
`node scripts/analyze-youtube-reviews.mjs VERIFIED_VIDEO_ID "TITLE" "ARTIST"`.
The operator must verify the exact recording/video first. Optional
`REVIEW_SCORES_PATH` selects a private aggregate file, also read by the review
endpoint. Missing or older-than-24-hour data never passes. Model files cache in
the OS temporary folder (override with `SENTIMENT_MODEL_CACHE`).

Still missing: automatic official-video matching, broad candidate review
coverage, persistent server member playlists and daily scheduling/result delivery.
The local trial is NOT deployed production analysis. The production endpoint
remains disabled until the provider use case is confirmed and a fresh aggregate
store is supplied. The UI reports this explicitly rather than reusing the queue.
Existing likes remain browser-local. No approval flag has been set.

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

Tests: `node scripts/test-review-sentiment.cjs`,
`node scripts/test-liked-playlist.cjs`, `npm run build:vercel`.

Model sources: https://huggingface.co/cardiffnlp/twitter-roberta-base-sentiment-latest
and https://huggingface.co/Xenova/twitter-roberta-base-sentiment-latest .
