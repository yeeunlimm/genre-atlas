# Genre Atlas 구조와 요청·응답

2026-10-08 코드 기준. 현재 서비스는 Next.js / React / TypeScript와 Vercel을 사용하고, CatBoost 학습은 Python에서 별도로 수행한다.

![Genre Atlas 요청·응답 구조도](architecture.png)

[편집 가능한 HTML 그림](architecture.html) · 아래 표는 그림에서 줄여 표시한 API의 상세 계약이다. 그림은 8개 구성요소로 요약했으며 로그인 왕복·개별 출처 재시도·캐시는 생략했다.

## 세 개의 경로

### 1. 아티스트 탐색

브라우저가 아티스트 이름을 서버에 보내면 YouTube Music에서 후보를 찾는다. 아티스트를 선택하면 관련 가수를 반환한다. 장르와 발매 목록은 별도 요청이며, 장르 조회는 NamuWiki를 우선하고 실패/정보 누락 시 MusicBrainz로 보완한다. 출처마다 지표가 다르므로 관련 가수의 월간 청취 규모와 장르 투표 수를 같은 의미로 다루지 않는다.

### 2. 선택한 한 곡에서 추천

브라우저에서 Apple·Deezer 검색 결과를 모으고 필요하면 MusicBrainz에서 다른 버전을 찾는다. 선택한 녹음의 제작진·샘플 연결을 먼저 수집한다. 연결 후보가 없는 경우의 관련 아티스트 경로는 실제 소리 유사도를 증명하지 않는다.

서버는 배포용 숫자 모델을 제공하고, **브라우저가 CatBoost 순위 점수를 계산**한다. 모델은 후보를 수집하지 않는다. 곡 장르가 있는 등 적용 조건을 만족할 때 연결 점수 80% + ML 점수 20%를 사용한다. 모델/메타데이터가 없으면 기존 규칙을 유지한다. 일반 곡 추천은 댓글 감성분석을 호출하지 않는다.

### 3. 찜으로 만드는 플레이리스트

카카오 로그인은 Supabase Auth를 경유한다. 브라우저의 최근 찜 최대 5곡에서 별도로 후보를 수집하고 최대 20곡을 고정한다. 서버에 후보의 제목·가수·길이를 보내면, 서버가 계정을 확인한 뒤 YouTube 영상을 매칭하고 영상당 최대 50개 댓글을 조회·분석한다.

서버는 곡별 결과를 한 줄씩 보내는 **NDJSON 응답**으로 진행 상황을 전달한다. 브라우저는 양수인 점수를 우선 정렬하고 아티스트당 1곡, 최대 10곡을 선택한다. 모든 매칭 영상의 댓글이 비활성화/비어 있을 때만 미분석 0점 예외를 허용한다. API 오류나 분석된 중립·부정 결과를 이 예외로 바꾸지 않는다.

## 주요 API 계약

아래는 설명을 위해 필드를 줄인 계약이다. 개인 계정값이나 실제 댓글 원문을 담은 응답 예시가 아니다.

| 작업 | 요청 | 주요 응답 |
| --- | --- | --- |
| 가수 검색 | `GET /api/music?kind=search&q=Tame%20Impala` | `artists`, `provider`, `state`, `notice` |
| 관련 가수 | `GET /api/music?kind=artist&q=<artist-id>&name=<name>` | `artist`, `related`, `provider`, `state` |
| 가수의 장르 | `GET /api/artist-genres?title=<name>` | 장르 목록, 출처·안내 |
| 장르별 가수 | `GET /api/genre?title=<genre-id>&offset=0` | `artists`, `nextOffset` |
| 발매 목록 | `GET /api/releases?artist=<name>&provider=musicbrainz&offset=0` | 발매 목록 또는 동명이인 선택지 |
| 앨범 상세 | `GET /api/releases?kind=album&provider=<provider>&id=<id>` | 앨범 정보·수록곡 |
| 곡 검색 | `GET /api/station?q=<title+artist>&catalog=apple&limit=40` | `tracks`, `provider`, `canExpand`, `warning` |
| 연결 후보 | `GET /api/station?id=<recording-id>&offset=0` | `seed`, `rows`, `status`, `notes`, `nextOffset` |
| 별도 후보 출처 | `GET /api/station/discover?id=<id>&route=related-artists&offset=0` | `rows`, `state`, `note`, `nextOffset`; `similar-tracks` 경로도 지원 |
| 순위 모델 | `GET /api/station/ranking` | `status`, `artifact`, `deploymentMode`, `qualityImprovementVerified` |
| 분석 가능 여부 | 인증된 `GET /api/station/reviews` | `ready`, `reason`, 후보·선택 개수 상한 |
| 댓글 분석 | 인증된 `POST /api/station/reviews`, `{tracks:[{title,artist,durationMs}]}` | `progress`(곡별 결과), `heartbeat`, `complete` 이벤트 |

