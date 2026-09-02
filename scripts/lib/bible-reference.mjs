import { bibleCatalog } from '../../src/bibleData.js';

const OSIS_BOOK_CODES = [
  'Gen', 'Exod', 'Lev', 'Num', 'Deut', 'Josh', 'Judg', 'Ruth', '1Sam', '2Sam',
  '1Kgs', '2Kgs', '1Chr', '2Chr', 'Ezra', 'Neh', 'Esth', 'Job', 'Ps', 'Prov',
  'Eccl', 'Song', 'Isa', 'Jer', 'Lam', 'Ezek', 'Dan', 'Hos', 'Joel', 'Amos',
  'Obad', 'Jonah', 'Mic', 'Nah', 'Hab', 'Zeph', 'Hag', 'Zech', 'Mal', 'Matt',
  'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph', 'Phil',
  'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb', 'Jas',
  '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
];

if (OSIS_BOOK_CODES.length !== bibleCatalog.length) {
  throw new Error('The OSIS book catalog must match the 66-book Bible catalog.');
}

export const referenceBookCatalog = bibleCatalog.map((book, index) => ({
  ...book,
  osis: OSIS_BOOK_CODES[index],
  order: index + 1,
}));

const booksByOsis = new Map(
  referenceBookCatalog.map((book) => [book.osis.toLowerCase(), book]),
);
const booksById = new Map(referenceBookCatalog.map((book) => [book.id, book]));

function assertPositiveInteger(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new Error(`Invalid ${label}: ${value}`);
}

export function getReferenceBookById(bookId) {
  const book = booksById.get(bookId);
  if (!book) throw new Error(`Unknown Bible book ID: ${bookId}`);
  return book;
}

export function makeCanonicalVerseId(bookOrCode, chapter, verse) {
  const book = typeof bookOrCode === 'string'
    ? booksByOsis.get(bookOrCode.toLowerCase()) ?? booksById.get(bookOrCode)
    : bookOrCode;
  if (!book) throw new Error(`Unknown Bible book: ${bookOrCode}`);
  assertPositiveInteger(chapter, 'chapter');
  assertPositiveInteger(verse, 'verse');
  return `${book.osis}.${chapter}.${verse}`;
}

function parseReferencePoint(value, fallback = null) {
  const fullMatch = value.match(/^([1-3]?[A-Za-z]+)\.(\d+)\.(\d+)$/);
  if (fullMatch) {
    const book = booksByOsis.get(fullMatch[1].toLowerCase());
    if (!book) throw new Error(`Unknown OSIS book code: ${fullMatch[1]}`);
    const chapter = Number.parseInt(fullMatch[2], 10);
    const verse = Number.parseInt(fullMatch[3], 10);
    return { book, chapter, verse, id: makeCanonicalVerseId(book, chapter, verse) };
  }

  const chapterVerseMatch = fallback && value.match(/^(\d+)\.(\d+)$/);
  if (chapterVerseMatch) {
    const chapter = Number.parseInt(chapterVerseMatch[1], 10);
    const verse = Number.parseInt(chapterVerseMatch[2], 10);
    return {
      book: fallback.book,
      chapter,
      verse,
      id: makeCanonicalVerseId(fallback.book, chapter, verse),
    };
  }

  const verseMatch = fallback && value.match(/^(\d+)$/);
  if (verseMatch) {
    const verse = Number.parseInt(verseMatch[1], 10);
    return {
      book: fallback.book,
      chapter: fallback.chapter,
      verse,
      id: makeCanonicalVerseId(fallback.book, fallback.chapter, verse),
    };
  }

  throw new Error(`Invalid Bible reference point: ${value}`);
}

function compareReferencePoints(left, right) {
  return left.book.order - right.book.order
    || left.chapter - right.chapter
    || left.verse - right.verse;
}

export function parseOpenBibleReference(value) {
  const normalized = value.trim().replace(/[–—]/g, '-');
  if (!normalized) throw new Error('Bible reference cannot be empty.');

  const [startValue, endValue, ...extra] = normalized.split('-');
  if (extra.length) throw new Error(`Invalid Bible reference range: ${value}`);

  const start = parseReferencePoint(startValue);
  const end = endValue ? parseReferencePoint(endValue, start) : start;
  if (compareReferencePoints(start, end) > 0) {
    throw new Error(`Bible reference range is reversed: ${value}`);
  }

  return {
    raw: value,
    start: {
      id: start.id,
      bookCode: start.book.osis,
      bookId: start.book.id,
      chapter: start.chapter,
      verse: start.verse,
    },
    end: {
      id: end.id,
      bookCode: end.book.osis,
      bookId: end.book.id,
      chapter: end.chapter,
      verse: end.verse,
    },
    isRange: start.id !== end.id,
  };
}

export function formatCanonicalRange(startId, endId = startId) {
  return startId === endId ? startId : `${startId}-${endId}`;
}
