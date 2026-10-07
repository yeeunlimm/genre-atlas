// Server/local only. Optional user-supplied dictionary; never bundle its contents.
// This is a conservative signed heuristic, NOT a probability or a trained model.
import {readFile, stat} from 'node:fs/promises';
import {isAbsolute} from 'node:path';

export const KOREAN_REVIEW_METHOD = 'ko-lexicon-v1';
const clean = value => value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
const letter = /[\p{L}\p{N}]/u;
const fillers = new Set(('얼굴 몸매 그냥 언니 진짜 너무 정보 에이블리 유행 어서 정말 완전 매우 조금 약간 지금 오늘 여기 저기 이번 사실 모두 항상 또한 그리고 하지만 그런데 그래서 저런 이런 어떤 뭔가').split(' '));
// Do not turn word_root stems into substring matches or count bare adjective roots.
const stems = new Set(('좋 싫 나쁘 아름답 멋지 멋있 지루 훌륭 슬프 기쁘 즐겁 행복하 불쾌하').split(' '));
const ambiguous = /소름|중독|미친|미쳤|눈물|울컥/u;
const nounSuffixWords = new Set(['최고', '최악', '감동', '명곡', '졸작', '걸작', '실망']);
const nounSuffix = /^(?:은|는|이|가|을|를|도|만|의|이다|입니다|이네요|이야|예요|이에요|네요|야)(?=$|[^\p{L}\p{N}])/u;
const politeSuffix = /^(?:요|네요|군요|죠)(?=$|[^\p{L}\p{N}])/u;
const boundary = '(?=$|[^\\p{L}\\p{N}])';
const music = new RegExp('(?<![\\p{L}\\p{N}])(?:노래|곡|보컬|멜로디|비트|음악|사운드|가사|후렴|베이스)(?:(?:은|는|이|가|을|를|의|도|만|와|과|에서|에|부터|까지))?' + boundary, 'u');
// Abstain on mixed subjects: a nearby song mention cannot attach praise to a face,
// outfit, food, weather, video, dance, etc. Coverage is intentionally conservative.
const otherTopic = new RegExp('(?<![\\p{L}\\p{N}])(?:얼굴|몸매|외모|용모|의상|옷|헤어|자켓|재킷|언니|오빠|영상|뮤비|춤|댄스|음식|밥|점심|식당|맛집|날씨|경치|영화|드라마|사람|에이블리)(?:[가-힣]*)' + boundary, 'u');
const spam = /https?:|www\.|subscribe|my channel|구독|맞구독|홍보|광고|출석|(?:202\d|누가|누구).{0,20}(?:듣|있나요)|아직.{0,12}듣/iu;
const generalNegation = /(?<![가-힣])(?:안|못)(?=\s|좋)|않|아니|없|못하/gu;
const unsupportedReversal = /아니|않.{0,12}않|안\s+안|않.{0,12}없/u;

// Explicit, reviewable music-language additions approved for this optional path.
// +1 means a modest positive heuristic, not a likelihood/confidence measurement.
// Ambiguous expressions outside these complete phrases are excluded from lookup.
const musicPhrases = [
  {pattern: /(?:노래|곡|음악)(?:가|이|는|은)?\s+미쳤다/gu, polarity: 1},
  {pattern: /중독성(?:이)?\s+있다/gu, polarity: 1},
  {pattern: /소름(?:이)?\s+돋는\s+보컬/gu, polarity: 1},
];
// Explicit negation of 좋다. These phrases cover spacing/polite variants without
// matching the positive 좋아/좋다 inside them. Other negation patterns abstain.
const negativeGood = /(?:안\s*좋(?:아요|아|다|은|네요|습니다|음)|좋지\s*(?:않(?:아요|아|다|은|네요|습니다)|못(?:하다|해요|한)))/gu;

function endsAtBoundary(text, end, word) {
  if (end === text.length || !letter.test(text[end])) return true;
  const suffix = text.slice(end);
  return politeSuffix.test(suffix) || (nounSuffixWords.has(word) && nounSuffix.test(suffix));
}

function phraseMatches(text, pattern, polarity) {
  return [...text.matchAll(pattern)].filter(match => (match.index === 0 || !letter.test(text[match.index - 1]))
    && endsAtBoundary(text, match.index + match[0].length, match[0]))
    .map(match => ({start: match.index, end: match.index + match[0].length, polarity, word: match[0], explicitNegation: polarity < 0}));
}