댓글 분석 요청은 로그인 토큰과 같은 사이트에서 보낸 요청인지 확인한다. 빈 목록·20곡 초과·잘못된 입력은 거절한다. 취소하거나 응답이 중간에 끊기면 완성된 플레이리스트로 저장하지 않는다.

## 머신러닝 학습과 실행의 경계

| 구분 | 오프라인 Python 학습 | 웹 실행 |
| --- | --- | --- |
| 입력 | ListenBrainz 공개 평가·장르·길이·아티스트 표본 | 선택곡과 후보곡의 장르·길이 |
| 처리 | 사용자 단위 Train/Validation/Test 분리, CatBoostRanker 학습·검사 | 56개 특징 생성, 배포된 98개 숫자 트리 계산 |
| 출력 | 평가 결과, 승인 전 모델, 비교 자료 | 후보 순위 점수, 기존 연결 점수와 혼합 |
| 공개 범위 | 원본 평가 행·사용자 ID·학습표 제외 | 승인된 숫자 모델만 API로 제공 |

Test NDCG@10은 CatBoost 0.7681, 단순 장르 겹침 0.7699였다. **개선이 입증된 모델이 아니라 실험 운영 중인 모델**이다. 댓글 감성분석에 쓰는 영어 모델은 사전학습 모델이며, 이 CatBoost 모델과 다르다. [학습 상세](song-context-ranking.md)

## 저장·보안·실행 한계

- **브라우저:** 계정별 찜, 후보 스냅샷, 선택 결과, 반복 제외 이력. 온보딩 닫기 여부는 별도 키이며 계정 데이터에 손대지 않는다.
- **Supabase:** 로그인·세션 검증. 현재 찜/플레이리스트를 Supabase 데이터베이스에 동기화하지 않는다.
- **Vercel 서버:** 외부 서비스 키, 댓글 조회·감성분석, 일시적인 결과 캐시. 댓글 원문은 실행 중 메모리에서 처리하며 저장소에 기록하지 않는다.
- **캐시:** 실행 중인 서버 인스턴스 내부의 캐시일 뿐, 영구 저장이나 매일 예약 실행이 아니다. 동시 요청 제한도 전 서버에 걸친 분산 작업 큐가 아니다.
- **외부 서비스:** 정보 누락, 요청 한도, 댓글 비활성화, 서버 차단이 발생할 수 있다. 이를 긍정 평가로 바꾸지 않고 UI에 상태를 전달한다.

## 코드에서 확인하기

- 화면·탐색: [app/page.tsx](../app/page.tsx), [hybrid-discovery-station.tsx](../components/hybrid-discovery-station.tsx)
- 후보·플레이리스트: [liked-playlist.tsx](../components/liked-playlist.tsx), [reviews API](../app/api/station/reviews/route.ts)
- 웹 ML: [use-seed-ranker.ts](../components/use-seed-ranker.ts), [catboost-seed-ranker.ts](../lib/catboost-seed-ranker.ts)
- Python 학습: [train-song-context-ranker.py](../scripts/train-song-context-ranker.py)
- 감성분석 계약·오류 처리: [review-playlists.md](review-playlists.md)
