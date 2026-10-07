# 곡 추천: 제작진 경로 80% + CatBoost 20%

## 현재 상태

연결 코드와 새 평가 기록 형식은 구현했습니다. **승인된 새 모델은 아직 없습니다.**
기존 공개 데이터용 CatBoost/브라우저 선형 모델을 새 모델인 것처럼 사용하지 않습니다.
모델이 없거나 잘못됐으면 기존 추천을 그대로 유지하고 화면에 미적용 상태를 표시합니다.
플레이리스트의 별도 좋아요 기반 수집·댓글 감성분석은 변경하지 않았습니다.

## 실행 흐름

1. 기존 제작진·샘플·관련 아티스트·유사곡 경로에서 후보를 모읍니다.
2. 선택곡 하나와 후보 하나를 비교한 16개 숫자를 만듭니다. 가수/곡 ID 자체는 X에 넣지 않습니다.
3. 승인된 CatBoost 모델이 있을 때 후보별 점수를 계산합니다.
4. `최종 점수 = 0.8 × 제작진 경로 점수 + 0.2 × 정규화한 CatBoost 점수`.
5. 같은 앨범·싫어요·최근 반복은 제외하고, 순위가 높은 후보부터 아티스트당 한 곡을 남깁니다.

80:20은 곡 개수 비율이 아닙니다. 제작진 경로에는 **기존 코드의 제작진·샘플 연결 점수**가 들어갑니다.
프로듀서 5점, 마스터링 2점 등의 기존 규칙 자체를 바꾸지 않았습니다.
해당 경로가 이미 계산한 `min(.95, .6 + 기존 점수 × .035)`를 `.95`로 나누어 0~1로 맞춥니다.
제작진 경로가 없으면 이 항은 0입니다. 따라서 제작진 후보를 강하게 우선합니다.
모델만으로 점수가 높은 비제작진 후보가 항상 위로 올 수 있는 설계는 아닙니다.

CatBoost 점수는 검증 세트 예측값의 5/95 백분위로 0~1 변환하고 범위 밖은 잘라냅니다.
후보가 추가될 때마다 최소/최대로 다시 변환하지 않으므로 같은 후보의 점수가 불필요하게 바뀌지 않습니다.
이 값은 **좋아할 확률이 아닙니다**. 모델이 없을 때 가짜 0.5 점수를 넣지 않습니다.

## X의 각 열

| 열 | 산정 |
|---|---|
| shared_producer / shared_mastering / shared_mixing / shared_songwriter / shared_arranger | 동일 역할의 제공된 제작진 ID 목록끼리 교집합이 있으면 1, 없으면 0. 어느 쪽이든 목록이 없으면 -1 |
| shared_track_producer / shared_track_mastering | 두 곡 모두 곡 단위라고 명시된 크레딧만 같은 방식으로 비교 |
| shared_release_producer / shared_release_mastering | 두 곡 모두 발매본 단위라고 명시된 크레딧만 비교 |
| sample_artist_connection | 확인된 샘플 아티스트 연결은 1, 정보가 없으면 -1. 특정 곡 샘플 증명과 다름 |
| track_genre_jaccard | 곡 단위 장르의 교집합 수 ÷ 합집합 수. 한쪽 목록이 없으면 -1 |
| album_genre_jaccard | 앨범 단위 장르끼리 같은 계산. 곡 단위와 섞지 않음 |
| route_credits | 해당 선택곡의 제작진 경로와 비YouTube 근거가 함께 있으면 1, 아니면 0 |
| route_related_non_youtube / route_similar_non_youtube | 해당 경로와 비YouTube 근거가 함께 있으면 1, 아니면 0 |
| duration_similarity | 짧은 곡 길이 ÷ 긴 곡 길이. 양쪽 길이가 확인되지 않으면 -1 |

