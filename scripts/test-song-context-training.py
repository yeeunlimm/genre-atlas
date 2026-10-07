"""Audit the single-seed experiment without modifying source datasets or models."""
import argparse
import importlib.util
import json
from pathlib import Path
import sys


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--run', type=Path, required=True)
    p.add_argument('--data', type=Path, required=True)
    p.add_argument('--packages', type=Path, action='append', default=[])
    args = p.parse_args()
    sys.path[:0] = [str(x.resolve()) for x in args.packages]
    import pandas as pd
    import numpy as np
    import pyarrow.parquet as pq
    spec = importlib.util.spec_from_file_location('training', Path(__file__).with_name('train-song-context-ranker.py'))
    t = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(t)
    vocab = ['indie rock', 'pop']
    assert t.features({'genres': ['Indie Rock'.lower()], 'durationMs': 200000}, {'genres': ['indie rock'], 'durationMs': 250000}, vocab) == [1, 1, 1, .8, 1, 1, 1, 1, 1, 0, 1, 0]
    assert t.features({'genres': [], 'durationMs': float('nan')}, {'genres': ['pop']}, vocab)[0:4] == [-1, -1, -1, -1]
    frame = pd.DataFrame({'group': [0, 0], 'user': ['u', 'u'], 'label': [1, 0]})
    tied = t.evaluate(frame, np.zeros(2))
    assert tied['pair_accuracy'] == .5
    assert abs(tied['ndcg_at_10'] - (1 + 1/np.log2(3)) / 2) < 1e-12
    assert t.evaluate(frame, [2, 1])['ndcg_at_10'] == 1
    assert t.evaluate(frame, [1, 2])['pair_accuracy'] == 0
    assert t.bootstrap_delta(tied, tied)['status'] == 'insufficient_users'
    frames = {part: pd.read_parquet(args.run / f'{part}-features.parquet') for part in ('train', 'validation', 'test')}
    user_sets = [set(f.user) for f in frames.values()]
    assert len(set().union(*user_sets)) == sum(map(len, user_sets)), 'user leakage'
    raw = pd.read_parquet(args.data / 'recording_feedback.parquet')
    truths = {}
    for row in raw.itertuples():
        truths.setdefault((t.stable(row.user_id)[:16], row.recording_mbid), set()).add(row.feedback)
    needed = set().union(*(set(f.seed) | set(f.candidate) for f in frames.values()))
    artists = {}
    for batch in pq.ParquetFile(args.data / 'recording_artist.parquet').iter_batches():
        for row in batch.to_pylist():
            if row['recording_mbid'] in needed:
                artists.setdefault(row['recording_mbid'], set()).update(row['artist_mbids'] or [])
    model = json.loads((args.run / 'candidate-model.json').read_text(encoding='utf-8'))
    assert model['approved'] is False
    assert not any('artist' in n or 'user' in n or 'producer' in n or 'popularity' in n for n in model['featureNames'])
    for part, f in frames.items():
        assert not f.duplicated(['group', 'candidate']).any()
        assert all(set(g.label) == {0, 1} and g.seed.nunique() == 1 for _, g in f.groupby('group'))
        assert f[model['featureNames']].map(lambda n: n == -1 or 0 <= n <= 1).all().all()
        for row in f.itertuples():
            assert truths[(row.user, row.seed)] == {1}, 'seed not explicitly liked'
            assert truths[(row.user, row.candidate)] == ({1} if row.label == 1 else {-1}), 'fabricated or conflicting label'
            assert row.seed != row.candidate
            assert artists[row.seed] and artists[row.candidate] and not (artists[row.seed] & artists[row.candidate]), 'same/unknown artist slipped in'
    print('PASS actual source-label provenance, distinct seed/target, cross-artist queries, user-disjoint split, bounded X, tie-aware metrics and deployment guard.')


if __name__ == '__main__':
    main()
