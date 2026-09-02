import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bibleCatalog } from '../src/bibleData.js';

const translations = [
  { id: 'GAE', directory: 'gae', label: '개역개정' },
  { id: 'RNKSV', directory: 'rnksv', label: '새번역' },
];
const allowedOmissions = {
  GAE: new Set(['acts.24.7']),
  RNKSV: new Set([
    'acts.8.37', 'acts.15.34', 'acts.24.7', 'acts.28.29',
    'luke.17.36', 'luke.23.17',
    'mark.9.44', 'mark.9.46', 'mark.11.26', 'mark.15.28',
    'matthew.17.21', 'matthew.18.11', 'matthew.23.14',
    'romans.16.24',
  ]),
};
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const dataRoot = path.resolve(scriptDirectory, '..', 'public', 'data', 'bible');
const expectedChapterCount = bibleCatalog.reduce((sum, book) => sum + book.chapters, 0);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function validateTranslation(translation) {
  let chapterCount = 0;
  let verseCount = 0;
  let headingCount = 0;
  let footnoteCount = 0;
  const foundOmissions = new Set();

  for (const book of bibleCatalog) {
    const filePath = path.join(dataRoot, translation.directory, `${book.file}.json`);
    const data = JSON.parse(await readFile(filePath, 'utf8'));
    assert(data.schemaVersion === 1, `${translation.label} ${book.name}: 지원하지 않는 스키마입니다.`);
    assert(data.translation?.id === translation.id, `${translation.label} ${book.name}: 번역본 ID가 다릅니다.`);
    assert(data.book?.id === book.id, `${translation.label} ${book.name}: 책 ID가 다릅니다.`);
    assert(data.chapters?.length === book.chapters, `${translation.label} ${book.name}: 장 수가 다릅니다.`);

    data.chapters.forEach((chapter, chapterIndex) => {
      const reference = `${translation.label} ${book.name} ${chapterIndex + 1}장`;
      assert(chapter.chapter === chapterIndex + 1, `${reference}: 장 번호가 순서와 다릅니다.`);
      assert(Array.isArray(chapter.verses) && chapter.verses.length > 0, `${reference}: 절이 없습니다.`);
      let expectedVerse = 1;
      chapter.verses.forEach((verse) => {
        while (expectedVerse < verse.verse) {
          const omissionKey = `${book.id}.${chapter.chapter}.${expectedVerse}`;
          assert(allowedOmissions[translation.id].has(omissionKey), `${reference}: ${expectedVerse}절이 없습니다.`);
          foundOmissions.add(omissionKey);
          expectedVerse += 1;
        }
        assert(verse.verse === expectedVerse, `${reference}: ${expectedVerse}절이 중복되거나 역순입니다.`);
        const verseEnd = verse.verseEnd ?? verse.verse;
        assert(verseEnd >= verse.verse, `${reference} ${verse.verse}절: 절 범위가 잘못되었습니다.`);
        assert(
          verseEnd === verse.verse || verse.label === `${verse.verse}-${verseEnd}`,
          `${reference} ${verse.verse}절: 합절 표기가 잘못되었습니다.`,
        );
        assert(typeof verse.text === 'string' && verse.text.trim(), `${reference} ${verse.verse}절: 본문이 비었습니다.`);
        assert(!/[<>]|clickPopUp|class=D2/.test(verse.text), `${reference} ${verse.verse}절: HTML 잔재가 있습니다.`);

        if (verse.segments) {
          const reconstructed = verse.segments
            .filter(({ type }) => type === 'text')
            .map(({ text }) => text)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
          assert(reconstructed === verse.text, `${reference} ${verse.verse}절: 세그먼트와 본문이 다릅니다.`);
          headingCount += verse.segments.filter(({ type }) => type === 'heading').length;
        }
        footnoteCount += verse.footnotes?.length ?? 0;
        expectedVerse = verseEnd + 1;
      });
      chapterCount += 1;
      verseCount += expectedVerse - 1;
    });
  }

  assert(chapterCount === expectedChapterCount, `${translation.label}: ${expectedChapterCount}장이 필요하지만 ${chapterCount}장입니다.`);
  assert(verseCount > 30000, `${translation.label}: 전체 절 수 ${verseCount}은 비정상적으로 적습니다.`);
  assert(headingCount > 500, `${translation.label}: 소제목 수 ${headingCount}은 비정상적으로 적습니다.`);
  assert(
    foundOmissions.size === allowedOmissions[translation.id].size,
    `${translation.label}: 등록된 절 생략 목록과 실제 데이터가 다릅니다.`,
  );
  return { ...translation, books: bibleCatalog.length, chapters: chapterCount, verses: verseCount, headings: headingCount, footnotes: footnoteCount };
}

const summaries = [];
for (const translation of translations) summaries.push(await validateTranslation(translation));

for (const summary of summaries) {
  console.log(`${summary.label}: ${summary.books}권, ${summary.chapters}장, ${summary.verses}절, 소제목 ${summary.headings}개, 각주 ${summary.footnotes}개`);
}
console.log('성경 데이터 검증을 통과했습니다.');
