import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenBibleReference } from '../lib/bible-reference.mjs';
import { buildParagraphsForChapter } from '../lib/rag-corpus.mjs';

test('parses OpenBible verse and range forms into canonical IDs', () => {
  assert.deepEqual(parseOpenBibleReference('Gen.1.1'), {
    raw: 'Gen.1.1',
    start: { id: 'Gen.1.1', bookCode: 'Gen', bookId: 'genesis', chapter: 1, verse: 1 },
    end: { id: 'Gen.1.1', bookCode: 'Gen', bookId: 'genesis', chapter: 1, verse: 1 },
    isRange: false,
  });

  const fullRange = parseOpenBibleReference('Ps.148.4-Ps.148.5');
  assert.equal(fullRange.start.id, 'Ps.148.4');
  assert.equal(fullRange.end.id, 'Ps.148.5');
  assert.equal(fullRange.isRange, true);

  assert.equal(parseOpenBibleReference('John.3.16-18').end.id, 'John.3.18');
  assert.equal(parseOpenBibleReference('John.3.16-4.2').end.id, 'John.4.2');
});

test('rejects reversed or unknown OpenBible references', () => {
  assert.throws(() => parseOpenBibleReference('Unknown.1.1'), /Unknown OSIS book code/);
  assert.throws(() => parseOpenBibleReference('John.3.18-John.3.16'), /reversed/);
});

test('starts a new passage at each source heading without crossing the chapter', () => {
  const result = buildParagraphsForChapter({
    translation: { id: 'RNKSV', label: '새번역', sourceVersion: 'SAENEW' },
    book: { id: 'genesis' },
    chapter: 1,
    source: 'https://example.test/bible',
    verses: [
      { verse: 1, text: '첫째 절' },
      { verse: 2, text: '둘째 절' },
      {
        verse: 3,
        text: '셋째 절',
        segments: [
          { type: 'heading', text: '새 소제목' },
          { type: 'text', text: '셋째 절' },
        ],
      },
      { verse: 4, verseEnd: 5, label: '4-5', text: '합절 본문' },
    ],
  });

  assert.equal(result.verseRecords.length, 4);
  assert.equal(result.passages.length, 2);
  assert.equal(result.passages[0].heading, null);
  assert.deepEqual(result.passages[0].verseIds, ['Gen.1.1', 'Gen.1.2']);
  assert.equal(result.passages[1].heading, '새 소제목');
  assert.deepEqual(result.passages[1].verseIds, ['Gen.1.3', 'Gen.1.4', 'Gen.1.5']);
  assert.equal(result.passages[1].boundary, 'source_heading');
});

test('preserves a heading boundary that appears in the middle of a verse', () => {
  const result = buildParagraphsForChapter({
    translation: { id: 'RNKSV', label: '새번역', sourceVersion: 'SAENEW' },
    book: { id: '1samuel' },
    chapter: 25,
    source: 'https://example.test/bible',
    verses: [
      {
        verse: 1,
        text: '사무엘 본문 다윗 본문',
        segments: [
          { type: 'heading', text: '사무엘의 죽음' },
          { type: 'text', text: '사무엘 본문' },
          { type: 'heading', text: '다윗과 아비가일' },
          { type: 'text', text: '다윗 본문' },
        ],
      },
      { verse: 2, text: '둘째 절' },
    ],
  });

  assert.equal(result.verseRecords.length, 2);
  assert.equal(result.passages.length, 2);
  assert.equal(result.passages[0].heading, '사무엘의 죽음');
  assert.equal(result.passages[0].content, '사무엘 본문');
  assert.deepEqual(result.passages[0].verseIds, ['1Sam.25.1']);
  assert.equal(result.passages[1].heading, '다윗과 아비가일');
  assert.equal(result.passages[1].content, '다윗 본문 둘째 절');
  assert.deepEqual(result.passages[1].verseIds, ['1Sam.25.1', '1Sam.25.2']);
});
