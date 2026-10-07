"""One positive seed -> cross-artist explicit targets; offline research, never deploys.

No personal history or artist/recording identity is a model feature. Public
retrospective ratings are a proxy, NOT observed next-song recommendation feedback.
Train/validation/test users are disjoint. No unobserved item becomes a dislike.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import unicodedata


def stable(value):
    return hashlib.sha256(('genre-atlas-public-ranker-v1:' + str(value)).encode()).hexdigest()


def genre_name(value):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFKC', str(value)).lower().strip())


BASE = ['genre_jaccard', 'seed_genre_coverage', 'candidate_genre_coverage',
        'duration_similarity', 'seed_genres_known', 'candidate_genres_known',
        'seed_duration_known', 'candidate_duration_known']


def features(a, b, vocab):
    ag, bg = set(a['genres']), set(b['genres'])
    shared = len(ag & bg)
    ad, bd = a.get('durationMs'), b.get('durationMs')
    known = lambda v: isinstance(v, (int, float)) and math.isfinite(v) and 1000 <= v <= 3600000
    ak, bk = known(ad), known(bd)
    return [shared / len(ag | bg) if ag and bg else -1,
            shared / len(ag) if ag and bg else -1, shared / len(bg) if ag and bg else -1,
            min(ad, bd) / max(ad, bd) if ak and bk else -1,
            int(bool(ag)), int(bool(bg)), int(ak), int(bk)] + [int(g in ag) if ag else -1 for g in vocab] + [int(g in bg) if bg else -1 for g in vocab]


def prepare(data):
    import pandas as pd
    import pyarrow.parquet as pq
    raw = pd.read_parquet(data / 'recording_feedback.parquet')
    audit = {'raw_rows': len(raw), 'raw_users': int(raw.user_id.nunique())}
    df = raw[raw.feedback.isin([1, -1]) & raw.recording_mbid.notna() & raw.user_id.notna()].copy()
    conflicts = df.groupby(['user_id', 'recording_mbid']).feedback.nunique()
    bad = set(conflicts[conflicts > 1].index)
    df = df[[tuple(row) not in bad for row in df[['user_id', 'recording_mbid']].itertuples(index=False, name=None)]]
    before = len(df)
    df = df.drop_duplicates(['user_id', 'recording_mbid'])
    audit.update(conflicting_pairs_removed=len(bad), duplicate_rows_removed=before-len(df), clean_rows=len(df))
    ratings = {u: dict(zip(g.recording_mbid, g.feedback)) for u, g in df.groupby('user_id')}
    users = sorted([u for u, r in ratings.items() if sum(y == 1 for y in r.values()) >= 5 and sum(y == -1 for y in r.values()) >= 3], key=stable)
    if len(users) < 40:
        raise ValueError('Too few independently held-out users')
    ntrain, nval = int(len(users)*.65), max(10, int(len(users)*.15))
    split = {'train': users[:ntrain], 'validation': users[ntrain:ntrain+nval], 'test': users[ntrain+nval:]}
    assert len(set().union(*map(set, split.values()))) == sum(map(len, split.values()))
    needed = {r for u in users for r in ratings[u]}
    meta = {r: {'genres': [], 'artists': set(), 'durationMs': None} for r in needed}
    for batch in pq.ParquetFile(data / 'recording_artist.parquet').iter_batches():
        for row in batch.to_pylist():
            if row['recording_mbid'] in meta:
                meta[row['recording_mbid']]['artists'].update(row['artist_mbids'] or [])
    for batch in pq.ParquetFile(data / 'recording_genre.parquet').iter_batches():
        for row in batch.to_pylist():
            if row['recording_mbid'] in meta and row['genre']:
                meta[row['recording_mbid']]['genres'].append(genre_name(row['genre']))
    lengths = defaultdict(set)
    for batch in pq.ParquetFile(data / 'recording_length.parquet').iter_batches():
        for row in batch.to_pylist():
            r, length = row['recording_mbid'], row['length']
            if r in meta and not row['is_redirect'] and length and 1000 <= length <= 3600000:
                lengths[r].add(float(length))
    for r, values in lengths.items():
        if len(values) == 1:
            meta[r]['durationMs'] = next(iter(values))
    train_ids = {r for u in split['train'] for r in ratings[u]}
    frequencies = Counter(g for r in train_ids for g in set(meta[r]['genres']))
    vocab = [g for g, n in sorted(frequencies.items(), key=lambda item: (-item[1], item[0])) if n >= 10][:24]
    names = BASE + [f'seed_genre_{i}' for i in range(len(vocab))] + [f'candidate_genre_{i}' for i in range(len(vocab))]
    train_popularity = Counter(r for u in split['train'] for r, y in ratings[u].items() if y == 1)
    frames, manifest = {}, {}
    omitted = Counter()
    for part, group_users in split.items():
        output, queries = [], []
        for user in group_users:
            rated = ratings[user]
            possible = sorted([r for r, y in rated.items() if y == 1 and meta[r]['artists'] and meta[r]['genres']], key=lambda r: stable(f'{user}:{r}'))
            # At most two deterministic seeds per person; never choose by model performance.
            seeds = possible[:2]
            for seed in seeds:
                targets = []
                for label in (1, -1):
                    eligible = [r for r, y in rated.items() if y == label and r not in seeds and meta[r]['artists'] and not (meta[seed]['artists'] & meta[r]['artists'])]
                    targets.extend(sorted(eligible, key=lambda r: stable(f'{user}:{r}'))[:100])
                if {rated[r] for r in targets} != {1, -1}:
                    omitted['queries_without_both_explicit_labels'] += 1
                    continue
                gid = len(queries)
                pseudonym = stable(user)[:16]
                for r in sorted(targets):
                    x = features(meta[seed], meta[r], vocab)
                    assert all(v == -1 or 0 <= v <= 1 for v in x)
                    assert not (meta[seed]['artists'] & meta[r]['artists'])
                    popularity = train_popularity[r] - int(part == 'train' and rated[r] == 1)
                    output.append([gid, pseudonym, seed, r, int(rated[r] == 1), math.log1p(popularity)] + x)
                queries.append({'group': gid, 'user_pseudonym': pseudonym, 'seed': seed, 'rows': len(targets)})
        frames[part] = pd.DataFrame(output, columns=['group', 'user', 'seed', 'candidate', 'label', 'train_popularity'] + names)
        manifest[part] = queries
        if len(queries) < 5:
            raise ValueError(f'Insufficient independent {part} queries')
    audit.update(eligible_users=len(users), assigned_users={k: len(v) for k, v in split.items()},
                 used={k: {'users': int(f.user.nunique()), 'queries': int(f.group.nunique()), 'rows': len(f), 'likes': int(f.label.sum()), 'dislikes': int((f.label == 0).sum())} for k, f in frames.items()},
                 missing_recording_genres=sum(not m['genres'] for m in meta.values()),
                 conflicting_lengths_omitted=sum(len(v) > 1 for v in lengths.values()), omitted=dict(omitted),
                 cross_artist_only=True, genre_vocabulary_from_train_only=True, artist_genre_backfill=False)
    return frames, meta, vocab, names, audit, manifest, train_ids


def evaluate(frame, scores):
    import numpy as np
    grouped = defaultdict(list)
    for _, g in frame.assign(prediction=scores).groupby('group', sort=False):
        y, p = g.label.to_numpy(), g.prediction.to_numpy()
        if set(y) != {0, 1}:
            continue
        diff = p[y == 1, None] - p[y == 0][None, :]
        accuracy = float(((diff > 0) + .5*(diff == 0)).mean())
        order = np.argsort(-p, kind='stable')
        sy, sp = y[order].astype(float), p[order]
        start = 0
        while start < len(sp):
            end = start + 1
            while end < len(sp) and sp[end] == sp[start]:
                end += 1
            sy[start:end] = sy[start:end].mean()
            start = end
        discount = 1 / np.log2(np.arange(min(10, len(g))) + 2)
        ndcg = float((sy[:len(discount)] * discount).sum() / discount[:min(int(y.sum()), len(discount))].sum())
        grouped[g.user.iloc[0]].append((accuracy, ndcg))
    by_user = {u: np.mean(v, axis=0).tolist() for u, v in grouped.items()}
    return {'users': len(by_user), 'queries': sum(len(v) for v in grouped.values()),
            'pair_accuracy': float(np.mean([v[0] for v in by_user.values()])) if by_user else None,
            'ndcg_at_10': float(np.mean([v[1] for v in by_user.values()])) if by_user else None, 'by_user': by_user}


def bootstrap_delta(left, right):
    import numpy as np
    keys = sorted(set(left['by_user']) & set(right['by_user']))
    if len(keys) < 5:
        return {'status': 'insufficient_users'}
    delta = np.array([left['by_user'][u][1] - right['by_user'][u][1] for u in keys])
    means = np.random.default_rng(42).choice(delta, size=(2000, len(delta)), replace=True).mean(axis=1)
    return {'users': len(keys), 'ndcg_delta': float(delta.mean()), 'ci95': np.quantile(means, [.025, .975]).tolist()}


def numeric_export(raw):
    if raw['features_info'].get('categorical_features') or raw['features_info'].get('ctrs'):
        raise ValueError('Only numeric trees may be exported')
    mapping = {f['feature_index']: f['flat_feature_index'] for f in raw['features_info']['float_features']}
    trees = []
    for t in raw['oblivious_trees']:
        splits = []
        for s in t.get('splits') or []:
            if s['split_type'] != 'FloatFeature':
                raise ValueError('Unsupported model split')
            splits.append({'feature': mapping[s['float_feature_index']], 'border': s['border']})
        trees.append({'splits': splits, 'leaves': t['leaf_values']})
    scale, biases = raw['scale_and_bias']
    return {'scale': scale, 'bias': biases[0], 'trees': trees}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--packages', type=Path, action='append', default=[])
    args = parser.parse_args()
    sys.path[:0] = [str(p.resolve()) for p in args.packages]
    import numpy as np
    from catboost import CatBoostRanker, Pool
    if args.output.exists():
        parser.error('Refusing to overwrite an existing experiment')
    frames, meta, vocab, names, audit, manifest, train_ids = prepare(args.data)
    print(json.dumps(audit, ensure_ascii=False), flush=True)
    def pool(frame):
        return Pool(frame[names], label=frame.label, group_id=frame.group, feature_names=names)
    model = CatBoostRanker(iterations=350, depth=4, learning_rate=.04,
                          loss_function='YetiRankPairwise', eval_metric='NDCG:top=10',
                          random_seed=42, thread_count=2, allow_writing_files=False)
    model.fit(pool(frames['train']), eval_set=pool(frames['validation']), early_stopping_rounds=40, use_best_model=True, verbose=50)
    evaluation = {}
    for part in ('validation', 'test'):
        f = frames[part]
        evaluation[part] = {
            'catboost': evaluate(f, model.predict(f[names])),
            'train_popularity': evaluate(f, f.train_popularity.to_numpy()),
            'genre_similarity': evaluate(f, f.genre_jaccard.to_numpy()),
            'random_expected': evaluate(f, np.zeros(len(f))),
            'seed_shuffled': evaluate(f, model.predict(np.array([
                features(meta[seed], meta[row.candidate], vocab)
                for row, seed in zip(f.itertuples(), np.random.default_rng(314).permutation(f.seed.to_numpy()))
            ]))),
        }
    # Lock the comparison baseline on validation, not whichever loses on test.
    baselines = ('train_popularity', 'genre_similarity', 'random_expected')
    baseline = max(baselines, key=lambda b: evaluation['validation'][b]['ndcg_at_10'])
    delta = bootstrap_delta(evaluation['test']['catboost'], evaluation['test'][baseline])
    seed_effect = bootstrap_delta(evaluation['test']['catboost'], evaluation['test']['seed_shuffled'])
    seen_artists = set().union(*(meta[r]['artists'] for r in train_ids))
    test = frames['test']
    unseen = test[[not (meta[r]['artists'] & seen_artists) for r in test.candidate]]
    unseen_result = evaluate(unseen, model.predict(unseen[names])) if len(unseen) else {'users': 0, 'ndcg_at_10': None}
    low, high = map(float, np.percentile(model.predict(frames['validation'][names]), [5, 95]))
    if high-low <= 1e-9:
        raise ValueError('Constant predictions; do not deploy')
    args.output.mkdir(parents=True, exist_ok=False)
    model.save_model(str(args.output / 'ranker.cbm'))
    model.save_model(str(args.output / 'catboost-native.json'), format='json')
    artifact = {'format': 'genre-atlas-song-context-catboost', 'version': 1,
                'modelId': 'listenbrainz-single-seed-20261007', 'approved': False,
                'featureVersion': 1, 'featureNames': names, 'genreVocabulary': vocab,
                'normalization': {'low': low, 'high': high},
                **numeric_export(json.loads((args.output / 'catboost-native.json').read_text(encoding='utf-8')))}
    importance = model.get_feature_importance(pool(frames['validation']), type='PredictionValuesChange')
    report = {'status': 'trained_offline_not_deployed', 'data_audit': audit,
              'model': 'CatBoostRanker / YetiRankPairwise', 'trees': model.tree_count_, 'max_iterations': 350,
              'features': names, 'genre_vocabulary': vocab,
              'feature_importance': dict(zip(names, map(float, importance))),
              'evaluation': evaluation, 'comparison_baseline_chosen_on_validation': baseline,
              'test_delta_vs_baseline': delta, 'test_correct_vs_shuffled_seed': seed_effect,
              'unseen_candidate_artist_test': unseen_result,
              'offline_gate_passed': delta.get('ci95', [-1])[0] > 0 and seed_effect.get('ci95', [-1])[0] > 0 and unseen_result['users'] >= 5,
              'learning_curve': model.get_evals_result(),
              'limitations': ['Public June 2025 explicit ratings; no timestamps or real recommendation exposures.',
                             'One liked track is a proxy query, not evidence of next-track satisfaction.',
                             'All targets explicitly rated; no fabricated negatives. Eligible-user selection bias remains.',
                             'Only different known artists; same-album exclusion cannot be replayed from this data.',
                             'Only recording genres and lengths, not audio or producer data. No profile or artist IDs in X.',
                             'No end-to-end credits 80 / ML 20 validation: this sample has no credit candidate set.',
                             'Public deployment needs review of provider permissions and live metadata coverage.']}
    (args.output / 'candidate-model.json').write_text(json.dumps(artifact, indent=2), encoding='utf-8')
    (args.output / 'evaluation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    (args.output / 'split-manifest.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    for name, frame in frames.items():
        frame.to_parquet(args.output / f'{name}-features.parquet', index=False)
    preview = test.assign(model_score=model.predict(test[names]))
    preview.to_csv(args.output / 'test-preview.csv', index=False)
    metadata = lambda r: {k: v for k, v in meta[r].items() if k != 'artists'}
    examples = [{'seed': metadata(row.seed), 'candidate': metadata(row.candidate),
                 'x': features(meta[row.seed], meta[row.candidate], vocab)} for row in test.head(20).itertuples()]
    (args.output / 'parity-fixture.json').write_text(json.dumps({'artifact': artifact, 'examples': examples,
             'predictions': model.predict(test.head(20)[names]).tolist()}, indent=2), encoding='utf-8')
    print(json.dumps({k: v for k, v in report.items() if k in ('trees', 'test_delta_vs_baseline', 'test_correct_vs_shuffled_seed', 'offline_gate_passed')}, indent=2), flush=True)
    print('Saved local experiment. approved=false. Live model unchanged.', flush=True)


if __name__ == '__main__':
    main()
