# Review-filtered playlists: implementation boundary

## Current flow: 20 candidates → positives first, no-comment zeros next → at most 10 (2026-10-07)

- Check server comment-analysis readiness before fetching candidates. If it is
  unavailable, report the reason immediately without collecting candidates,
  creating a playlist, or changing likes/repeat history.
- Rank independent candidates from the five latest likes FIRST, excluding liked
  recordings/albums, dislikes, repeat history and duplicate artists. Freeze at
  most 20 candidates. No discovery queue or station selection is reused.
- Candidate collection reports completed sources and shares a 90-second client
  request budget; failing/timed-out sources do not discard successful results.
- Only those candidates are sent to `/api/station/reviews`. The authenticated,
  same-origin POST accepts 1–20 distinct tracks and streams a result per track.
- For each track, search up to five music videos per query, fetch metadata and
  conservatively match song, artist channel, version and duration. This is a
  metadata heuristic, not proof of official channel ownership. Ambiguous matches
  abstain. If comments are disabled, absent or the video is unavailable, try
  another matching video, with at most three distinct comment lookups per track.
  One narrow alternative official-video search is allowed after the initial
  official-audio matches are exhausted. Wrong versions never enter this fallback.
  Quota failures and cancellation stop work; these are not video-specific errors.
  A usable comment batch ends the retry loop, even if its sentiment is negative
  or no comments satisfy the review rules: never search for a higher score.
- Fetch at most 50 relevance-ordered top-level comments in one request per video.
  Deduplicate and never fetch another page to fill short/duplicate results.
  Unsupported/unrelated comments abstain; fewer than 50 usable comments is valid.
  English music evaluations use the pinned pretrained model; Korean evaluations
  can use the optional user dictionary and explicit music-context rules.
  Raw comments stay in server memory only. Then proceed to the next candidate.
- After all candidates are checked, retain measured scores strictly >0 and sort by
  sentiment score descending. Only when every strictly matched video checked
  (up to three, not every video on YouTube) has comments disabled or empty,
  permit a separate `selectionFallback` with selection score 0. This is not a
  measured neutral score: no summary or analysis sample is fabricated. Positive
  measured scores precede these fallback songs; fallback eligibility expires in
  one hour. No match, missing video, quota/network/model error, unsupported or
  irrelevant comments, measured neutral and negative scores remain excluded.
  Preference score is only a tie-breaker; preserve
  one song per artist and select at most 10. Return fewer when necessary, with
  per-candidate scores/sample counts/source links and explicit exclusion reasons.
  Both candidate and selected-song lists label the exception as not analysed.
- The client supports cancellation and ignores stale work after an account/likes
  change. A truncated stream never produces a final playlist or saves repeats.
- A 24-hour warm-process score cache avoids repeat inference when available. It
  is NOT durable storage, a daily schedule, or a guarantee across server instances.
  Ready scores (including zero/negative) cache for 24 hours; no-match/no-evidence
  lookup results cache for one hour. Expired entries are removed on a later cache
  insertion, not by an immediate deletion timer. No raw comments persist.
- Each batch is serial, capped at 20 tracks, with a 235-second work deadline and
  300-second server duration. At most one batch runs per warm process; a one-minute
  per-account throttle also applies in that process. These are NOT distributed
  quota limits. Production growth needs a shared job queue/quota counter.

The endpoint no longer reads `work/review-summaries.json` or requires a previously
prepared local batch. Transformers.js is a pinned production dependency; Next's
file tracing explicitly includes the ONNX CPU shared libraries. Model weights are
loaded into temporary cache at runtime, not shipped to the browser or Git.

### Activation and verification boundary

The build action checks technical availability before candidate collection. The
comment stage requires a non-empty server-only `YOUTUBE_API_KEY`. At the user's
request, the manually added `YOUTUBE_DERIVED_METRICS_APPROVED` runtime gate was
removed; missing/false legacy values no longer disable analysis. Nothing is set
to claim provider approval. The key is never returned to the browser.

This is a technical configuration change, not a determination of permission to
use YouTube data. The provider's applicable terms still apply, including
https://developers.google.com/youtube/terms/derived-metrics-policy . This local
project change does not submit an application, accept terms or establish an
approval. Production also needs its own server-only key; local success does not
by itself verify the deployed server's collection or inference.
Authentication, same-origin validation, batch bounds, throttling and cancellation
remain enforced by the web endpoint.

