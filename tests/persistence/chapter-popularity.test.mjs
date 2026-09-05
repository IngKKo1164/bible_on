import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createEmptyChapterPopularityData,
  normalizeChapterPopularityData,
  rankChapterPopularity,
  recordUniqueChapterAccess,
} from '../../src/data/chapterPopularity.js';

const philippians4 = { bookId: 'philippians', chapter: 4, reference: '빌립보서 4장' };

test('a chapter is counted only once per account-scoped Seoul date', () => {
  const first = recordUniqueChapterAccess(createEmptyChapterPopularityData(), philippians4, '2026-09-05');
  const duplicate = recordUniqueChapterAccess(first, philippians4, '2026-09-05');
  const nextDay = recordUniqueChapterAccess(duplicate, philippians4, '2026-09-06');

  assert.equal(first.days['2026-09-05']['philippians-4'], 1);
  assert.equal(duplicate, first);
  assert.equal(nextDay.days['2026-09-06']['philippians-4'], 1);
  assert.equal(rankChapterPopularity(nextDay, ['2026-09-05', '2026-09-06'])[0].count, 2);
});

test('legacy verse-interaction popularity is not misreported as chapter access', () => {
  const legacy = { version: 1, days: { '2026-09-05': { 'john-3-16': 1 } }, verses: {} };
  assert.deepEqual(normalizeChapterPopularityData(legacy), createEmptyChapterPopularityData());
});

test('chapter rankings sort by access count and preserve chapter metadata', () => {
  let data = createEmptyChapterPopularityData();
  data = recordUniqueChapterAccess(data, philippians4, '2026-09-05');
  data = recordUniqueChapterAccess(data, philippians4, '2026-09-06');
  data = recordUniqueChapterAccess(data, { bookId: 'psalms', chapter: 23, reference: '시편 23장' }, '2026-09-06');

  assert.deepEqual(
    rankChapterPopularity(data, ['2026-09-05', '2026-09-06']).map(({ chapterKey, count }) => [chapterKey, count]),
    [['philippians-4', 2], ['psalms-23', 1]]
  );
});
