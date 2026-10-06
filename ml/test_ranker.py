"""Synthetic software smoke checks only. Never production user data."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from train_ranker import prepare, split_chronologically, FEATURE_NAMES


def fixture():
    events = []
    for group in range(10):
        for i in range(6):
            features = [0.] * 16
            features[0] = float(i < 3)
            features[3] = i / 10
            at = group * 1000 + i * 10
            events.append(dict(id=f"{group}-{i}", group=str(group), song=f"track-{group}-{i}",
                               at=at, ratedAt=at+1, features=features,
                               label=int(i < 3), action="like" if i < 3 else "dislike"))
    return dict(format="genre-atlas-ranking", featureVersion=1,
                featureNames=FEATURE_NAMES, events=events)


class RankerTests(unittest.TestCase):
    def test_labels_and_time(self):
        payload = fixture()
        payload["events"].append(dict(action="skip", label=None))
        _, groups = prepare(payload)
        train, validation, test = split_chronologically(groups)
        self.assertEqual((len(train), len(validation), len(test)), (6, 2, 2))
        self.assertLess(max(e["ratedAt"] for g in train for e in g), min(e["at"] for g in validation for e in g))
        payload["events"][0]["ratedAt"] = -1
        with self.assertRaises(ValueError):
            prepare(payload)

    def test_insufficient_data(self):
        with self.assertRaises(ValueError):
            split_chronologically([])

    def test_synthetic_catboost_training(self):
        with tempfile.TemporaryDirectory(prefix="genre-atlas-test-") as folder:
            root = Path(folder)
            export = root / "synthetic.json"
            export.write_text(json.dumps(fixture()), encoding="utf-8")
            script = Path(__file__).with_name("train_ranker.py")
            result = subprocess.run([sys.executable, str(script), str(export), "--output",
                                     str(root / "model"), "--iterations", "25"], capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            metrics = json.loads((root / "model" / "metrics.json").read_text())
            self.assertGreater(metrics["test_pair_accuracy"], .5)
            self.assertTrue((root / "model" / "ranker.cbm").exists())


if __name__ == "__main__":
    unittest.main()