Tests cover 40 pooled candidates → 20 shortlisted → 20 synthetic comment analyses
→ the 10 highest positive scores, fewer-than-ten, source matching, guards, throttling,
cancellation, account boundaries, stream truncation and unmodified discovery.
The actual pretrained model was also run on authored positive/negative sentences.
Those synthetic checks are NOT proof of production inference. A separate local
live run on 2026-10-07 used the supplied notebook key (process environment only):
SKELETONS / tAyYYKcySXA returned 195 deduplicated comments, 24 eligible English
music evaluations, 17 positive / 3 neutral / 4 negative, mean score +0.555466.
Only aggregate results were saved under ignored `work/review-live-*.json`.
This proves that example's local collection/inference, not member-account or
deployed-server playlist generation, nor measured recommendation quality.
Daily scheduling and persistent member playlists remain outside this change.

### Optional Korean dictionary (local project)

Set server-only `SENTIMENT_LEXICON_PATH` to the supplied `SentiWord_info_updated.json`.
The original file is read, not edited or copied into Git. Without a readable
dictionary, Korean comments abstain; the English model remains usable.
The dictionary is a process snapshot: restart after editing it. A different path
uses a different review cache key.

The supplied file has 14,861 rows / 14,859 unique words. Two words repeat and one
(`울컥하다`) has conflicting -2/-1 scores. Unicode/spacing normalization yields
14,858 distinct entries and a second conflict in the crying emoticon. After
conflict/neutral/ambiguous/format exclusions, 14,559 entries are usable.
Conflicting entries are excluded rather
than arbitrarily picking one. User-added fillers/appearance terms such as
`그냥`, `진짜`, `얼굴`, `몸매` do not establish song evaluation. Ambiguous standalone
`소름`, `미친`, `중독`, `눈물` do not establish negative music sentiment.
Music-specific phrase corrections are authored heuristics, not human-labelled
training data or validated accuracy improvements. The supplied scores remain
unchanged for eligible unambiguous dictionary entries.

English signed scores are P(positive)-P(negative); Korean scores are normalized
dictionary scores. They share [-1,1] numerically but are NOT calibrated equivalent
probabilities. Average eligible comment scores as an experimental rank, retain
`methodCounts`, and do not interpret the result as a chance of liking the song.
Never manufacture neutral/positive evidence from missing dictionary matches.

### Reproducible local trial

With `YOUTUBE_API_KEY` in the process environment, run
`node scripts/preview-liked-playlist.mjs --seed-id sundress`.
This runs the real candidate collector, video matching, comment model and final
selection without reading or altering browser/account data. Results use a new
exclusive `work/live-playlist-*.json` file; no raw text, comment IDs, dictionary or
key is saved. It is a neutral explicit-seed trial, not a signed-in member test.

Before the 50-comment change, a real Sundress trial yielded 42 merged candidates,
15 unique-artist candidates and 3 positive selections: Norah Jones — Happy Pills,
Dua Lipa — Houdini, Tame Impala — New Person, Same Old Mistakes. Six candidates
had no conservative video match and six had disabled comments. No slots were
filled with unanalyzed songs.

The updated 50-comment trial on 2026-10-07 at 08:48 UTC also yielded 15 shortlisted
candidates and 3 positive selections: Happy Pills +0.782450 (6 eligible comments),
Houdini +0.710707 (7), New Person, Same Old Mistakes +0.593418 (11). Seven had
disabled comments and five had no matched video. These live eligible comments
were all English; Korean scoring was verified with authored positive/negative,
negation and unrelated-topic examples using the supplied dictionary, not claimed
as a live Korean-comment evaluation. Neither run uses member browser data.

The 08:59 UTC trial with alternate-video retry kept the same 42 merged / 15
unique-artist candidate counts but recovered SKELETONS and BANDIT using their
second matched videos. Five candidates now had positive evidence, ordered as
BANDIT +0.871704 (5 eligible comments), Happy Pills +0.782450 (6), Houdini
+0.710707 (7), New Person, Same Old Mistakes +0.593418 (11), SKELETONS
+0.091266 (5). Five remained comments-disabled and five had no strict match.
This is still a local explicit-Sundress trial, not member-account data or proof
of taste accuracy. The 20-candidate cap does not fabricate extra candidates.

Tests: `node scripts/test-playlist-review-flow.cjs`,
`node scripts/test-review-api.cjs`, `node scripts/test-liked-playlist.cjs`,
`node scripts/test-review-sentiment.cjs`, `node scripts/test-kakao-auth.cjs`,
`node scripts/test-playlist-preflight.cjs`, `node scripts/test-no-playlist-import.cjs`.
Additional tests: `node scripts/test-korean-review-lexicon.mjs`,
`node scripts/test-signed-review-scores.cjs`,
`node scripts/test-review-video-fallback.cjs`.

The text-list import UI is no longer connected to the station. Existing saved
likes remain intact; songs are added individually through their like controls.

## Earlier implementation and local experiments (historical)

The sections below preserve the earlier implementation record. References to
approval guards, missing automatic matching, and file-backed API responses
describe those earlier versions, not the current flow above.

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
