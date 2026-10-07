"""Synthetic implementation tests only. Not a production recommendation model."""
import importlib.util
import contextlib
import io
import json
import sys
import tempfile
from pathlib import Path

spec = importlib.util.spec_from_file_location("trainer", Path(__file__).with_name("train-seed-pair-ranker.py"))
trainer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trainer)


def run():
    import numpy as np
    from catboost import CatBoostRanker, Pool
    try:
        trainer.chronological_split([])
        raise AssertionError("Empty training must not succeed")
    except ValueError:
        pass
    with tempfile.TemporaryDirectory(prefix="genre-atlas-ranker-test-") as temp:
        path = Path(temp) / "export.json"
        base = {"format": "genre-atlas-ranking", "seedPairFeatureVersion": 1, "seedPairFeatureNames": trainer.FEATURE_NAMES}
        snapshot = {"version": 1, "seedSong": "test:seed", "seedArtist": "test seed", "candidateArtist": "test candidate", "x": [0.] * 16, "creditScore": .5, "legacyScore": .5, "trainable": True}
        event = {"id": "e1", "group": "g1", "song": "test:candidate", "at": 1, "ratedAt": 2, "action": "like", "label": 1, "seedPair": snapshot}
        path.write_text(json.dumps({**base, "events": [event, {**event, "id": "e2", "action": "skip", "label": None}]}), encoding="utf-8")
        groups, counts = trainer.load_groups([path])
        assert not groups and counts["unlabelled_or_skipped"] == 1
        assert counts["non_comparable_sessions"] == 1
        path.write_text(json.dumps({**base, "events": [event, {**event, "action": "skip", "label": None, "ratedAt": 3}]}), encoding="utf-8")
        groups, counts = trainer.load_groups([path])
        assert not groups and counts["unlabelled_or_skipped"] == 1
        assert "non_comparable_sessions" not in counts, "A later unlabelled event must not leave a stale positive"
        invalid = {**event, "label": 0}
        path.write_text(json.dumps({**base, "events": [invalid]}), encoding="utf-8")
        try:
            trainer.load_groups([path])
            raise AssertionError("Contradictory label accepted")
        except ValueError:
            pass

        # Full offline pipeline smoke test; labels are artificial, never deploy it.
        groups = []
        for session in range(20):
            rows = []
            for i in range(4):
                label = i % 2
                x_row = [float(label), .25 * i] + [-1.] * 14
                rows.append({**event, "id": f"synthetic-{session}-{i}", "group": f"session-{session}", "song": f"synthetic:song-{session}-{i}", "at": session * 100 + i, "ratedAt": session * 100 + i + 10, "label": label, "action": "like" if label else "dislike", "seedPair": {**snapshot, "seedSong": f"synthetic:seed-{session}", "candidateArtist": f"synthetic artist {session}-{i}", "x": x_row}})
            groups.append(rows)
        with contextlib.redirect_stdout(io.StringIO()):
            experiment, report = trainer.train(groups)
        assert experiment["approved"] is False
        assert report["metrics"]["train"]["sessions"] == 14
        assert report["metrics"]["validation"]["sessions"] == 3
        assert report["metrics"]["test"]["sessions"] == 3
        assert report["unseen_candidate_artist_test"]["sessions"] == 3

        rng = np.random.default_rng(42)
        x = rng.choice([-1., 0., .25, .5, .75, 1.], (120, 16))
        labels = [0, 1, 0, 1] * 30
        pool = Pool(x, labels, group_id=np.repeat(np.arange(30), 4), feature_names=trainer.FEATURE_NAMES)
        model = CatBoostRanker(iterations=12, depth=3, loss_function="PairLogitPairwise", random_seed=42, thread_count=2, allow_writing_files=False, verbose=False)
        model.fit(pool)
        model.set_scale_and_bias(1.3, .2)
        raw_path = Path(temp) / "synthetic-model.json"
        model.save_model(str(raw_path), format="json")
        exported = trainer.export_numeric_model(json.loads(raw_path.read_text(encoding="utf-8")))
        # Include exact split boundaries to catch > versus >= and float32 mismatch.
        probe = [list(row) for row in x[:12]]
        for tree in exported["trees"]:
            for split in tree["splits"]:
                row = [0.] * 16
                border = split["border"]
                if border >= 0:
                    row[split["feature"]] = border
                    probe.append(row)
        expected = model.predict(probe)
        error = max(abs(float(p) - trainer.predict_export(exported, row)) for p, row in zip(expected, probe))
        assert error < 1e-7, error
        if len(sys.argv) > 1:
            output = Path(sys.argv[1])
            if output.exists():
                raise ValueError("Refusing to overwrite test fixture")
            output.parent.mkdir(parents=True, exist_ok=True)
            artifact = {"format": "genre-atlas-seed-catboost", "version": 1, "approved": False, "modelId": "synthetic-test-only", "featureVersion": 1, "featureNames": trainer.FEATURE_NAMES, "normalization": {"low": -1, "high": 1}, **exported}
            output.write_text(json.dumps({"artifact": artifact, "x": probe, "predictions": list(expected)}), encoding="utf-8")
        print(f"PASS synthetic-only training/export checks; native prediction error={error:.3g}. No real-user model trained or activated.")


if __name__ == "__main__":
    run()
