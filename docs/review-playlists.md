# Review-filtered playlists: implementation boundary

## Current flow: 20 candidates → comment filter → at most 10 (2026-10-07)

- Rank independent candidates from the five latest likes FIRST, excluding liked
  recordings/albums, dislikes, repeat history and duplicate artists. Freeze at
  most 20 candidates. No discovery queue or station selection is reused.
- Candidate collection reports completed sources and shares a 90-second client
  request budget; failing/timed-out sources do not discard successful results.
- Only those candidates are sent to `/api/station/reviews`. The authenticated,
  same-origin POST accepts 1–20 distinct tracks and streams a result per track.
- For each track, search at most five music videos, fetch their metadata and
  conservatively match song, artist channel, version and duration. This is a
  metadata heuristic, not proof of official channel ownership. Ambiguous matches
  abstain. Unmatched versions, disabled comments and missing evidence never pass.
- Fetch up to 200 recent/relevant top-level comments, deduplicate, apply the
  existing English music-evaluation rules and analyse at most 40 eligible comments
  with the pinned pretrained model. Raw comments stay in server memory only.
- After all candidates are checked, retain scores strictly >0 in personalized
  recommendation order and select at most 10. Return fewer when necessary, with
  per-candidate scores/sample counts/source links and explicit exclusion reasons.
- The client supports cancellation and ignores stale work after an account/likes
  change. A truncated stream never produces a final playlist or saves repeats.
- A 24-hour warm-process score cache avoids repeat inference when available. It
  is NOT durable storage, a daily schedule, or a guarantee across server instances.
  Negative/no-evidence lookup results cache for one hour. No raw comments persist.
- Each batch is serial, capped at 20 tracks, with a 235-second work deadline and
  300-second server duration. At most one batch runs per warm process; a one-minute
  per-account throttle also applies in that process. These are NOT distributed
  quota limits. Production growth needs a shared job queue/quota counter.

The endpoint no longer reads `work/review-summaries.json` or requires a previously
prepared local batch. Transformers.js is a pinned production dependency; Next's
file tracing explicitly includes the ONNX CPU shared libraries. Model weights are
loaded into temporary cache at runtime, not shipped to the browser or Git.

### Activation and verification boundary

Candidate preview works independently of comment-analysis availability. The
comment stage requires both server-only `YOUTUBE_API_KEY` and
`YOUTUBE_DERIVED_METRICS_APPROVED=true`. **The flag does not accept terms or confer
provider approval.** Do not set it without confirming the use case/required terms:
https://developers.google.com/youtube/terms/derived-metrics-policy . No approval or
key setting was changed during this implementation.

Tests cover 30 pooled candidates → 20 shortlisted → 20 synthetic comment analyses
→ 10 positive tracks, fewer-than-ten, source matching, guards, throttling,
cancellation, account boundaries, stream truncation and unmodified discovery.
The actual pretrained model was also run on authored positive/negative sentences.
These are NOT live YouTube-comment results or proof of production inference.
No new YouTube comment analysis was run while the terms confirmation is pending.
Daily scheduling and persistent member playlists remain outside this change.

Tests: `node scripts/test-playlist-review-flow.cjs`,
`node scripts/test-review-api.cjs`, `node scripts/test-liked-playlist.cjs`,
`node scripts/test-review-sentiment.cjs`, `node scripts/test-kakao-auth.cjs`.

## Earlier implementation and local experiments (historical)

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

## Additional local batch, 2026-10-07

Verified official channels/titles/descriptions with YouTube Data API before
running the same model and rules. These are sampled English-text scores, not
measured listener preference or manually validated song-review labels.

| Recording / verified video | Comments fetched | Rule-eligible analysed | Positive / neutral / negative | Mean score |
| --- | ---: | ---: | --- | ---: |
| A$AP Rocky — Sundress / Ec3LoKpGJxY | 196 | 24 | 19 / 3 / 2 | 0.631195 |
| Tame Impala — The Less I Know The Better / 2SUwOgmvzK4 | 194 | 24 | 19 / 2 / 3 | 0.591727 |
| Radiohead — Creep / XFkzRNyygfk | 191 | 31 | 22 / 3 / 6 | 0.535525 |
| PinkPantheress — Boy's a liar (not Pt. 2) / U_hj-wT3biU | 189 | 24 | 20 / 3 / 1 | 0.766683 |

770 deduplicated comments fetched across four videos; 103 passed the explicit
evaluation rules. Four sequential runs took about 8.2 seconds including process
startup, using already downloaded model weights. Aggregate store now has five
recordings including the preceding SKELETONS trial; raw text remains unsaved.

Sentiment is exclusive to **Make a 10-track playlist**. Empty likes produce no
candidate requests and no playlist, even if positive-scored candidates are passed
directly to selection. Standard song discovery is unaffected and needs no likes.
Regression tests cover both empty-like layers and sentiment import isolation.
This batch does not enable production automation or remove its existing guard.
