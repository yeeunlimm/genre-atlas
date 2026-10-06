"""Offline CatBoostRanker experiment using explicit, pre-feedback browser snapshots.
No scraping, synthetic labels, user-ID feature or automatic production deployment.
"""
import argparse
import json
import math
from pathlib import Path
from collections import defaultdict

FEATURE_NAMES = ["shared_producer", "shared_mastering", "sample_artist_connection", "genre_overlap",
                 "route_credits", "route_related", "route_similar", "liked_creator_overlap", "liked_artist",
                 "producer_metadata_present", "mastering_metadata_present", "genre_metadata_present",
                 "sample_evidence_present", "liked_creator_history_present", "release_credit_connection",
                 "non_youtube_related_evidence"]


def prepare(payload):
    if payload.get("format") != "genre-atlas-ranking" or payload.get("featureVersion") != 1:
        raise ValueError("Unsupported training export version.")
    names = payload.get("featureNames")
    if names != FEATURE_NAMES:
        raise ValueError("Expected the exact ordered version-1 feature schema.")
    groups = defaultdict(dict)
    for event in payload.get("events", []):
        if event.get("action") not in ("like", "dislike"):
            continue
        label = 1 if event["action"] == "like" else 0
        if event.get("label") != label:
            raise ValueError("Action and label disagree.")
        features = event.get("features", [])
        if len(features) != len(names) or not all(isinstance(v, (int, float)) and math.isfinite(v) and 0 <= v <= 1 for v in features):
            raise ValueError("Malformed feature snapshot.")
        at, rated = event.get("at"), event.get("ratedAt")
        if not isinstance(at, (int, float)) or not isinstance(rated, (int, float)) or not (math.isfinite(at) and math.isfinite(rated) and rated >= at):
            raise ValueError("Feedback must occur after feature capture.")
        if not event.get("group") or not event.get("song"):
            raise ValueError("Missing session or song identity.")
        previous = groups[event["group"]].get(event["song"])
        if previous is None or rated > previous["ratedAt"]:
            groups[event["group"]][event["song"]] = event
    result = [list(g.values()) for g in groups.values() if {e["label"] for e in g.values()} == {0, 1}]
    result.sort(key=lambda g: min(e["at"] for e in g))
    return names, result


def split_chronologically(groups):
    if len(groups) < 6:
        raise ValueError("Need at least 6 starting-song sessions containing both likes and dislikes. Keep collecting; do not invent labels.")
    cut1 = max(2, int(len(groups) * .6))
    cut2 = max(cut1 + 1, int(len(groups) * .8))
    validation, test = groups[cut1:cut2], groups[cut2:]
    val_start = min(e["at"] for g in validation for e in g)
    test_start = min(e["at"] for g in test for e in g)
    train = [g for g in groups[:cut1] if max(e["ratedAt"] for e in g) < val_start]
    validation = [g for g in validation if max(e["ratedAt"] for e in g) < test_start]
    if len(train) < 2 or not validation or not test:
        raise ValueError("Sessions overlap in time; not enough leakage-safe chronological groups.")
    return train, validation, test


def pair_accuracy(groups, predict):
    wins, count = 0.0, 0
    for group in groups:
        scores = predict([e["features"] for e in group])
        positives = [scores[i] for i, e in enumerate(group) if e["label"] == 1]
        negatives = [scores[i] for i, e in enumerate(group) if e["label"] == 0]
        for p in positives:
            for n in negatives:
                count += 1
                wins += 1 if p > n else .5 if p == n else 0
    return wins / count if count else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path)
    parser.add_argument("--output", type=Path, required=True, help="A NEW output directory; existing directories are never overwritten.")
    parser.add_argument("--iterations", type=int, default=400)
    args = parser.parse_args()
    if not 1 <= args.iterations <= 5000:
        parser.error("--iterations must be between 1 and 5000.")
    names, groups = prepare(json.loads(args.export.read_text(encoding="utf-8")))
    train, validation, test = split_chronologically(groups)
    if args.output.exists():
        parser.error("Output directory already exists. Choose a new directory.")
    from catboost import CatBoostRanker, Pool

    def pool(items):
        features, labels, ids = [], [], []
        for index, group in enumerate(items):
            for event in group:
                features.append(event["features"])
                labels.append(event["label"])
                ids.append(index)
        return Pool(features, label=labels, group_id=ids, feature_names=names)

    model = CatBoostRanker(iterations=args.iterations, depth=4, learning_rate=.05,
                          loss_function="YetiRankPairwise", eval_metric="NDCG:top=10",
                          random_seed=42, thread_count=2, allow_writing_files=False)
    model.fit(pool(train), eval_set=pool(validation), early_stopping_rounds=40, verbose=False)
    test_metrics = model.eval_metrics(pool(test), ["NDCG:top=10"])
    ndcg_key = next(key for key in test_metrics if key.startswith("NDCG:"))
    metrics = {
        "feature_version": 1, "feature_names": names,
        "train_groups": len(train), "validation_groups": len(validation), "test_groups": len(test),
        "test_ndcg_10": test_metrics[ndcg_key][-1],
        "test_pair_accuracy": pair_accuracy(test, model.predict),
        "equal_score_pair_baseline": .5,
        "notice": "Offline personal experiment. Not a calibrated liking probability. Exposure-biased data; not proof of improvement over the production fallback. No automatic deployment."
    }
    args.output.mkdir(parents=True, exist_ok=False)
    model.save_model(str(args.output / "ranker.cbm"))
    (args.output / "metrics.json").write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(json.dumps(metrics, indent=2))


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        raise SystemExit(str(error))