0은 제공된 목록에 겹침이 없다는 뜻이지, 누락된 제작진까지 모두 다르다고 확정하는 뜻이 아닙니다.
장르는 표기 정규화 후 정확히 일치하는 이름만 비교합니다. 장르의 상하위 관계나 소리 유사도를 추정하지 않습니다.
YouTube 근거는 X에서 제외하며, 선택곡/후보의 카탈로그 출처가 YouTube인 평가 행은 학습 대상에서 제외합니다.
이는 데이터 사용권 전반에 대한 법적 보증이 아닙니다. 각 제공자의 사용 조건은 별도 확인 대상입니다.

## Y·학습·검증

- 화면에 실제 노출될 때 X와 선택곡/세션/기존 점수를 고정 저장합니다. 느리게 추가된 메타데이터로 과거 X를 덮어쓰지 않습니다.
- 좋아요=1, 싫어요=0. 스킵·무응답은 정답으로 쓰지 않습니다. 예전 평가에 새 특징을 소급해서 붙이지 않습니다.
- 내보낸 로컬 JSON을 Python `scripts/train-seed-pair-ranker.py`가 읽습니다. 자동 업로드나 자동 재학습은 없습니다.
- 비교 가능한 한 선택곡 세션 안에 좋아요와 싫어요, 서로 다른 X가 있어야 합니다.
- 최소 80개의 실제 평가, 비교 가능한 세션 20개가 있어야 실험을 시작합니다. 성능 보장 수치는 아닙니다.
- 시간순 세션 단위 70% train / 15% validation / 15% test. train/validation의 뒤늦은 평가가 다음 구간을 침범하면 해당 세션을 제외합니다.
- CatBoostRanker, PairLogitPairwise, 최대 350회, 깊이 4. validation의 NDCG@10으로 조기 종료/최적 반복 수를 정합니다. test는 학습에 사용하지 않습니다.
- 기존 순위, 제작진만, CatBoost만, 80:20의 NDCG@10을 비교합니다. 학습에서 못 본 후보 아티스트만의 검사도 별도로 기록합니다. 표본이 없으면 검증 불가로 표시합니다.
- 실제 노출된 평가만 사용하므로 노출 편향이 남습니다. 이를 전체 음악 카탈로그 성능으로 일반화할 수 없습니다.

사용 예(작업 폴더에서, CatBoost·NumPy가 설치된 Python 사용):

```text
python scripts/train-seed-pair-ranker.py --input <내보낸-평가.json> --output work/<새-실험-폴더> --model-id <모델-이름>
```

출력은 `candidate-model.json`과 `evaluation.json`이며 기존 출력은 덮어쓰지 않습니다.
`evaluation.json`에서 실제 나무 수, 학습 곡선, 구간별 행/세션 수, 비교 성능을 볼 수 있습니다.
출력 모델은 언제나 `approved:false`입니다. 검증·소스 사용 조건·새 아티스트 성능을 검토한 후에만 승인해야 합니다.
검토된 모델의 별도 배치 위치는 `work/station-seed-ranker.json`입니다. 배포 빌드 전에 승인된 파일을 배치해야 합니다.
모델/평가 파일·개인 반응은 Git에 올리지 않습니다. 공개 서버에 모델 파일이 배치됐는지는 별도 확인이 필요합니다.

브라우저는 승인된 숫자 나무만 읽어 점수를 계산합니다. Python 서버를 매 추천마다 호출하지 않습니다.
학습 목록에 없는 곡도 같은 X가 있으면 평가할 수 있지만, 메타데이터가 거의 없는 새 곡의 품질까지 보장하지 않습니다.

## 검증 명령

```text
node scripts/test-seed-pair-ranker.cjs
python scripts/test-seed-pair-training.py work/<새-테스트-파일.json>
node scripts/test-seed-pair-ranker.cjs work/<새-테스트-파일.json>
```

두 번째 명령은 **합성 숫자로 구현만 검사**합니다. 실제 서비스용 학습/성능 평가가 아닙니다.
세 번째 명령은 Python CatBoost와 브라우저용 계산 결과가 같은지 검증합니다.

기술 기준: [CatBoost의 검증 세트·최적 반복 수](https://catboost.ai/docs/en/concepts/parameter-tuning), [모델 scale/bias](https://catboost.ai/docs/en/concepts/cli-reference_normalize-model).
