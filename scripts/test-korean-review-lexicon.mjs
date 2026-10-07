import assert from 'node:assert/strict';
import {buildKoreanReviewLexicon, loadKoreanReviewLexicon, scoreKoreanMusicReview} from '../lib/korean-review-lexicon.mjs';

// Small synthetic regression fixtures, not a copied dictionary or quality benchmark.
const word = (text, polarity, root = text) => ({word: text, polarity: String(polarity), word_root: root});
const lexicon = buildKoreanReviewLexicon([
  word('좋다', 2, '좋'), word('좋아', 2), word('좋은', 2), word('최고', 2), word('최악', -2),
  word('아쉽다', -1), word('담백하다', .5), word('지루하다', -1, '지루'), word('지루하고 싫다', -1), word('싫다', -2),
  word('좋지 않다', -2), word('안 좋은', -2), word('아름다운', 2), word('좋은 느낌', 1),
  word('울컥하다', -2), word('울컥하다', -1), word('좋다', 2),
  ...['얼굴', '몸매', '그냥', '언니', '진짜', '너무', '정보', '에이블리', '유행', '어서'].map(text => word(text, 2)),
  ...['소름', '소름이 돋는', '중독', '미친', '눈물'].map(text => word(text, -2)),
  word('지루', -1), word('좋', 2), word('(^^)', 2), word('ㅋㅋ', 2), word('보통', 0),
  {word: 'bad-polarity', polarity: 'invalid'}, {word_root: '날조', polarity: '2'},
]);
const score = text => lexicon.score(text)?.score ?? null;
assert.equal(lexicon.profile.conflictingWords, 1);
assert.equal(lexicon.profile.duplicateRows, 2);
assert.equal(lexicon.profile.invalidRows, 2);
assert.equal(lexicon.profile.rootFieldIgnored, true);
assert.equal(score('이 노래 정말 좋다!'), 1);
assert.equal(score('이 곡은 좋아요'), 1);
assert.equal(score('보컬은 최고입니다'), 1);
assert.equal(score('음악이 최악이다'), -1);
assert.equal(score('이 곡은 아쉽다'), -.5);
assert.equal(score('이 곡은 담백하다'), .25, 'fractional custom polarity is preserved');
assert.equal(score('비트가 지루하다'), -.5);
assert.equal(score('이 음악은 지루하고 싫다'), -.5, 'long phrase excludes shorter negative substring');
assert.equal(score('이 노래는 좋은 느낌'), .5, 'long phrase retains original polarity');
assert.equal(score('노래가 좋다 좋다 아쉽다'), .25, 'repeated word receives one vote');
assert.equal(score('노래 좋다 최악이다'), 0, 'zero remains non-positive');
for (const text of ['노래 안좋다', '노래 안 좋다', '이 곡은 안 좋아요', '노래 좋지않다', '음악이 좋지 않다', '좋지 않은 노래']) assert.equal(score(text), -1, text);
for (const text of ['노래 최고는 아니다', '노래 안 좋은 건 아니다', '노래 좋다고 할 수 없다', '노래 안 싫다', '노래 좋지 않다고는 못하겠다']) assert.equal(score(text), null, text);
for (const text of ['노래 미쳤다', '이 노래는 중독성이 있다', '소름 돋는 보컬', '소름이 돋는 보컬']) assert.ok(score(text) > 0, text);
for (const text of ['노래 소름', '노래 중독', '노래 미친', '노래 눈물', '노래 울컥하다', '노래 지루', '노래 좋', '노래 보통']) assert.equal(score(text), null, text);
for (const text of ['얼굴 좋다', '이 노래 얼굴 몸매 최고', '노래가 좋다. 얼굴 최고', '노래 듣다가 밥이 좋다', '노래가 좋고 영상이 최고', '이 곡은 그냥 정보 진짜 너무 어서', '이 노래 (^^) ㅋㅋ', '노래입니다. 오늘은 좋다', '왜곡 최고', '곡물 최고', '보컬로이드 최고', '노래최고', 'music is great']) assert.equal(score(text), null, text);
for (const text of ['노래 좋다 https://example.com', '노래 좋다 www.example.com', '노래 최고 구독해주세요', '2026년에 이 노래 듣는 사람', '노래 최고 '.repeat(201)]) assert.equal(score(text), null, text);
assert.equal(buildKoreanReviewLexicon([]).score('노래 미쳤다'), null, 'missing dictionary must not invent evidence');
assert.equal(buildKoreanReviewLexicon([word('충돌', 2), word('충돌', -1)]).score('노래 충돌'), null);
assert.equal(buildKoreanReviewLexicon([word('좋다', 2, '좋')]).score('노래 좋음'), null, 'word_root must never generate matches');
assert.deepEqual(Object.keys(lexicon.score('노래 좋다')).sort(), ['method', 'score']);
assert.equal(lexicon.score('노래 좋다').method, 'ko-lexicon-v1');
for (const text of ['노래 좋다', '노래 최악이다', '노래 좋다 최악이다']) {
  const result = lexicon.score(text);
  assert.ok(result.score >= -1 && result.score <= 1);
  assert.ok(!('positive' in result) && !('negative' in result), 'signed scores are not model probabilities');
}
const oldPath = process.env.SENTIMENT_LEXICON_PATH;
try {
  delete process.env.SENTIMENT_LEXICON_PATH;
  assert.equal(await loadKoreanReviewLexicon(), null);
  assert.equal(await scoreKoreanMusicReview('노래 좋다'), null);
  process.env.SENTIMENT_LEXICON_PATH = 'relative-unconfigured-dictionary.json';
  assert.equal(await scoreKoreanMusicReview('노래 좋다'), null);
} finally {
  if (oldPath === undefined) delete process.env.SENTIMENT_LEXICON_PATH;
  else process.env.SENTIMENT_LEXICON_PATH = oldPath;
}
console.log('PASS: Korean lexicon signed heuristic; music context, original scores, longest non-overlap, explicit negation, abstention, duplicate conflicts, no dictionary fallback, no probabilities. No network or supplied dictionary copied.');
