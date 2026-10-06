# Personal learning-to-rank

## What runs on the website

Candidate retrieval is unchanged: verified credits/sample links, related artists and available similar-track sources. There is **no YouTube playlist harvesting**. Source availability does not guarantee 50–200 candidates.

The deployed learner is a **browser-local pairwise logistic linear ranker**, not CatBoost and not an audio model. It learns weights from differences between explicitly liked and disliked recommendations in the same starting-song session. Features are bounded to [0,1]; role-specific credits and missing-metadata indicators distinguish unknown information from a confirmed match. Source-provided genres are not invented. The sample feature is an artist-level documented connection, not necessarily a verified exact recording-to-recording sample.

Production uses source-based fallback ranking until there are 12 explicit ratings, at least 3 of each label, 2 comparable sessions and 6 non-identical comparison pairs. These are engineering safeguards, not statistical guarantees. Once active, learned scores replace fallback scores before the artist-diversity cap. Same-album, dislike and three-day repeat exclusions remain hard constraints. No BPM filter is used.

Features are frozen when a recommendation first appears; late-arriving metadata does not rewrite a training observation. Ratings never become features for that same observation. Like = 1, dislike = 0, skip/no response = unlabeled. Starting-song likes influence candidate seeds; they are not silently turned into contextual ranking labels. Older likes without feature snapshots are not backfilled.

Past-liked creator IDs are exact identities with roles; different IDs are not merged by spelling. Cross-provider aliases may therefore miss connections. Producer and mastering roles are separate. Release-level connections are marked. Missing credits are not proof of no connection.

Training records (maximum 1,000 observations) and preferences remain in the browser, partitioned by sign-in identity. Reset clears both for the current identity. Sign-in does not sync devices. No listening duration or replay is claimed. YouTube-derived route evidence is excluded from training; no new permission for provider data reuse is implied.

After six comparable sessions, the UI reports a chronological, session-held-out comparison check where time separation is valid. This is neither a like probability nor proof that the model beats existing recommendations. Sparse, exposure-biased personal feedback can overfit; collect varied starting songs and evaluate before relying on it.

## Optional Python / CatBoost experiment

1. Use **Your ranking model → Export my training records**.
2. Install the dependencies listed in ml/requirements.txt in a Python environment.
3. Run the following command with the downloaded export and a new output directory:

    python ml/train_ranker.py path/to/genre-atlas-ratings.json --output ml-runs/experiment-01

The script requires at least six sessions containing both positive and negative labels. It uses chronological train/validation/test groups, rejects overlapping feedback windows, deduplicates each song per session, uses explicit labels only, and trains CatBoostRanker with YetiRankPairwise. It exports a model and held-out NDCG@10 / pair accuracy. Existing output folders are never overwritten.

The website does **not** load this CatBoost model. Connecting an approved model to production inference is a separate step after collecting real data and reviewing test results. Test fixtures in the repository are synthetic software checks, never production user labels.

## Release catalog

Albums uses MusicBrainz release groups for albums, singles, EPs, compilations and mixtapes. Deezer is an explicitly selectable alternative. The page preserves source classifications; a release may belong to more than one type. Missing artwork and duration are labelled, not fabricated. Detail lists one identified edition in full when available, not every edition combined. Neither catalog guarantees exhaustive coverage.
