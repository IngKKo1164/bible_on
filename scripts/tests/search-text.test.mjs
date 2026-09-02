import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBm25Index,
  expandQueryForSearch,
  expandQueryForEmbedding,
  normalizeSearchText,
  passageSearchText,
  scorePassageSegments,
  searchBm25,
  tokenizeForSearch,
} from '../lib/search-text.mjs';

const translation = { id: 'RNKSV', label: '새번역' };

function passage(id, embeddingText, segments) {
  return {
    id,
    translation,
    book: { name: '테스트' },
    chapter: 1,
    heading: null,
    content: embeddingText,
    embeddingText,
    contentSegments: segments,
  };
}

test('normalizes punctuation and emits Korean word and character-gram tokens', () => {
  assert.equal(normalizeSearchText('  사랑, 믿음! LOVE  '), '사랑 믿음 love');
  assert.deepEqual(tokenizeForSearch('사랑'), [
    'w:사랑',
    'g2:사랑',
  ]);
  assert.deepEqual(tokenizeForSearch('하나님'), [
    'w:하나님',
    'g2:하나',
    'g2:나님',
    'g3:하나님',
  ]);
});

test('expresses recommendation intent as natural language for semantic retrieval', () => {
  assert.match(expandQueryForEmbedding('걱정될 때'), /평안과 위로/);
  assert.match(expandQueryForEmbedding('다른 사람을 용서하고 싶어요'), /서로 용서/);
  assert.equal(expandQueryForEmbedding('태초에 천지를 창조'), '태초에 천지를 창조');
});

test('omits ambiguous GAE Psalm music-director headings only from retrieval text', () => {
  const target = {
    translation: { id: 'GAE' },
    book: { name: '시편' },
    chapter: 42,
    heading: '고라 자손의 마스길, 인도자를 따라 부르는 노래',
    content: '내 영혼아 네가 어찌하여 낙심하는가',
  };
  const text = passageSearchText(target);

  assert.doesNotMatch(text, /인도자/);
  assert.match(text, /낙심/);
});

test('expands only recognized recommendation intents with Bible-domain vocabulary', () => {
  assert.match(expandQueryForSearch('걱정될 때'), /염려/);
  assert.match(expandQueryForSearch('다른 사람을 용서하기 어려울 때'), /서로 용서/);
  assert.match(expandQueryForSearch('길을 잃은 기분이에요'), /등불/);
  assert.equal(expandQueryForSearch('태초에 천지를 창조'), '태초에 천지를 창조');
});

test('BM25 ranks a passage containing the exact Korean phrase first', () => {
  const passages = [
    passage('p1', '창세기 1장 태초에 하나님이 천지를 창조하셨다', []),
    passage('p2', '시편 23편 주님은 나의 목자시니', []),
    passage('p3', '고린도전서 13장 사랑은 오래 참고 친절합니다', []),
  ];
  const index = buildBm25Index(passages);
  const results = searchBm25(index, '사랑은 오래 참고', { translationId: 'RNKSV' });

  assert.equal(results[0].passageId, 'p3');
  assert(results[0].score > 0);
});

test('segment matching returns canonical seed verses in relevance order', () => {
  const target = passage('p1', '', [
    { text: '아무 것도 염려하지 말고 기도하십시오', canonicalIds: ['Phil.4.6'] },
    { text: '하나님의 평화가 마음을 지킬 것입니다', canonicalIds: ['Phil.4.7'] },
  ]);

  assert.deepEqual(
    scorePassageSegments('염려하지 말고 기도', target),
    ['Phil.4.6'],
  );
});