export function buildKoreanReviewLexicon(rows) {
  if (!Array.isArray(rows)) throw new TypeError('Expected a dictionary row array.');
  const profile = {inputRows: rows.length, invalidRows: 0, uniqueWords: 0, duplicateRows: 0,
    conflictingWords: 0, excludedWords: 0, neutralWords: 0, usableWords: 0, rootFieldIgnored: true};
  const grouped = new Map();
  for (const row of rows) {
    const word = typeof row?.word === 'string' ? clean(row.word) : '';
    const polarity = typeof row?.polarity === 'number' || (typeof row?.polarity === 'string' && row.polarity.trim()) ? Number(row.polarity) : NaN;
    if (!word || word.length > 200 || !Number.isFinite(polarity) || Math.abs(polarity) > 2) { profile.invalidRows++; continue; }
    if (grouped.has(word)) { grouped.get(word).add(polarity); profile.duplicateRows++; }
    else grouped.set(word, new Set([polarity]));
  }
  profile.uniqueWords = grouped.size;
  const trie = new Map();
  for (const [word, polarities] of grouped) {
    if (polarities.size !== 1) { profile.conflictingWords++; continue; }
    const polarity = [...polarities][0];
    if (!polarity) { profile.neutralWords++; continue; }
    if (word.length < 2 || !/^[가-힣]+(?: [가-힣]+)*$/u.test(word) || fillers.has(word) || stems.has(word) || ambiguous.test(word)) {
      profile.excludedWords++; continue;
    }
    let branch = trie, node;
    for (const character of word) {
      if (!branch.has(character)) branch.set(character, {next: new Map()});
      node = branch.get(character); branch = node.next;
    }
    node.entry = {word, polarity};
    profile.usableWords++;
  }

  function score(text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1200 || !profile.usableWords) return null;
    const normalized = text.normalize('NFKC');
    if (!music.test(normalized) || spam.test(normalized) || otherTopic.test(normalized)) return null;
    const values = [], used = new Set();
    // An opinion in a separate sentence with no music subject is not evidence.
    for (const raw of normalized.split(/[.!?。！？;；\n\r]+/u)) {
      const clause = clean(raw);
      if (!music.test(clause) || unsupportedReversal.test(clause)) continue;
      const negated = [...clause.matchAll(generalNegation)].length > 0;
      const matches = phraseMatches(clause, negativeGood, -2);
      if (!negated) for (const rule of musicPhrases) matches.push(...phraseMatches(clause, rule.pattern, rule.polarity));
      for (let start = 0; start < clause.length; start++) {
        if (start && letter.test(clause[start - 1])) continue;
        let branch = trie;
        for (let end = start; end < clause.length; end++) {
          const node = branch.get(clause[end]);
          if (!node) break;
          branch = node.next;
          if (!node.entry || !endsAtBoundary(clause, end + 1, node.entry.word)) continue;
          const explicitNegation = /안\s*좋|좋지\s*(?:않|못)/u.test(node.entry.word);
          if (negated && !(explicitNegation && node.entry.polarity < 0)) continue;
          matches.push({start, end: end + 1, ...node.entry, explicitNegation});
        }
      }
      // Longest complete phrase wins; its constituent words cannot vote again.
      matches.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
      const accepted = [];
      for (const match of matches) {
        if (accepted.some(other => match.start < other.end && match.end > other.start)) continue;
        accepted.push(match);
        // Repetition is not extra evidence. Different non-overlapping expressions
        // retain their original signed polarity; the average is divided by two.
        if (!used.has(match.word)) { used.add(match.word); values.push(match.polarity / 2); }
      }
    }
    if (!values.length) return null;
    return {score: Math.max(-1, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length)), method: KOREAN_REVIEW_METHOD};
  }
  return {profile: Object.freeze(profile), score};
}

let cached;
export async function loadKoreanReviewLexicon() {
  const file = process.env.SENTIMENT_LEXICON_PATH?.trim();
  if (!file || !isAbsolute(file)) return null;
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > 20 * 1024 * 1024) return null;
    const identity = file + '\0' + info.mtimeMs + '\0' + info.size;
    if (cached?.identity !== identity) {
      cached = {identity, promise: readFile(file, 'utf8').then(source => buildKoreanReviewLexicon(JSON.parse(source.replace(/^\uFEFF/u, '')))).catch(() => null)};
    }
    return await cached.promise;
  } catch { return null; } // Optional file unavailable: abstain, never use English.
}

export async function scoreKoreanMusicReview(text) {
  return (await loadKoreanReviewLexicon())?.score(text) ?? null;
}
