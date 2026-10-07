"""Offline CatBoost training from explicit station exports, not public proxy labels.

Outputs are unapproved until reviewed; this script never changes the live model.
Needs catboost and numpy in the caller's Python environment. No network access.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
contract = (ROOT / "lib/seed-pair-features.ts").read_text(encoding="utf-8")
FEATURE_NAMES = re.findall(r"'([a-z_]+)'", contract.split("PAIR_FEATURE_NAMES = [", 1)[1].split("] as const", 1)[0])
assert len(FEATURE_NAMES) == 16


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def load_groups(paths):
    """Validate new snapshots; never backfill old features or invent a skipped label."""
    events, counts = {}, Counter()
    for path in paths:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        if data.get("format") != "genre-atlas-ranking" or data.get("seedPairFeatureVersion") != 1 or data.get("seedPairFeatureNames") != FEATURE_NAMES:
            raise ValueError("Export has no compatible seed-pair feature contract. Export new records from the updated station.")
        for event in data.get("events", []):
            if not isinstance(event, dict):
                raise ValueError("Invalid event")
            snapshot = event.get("seedPair")
            if not snapshot:
                counts["old_rows_without_new_snapshot"] += 1
                continue
            if not isinstance(snapshot, dict) or snapshot.get("version") != 1:
                raise ValueError("Invalid seed-pair version")
            if snapshot.get("trainable") is not True:
                counts["source_ineligible"] += 1
                continue
            x = snapshot.get("x")
            if not isinstance(x, list) or len(x) != len(FEATURE_NAMES) or not all(finite(v) and (v == -1 or 0 <= v <= 1) for v in x):
                raise ValueError("Invalid X: expected 16 numeric features, -1 or [0, 1]")
            for name in ("creditScore", "legacyScore"):
                if not finite(snapshot.get(name)) or not 0 <= snapshot[name] <= (1 if name == "creditScore" else 3):
                    raise ValueError("Missing pre-feedback baseline score")
            strings = [event.get(k) for k in ("id", "group", "song")] + [snapshot.get(k) for k in ("seedSong", "seedArtist", "candidateArtist")]
            if not all(isinstance(s, str) and 0 < len(s) < 1000 for s in strings):
                raise ValueError("Missing grouping/identity metadata")
            action, label, rated_at = event.get("action"), event.get("label"), event.get("ratedAt")
            if action not in ("shown", "skip", "like", "dislike") or not finite(event.get("at")) or (rated_at is not None and (not finite(rated_at) or rated_at < event["at"])):
                raise ValueError("Invalid explicit rating or feedback timestamp")
            if action in ("like", "dislike"):
                if type(label) is not int or label != int(action == "like") or rated_at is None:
                    raise ValueError("Contradictory explicit rating")
            elif label is not None:
                raise ValueError("Skips and unanswered exposures cannot be labels")
            previous = events.get(event["id"])
            if previous:
                if any(previous[k] != event[k] for k in ("group", "song", "at", "seedPair")):
                    raise ValueError("A frozen exposure changed between exports")
                prior_time, next_time = previous["ratedAt"] or previous["at"], event["ratedAt"] or event["at"]
                if prior_time == next_time and previous["label"] != label:
                    raise ValueError("Conflicting ratings with the same timestamp")
                if prior_time >= next_time:
                    counts["duplicate_exports"] += 1
                    continue
            events[event["id"]] = event
    groups = defaultdict(dict)
    for e in sorted(events.values(), key=lambda e: e["ratedAt"] or e["at"]):
        if e["label"] is None:
            counts["unlabelled_or_skipped"] += 1
            continue
        groups[e["group"]][e["song"]] = e
    usable = []
    for by_song in groups.values():
        rows = list(by_song.values())
        if len({e["seedPair"]["seedSong"] for e in rows}) != 1:
            raise ValueError("One ranking session contains multiple starting songs")
        if {e["label"] for e in rows} != {0, 1} or len({tuple(e["seedPair"]["x"]) for e in rows}) < 2:
            counts["non_comparable_sessions"] += 1
            continue
        usable.append(rows)
    return sorted(usable, key=lambda g: min(e["at"] for e in g)), dict(counts)


def chronological_split(groups):
    if len(groups) < 20 or sum(map(len, groups)) < 80:
        raise ValueError("Not enough real labels: need at least 80 rated snapshots across 20 comparable single-song sessions. This is a minimum for an experiment, not a quality guarantee.")
    first, second = int(len(groups) * .7), int(len(groups) * .85)
    train, val, test = groups[:first], groups[first:second], groups[second:]
    val_start, test_start = min(e["at"] for g in val for e in g), min(e["at"] for g in test for e in g)
    train = [g for g in train if max(e["ratedAt"] for e in g) < val_start]
    val = [g for g in val if max(e["ratedAt"] for e in g) < test_start]
    if len(train) < 10 or len(val) < 3 or len(test) < 3:
        raise ValueError("Too few time-separated sessions after purging late ratings. Do not randomly split rows from the same session.")
    return train, val, test


def pack(groups):
    from catboost import Pool
    rows = [e for g in groups for e in g]
    return Pool([e["seedPair"]["x"] for e in rows], label=[e["label"] for e in rows], group_id=[i for i, g in enumerate(groups) for _ in g], feature_names=FEATURE_NAMES)


def export_numeric_model(raw):
    info = raw["features_info"]
    if info.get("categorical_features") or info.get("ctrs") or info.get("text_features"):
        raise ValueError("Only numeric symmetric CatBoost models are supported")
    mapping = {}
    for f in info["float_features"]:
        index = f["flat_feature_index"]
        if not 0 <= index < len(FEATURE_NAMES) or f["feature_id"] != FEATURE_NAMES[index]:
            raise ValueError("Feature order changed")
        mapping[f["feature_index"]] = index
    trees = []
    for t in raw["oblivious_trees"]:
        splits = []
        for s in t.get("splits") or []:
            if s["split_type"] != "FloatFeature":
                raise ValueError("Unsupported CatBoost split")
            splits.append({"feature": mapping[s["float_feature_index"]], "border": s["border"]})
        if len(splits) > 8 or len(t["leaf_values"]) != 2 ** len(splits):
            raise ValueError("Unsupported tree dimensions")
        trees.append({"splits": splits, "leaves": t["leaf_values"]})
    scale, biases = raw["scale_and_bias"]
    if len(biases) != 1:
        raise ValueError("Expected one ranking score")
    return {"scale": scale, "bias": biases[0], "trees": trees}


def predict_export(model, x):
    import numpy as np
    total = 0.0
    for tree in model["trees"]:
        index = sum(2 ** d for d, split in enumerate(tree["splits"]) if float(np.float32(x[split["feature"]])) > split["border"])
        total += tree["leaves"][index]
    return total * model["scale"] + model["bias"]


def ndcg(groups, scores):
    offset, values = 0, []
    for group in groups:
        ranked = sorted(zip(group, scores[offset:offset + len(group)]), key=lambda p: (-float(p[1]), p[0]["song"]))
        offset += len(group)
        actual = sum(e["label"] / math.log2(i + 2) for i, (e, _) in enumerate(ranked[:10]))
        ideal = sum(y / math.log2(i + 2) for i, y in enumerate(sorted([e["label"] for e in group], reverse=True)[:10]))
        values.append(actual / ideal)
    return sum(values) / len(values) if values else None


def train(groups):
    import numpy as np
    from catboost import CatBoostRanker
    train_groups, val, test = chronological_split(groups)
    model = CatBoostRanker(iterations=350, depth=4, learning_rate=.05, loss_function="PairLogitPairwise", eval_metric="NDCG:top=10", random_seed=42, thread_count=2, allow_writing_files=False)
    model.fit(pack(train_groups), eval_set=pack(val), early_stopping_rounds=40, use_best_model=True, verbose=50)
    val_scores = model.predict(pack(val))
    low, high = map(float, np.percentile(val_scores, [5, 95]))
    if high - low < 1e-9:
        raise ValueError("Model produces no usable score separation; keep fallback ranking")
    with tempfile.TemporaryDirectory(prefix="genre-atlas-model-") as temp:
        path = Path(temp) / "model.json"
        model.save_model(str(path), format="json")
        exported = export_numeric_model(json.loads(path.read_text(encoding="utf-8")))
    predictions = model.predict(pack(test))
    parity = max(abs(float(p) - predict_export(exported, e["seedPair"]["x"])) for p, e in zip(predictions, [e for g in test for e in g]))
    if parity > 1e-7:
        raise ValueError("Export prediction parity check failed")

    def evaluate(split):
        rows = [e for g in split for e in g]
        raw = model.predict(pack(split))
        credits = [e["seedPair"]["creditScore"] for e in rows]
        hybrid = [.8 * c + .2 * float(np.clip((p - low) / (high - low), 0, 1)) for c, p in zip(credits, raw)]
        return {"sessions": len(split), "rows": len(rows), "ndcg_at_10": {"legacy_sources": ndcg(split, [e["seedPair"]["legacyScore"] for e in rows]), "credits_only": ndcg(split, credits), "catboost_only": ndcg(split, raw), "credits_80_catboost_20": ndcg(split, hybrid)}}

    seen_artists = {e["seedPair"]["candidateArtist"] for g in train_groups for e in g}
    unseen = [[e for e in g if e["seedPair"]["candidateArtist"] not in seen_artists] for g in test]
    unseen = [g for g in unseen if {e["label"] for e in g} == {0, 1}]
    report = {"status": "experiment_only_not_approved", "max_iterations": 350, "trees_saved": model.tree_count_, "best_iteration_zero_based": model.best_iteration_, "split": "70/15/15 chronological whole sessions; late ratings purged", "metrics": {"train": evaluate(train_groups), "validation": evaluate(val), "test": evaluate(test)}, "unseen_candidate_artist_test": evaluate(unseen) if unseen else {"status": "insufficient_comparable_unseen_artist_groups"}, "export_max_absolute_error": parity, "learning_curve": model.get_evals_result(), "limitations": ["Only explicitly rated, shown candidates; not a randomized whole-catalog evaluation.", "NDCG is ranking quality, not a liking probability.", "Minimum sample size is not proof of improvement. Review held-out results and new-artist coverage before approval."]}
    artifact = {"format": "genre-atlas-seed-catboost", "version": 1, "approved": False, "featureVersion": 1, "featureNames": FEATURE_NAMES, "normalization": {"low": low, "high": high}, **exported}
    return artifact, report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", nargs="+", required=True, help="Explicitly exported local rating JSON files")
    parser.add_argument("--output", required=True, help="New private experiment directory (must not exist)")
    parser.add_argument("--model-id", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,100}", args.model_id):
        parser.error("Invalid model ID")
    output = Path(args.output)
    if output.exists():
        parser.error("Output already exists; refusing to overwrite")
    try:
        groups, dropped = load_groups(args.input)
        artifact, report = train(groups)
    except ValueError as error:
        parser.exit(2, f"Training not completed: {error}\n")
    artifact["modelId"] = args.model_id
    report["dropped"] = dropped
    output.mkdir(parents=True, exist_ok=False)
    (output / "candidate-model.json").write_text(json.dumps(artifact, indent=2), encoding="utf-8")
    (output / "evaluation.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    print("Experiment saved. approved=false; live recommendations were NOT changed.")


if __name__ == "__main__":
    main()
