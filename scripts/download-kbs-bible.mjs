import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'cheerio';
import { bibleCatalog } from '../src/bibleData.js';

const SOURCE_URL = 'https://www.bskorea.or.kr/bible/korbibReadpage.php';
const BOOK_CODES = [
  'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki',
  '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng',
  'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo', 'oba', 'jnh', 'mic',
  'nam', 'hab', 'zep', 'hag', 'zec', 'mal', 'mat', 'mrk', 'luk', 'jhn', 'act',
  'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti',
  'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev',
];
const TRANSLATIONS = {
  GAE: { id: 'GAE', directory: 'gae', label: '개역개정' },
  SAENEW: { id: 'RNKSV', directory: 'rnksv', label: '새번역', sourceVersion: 'SAENEW' },
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const outputRoot = path.join(repositoryRoot, 'public', 'data', 'bible');

function parseArguments(argv) {
  const options = {
    force: false,
    concurrency: 2,
    delayMs: 350,
    translations: Object.keys(TRANSLATIONS),
    books: null,
  };

  for (const argument of argv) {
    if (argument === '--force') options.force = true;
    else if (argument.startsWith('--concurrency=')) options.concurrency = Number(argument.split('=')[1]);
    else if (argument.startsWith('--delay=')) options.delayMs = Number(argument.split('=')[1]);
    else if (argument.startsWith('--translations=')) {
      options.translations = argument.split('=')[1].split(',').map((value) => value.trim().toUpperCase());
    } else if (argument.startsWith('--books=')) {
      options.books = new Set(argument.split('=')[1].split(',').map((value) => value.trim().toLowerCase()));
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 4) {
    throw new Error('--concurrency must be an integer from 1 to 4.');
  }
  if (!Number.isFinite(options.delayMs) || options.delayMs < 100) {
    throw new Error('--delay must be at least 100 milliseconds.');
  }
  for (const translation of options.translations) {
    if (!TRANSLATIONS[translation]) throw new Error(`Unknown translation: ${translation}`);
  }

  return options;
}

function normalizeText(value) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function collectVerseSegments($, verseElement) {
  const segments = [];
  let textBuffer = '';

  const flushText = () => {
    const text = normalizeText(textBuffer);
    if (text) segments.push({ type: 'text', text });
    textBuffer = '';
  };

  const visit = (node) => {
    if (node.type === 'text') {
      textBuffer += node.data ?? '';
      return;
    }
    if (node.type !== 'tag') return;

    const element = $(node);
    if (element.hasClass('number') || element.hasClass('comment') || element.hasClass('D2')) return;
    if (element.hasClass('smallTitle')) {
      flushText();
      const headingText = normalizeText(element.text());
      if (headingText) segments.push({ type: 'heading', text: headingText });
      return;
    }
    if (node.name === 'br') {
      textBuffer += ' ';
      return;
    }

    for (const child of node.children ?? []) visit(child);
  };

  for (const child of verseElement.get(0)?.children ?? []) visit(child);
  flushText();
  return segments;
}

function extractFootnotes($, verseElement) {
  return verseElement.find('a.comment').toArray().map((anchor, index) => {
    const element = $(anchor);
    const onClick = element.attr('onclick') ?? '';
    const noteId = onClick.match(/clickPopUp\(['\"]([^'\"]+)/)?.[1];
    const noteText = noteId ? normalizeText($(`[id="${noteId}"]`).first().text()) : '';
    return {
      marker: normalizeText(element.text()) || `${index + 1})`,
      text: noteText,
    };
  }).filter((note) => note.text);
}

export function parseChapterHtml(html, expected) {
  const $ = load(html, { decodeEntities: true });
  const root = $('#tdBible1').first();
  if (!root.length) throw new Error('Bible content container #tdBible1 was not found.');

  const verses = [];
  const pendingHeadings = [];
  const handledVerses = new Set();

  root.find('.smallTitle, span.number').each((_, node) => {
    const element = $(node);
    if (element.hasClass('smallTitle')) {
      const containingVerse = element.parents('span').filter((__, parent) => $(parent).children('span.number').length).first();
      if (!containingVerse.length) {
        const headingText = normalizeText(element.text());
        if (headingText) pendingHeadings.push({ type: 'heading', text: headingText });
      }
      return;
    }

    const verseElement = element.parent('span');
    const verseNode = verseElement.get(0);
    if (!verseNode || handledVerses.has(verseNode)) return;
    handledVerses.add(verseNode);

    const verseLabel = normalizeText(element.text()).replace(/[–—]/g, '-');
    const verseMatch = verseLabel.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!verseMatch) throw new Error(`Invalid verse number: ${element.text()}`);
    const verseNumber = Number.parseInt(verseMatch[1], 10);
    const verseEnd = verseMatch[2] ? Number.parseInt(verseMatch[2], 10) : verseNumber;
    if (verseEnd < verseNumber) throw new Error(`Invalid verse range: ${verseLabel}`);

    const segments = [...pendingHeadings, ...collectVerseSegments($, verseElement)];
    pendingHeadings.length = 0;
    const text = normalizeText(
      segments.filter((segment) => segment.type === 'text').map((segment) => segment.text).join(' '),
    );
    if (!text) throw new Error(`Empty verse text at ${expected.bookName} ${expected.chapter}:${verseNumber}`);

    const verse = { verse: verseNumber, text };
    if (verseEnd !== verseNumber) {
      verse.verseEnd = verseEnd;
      verse.label = `${verseNumber}-${verseEnd}`;
    }
    if (segments.some((segment) => segment.type === 'heading')) verse.segments = segments;
    const footnotes = extractFootnotes($, verseElement);
    if (footnotes.length) verse.footnotes = footnotes;
    verses.push(verse);
  });

  if (!verses.length) throw new Error(`No verses found at ${expected.bookName} ${expected.chapter}.`);
  const verseNumbers = verses.map(({ verse }) => verse);
  if (new Set(verseNumbers).size !== verseNumbers.length) {
    throw new Error(`Duplicate verse numbers at ${expected.bookName} ${expected.chapter}.`);
  }
  if (verseNumbers.some((verse, index) => index > 0 && verse <= verseNumbers[index - 1])) {
    throw new Error(`Verse numbers are not ascending at ${expected.bookName} ${expected.chapter}.`);
  }

  return verses;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
let nextRequestAt = 0;

async function throttle(delayMs) {
  const waitMs = Math.max(0, nextRequestAt - Date.now());
  nextRequestAt = Math.max(nextRequestAt, Date.now()) + delayMs;
  if (waitMs) await sleep(waitMs);
}

async function fetchChapter(translation, book, chapter, delayMs) {
  const sourceVersion = translation.sourceVersion ?? translation.id;
  const url = new URL(SOURCE_URL);
  url.search = new URLSearchParams({
    version: sourceVersion,
    book: book.sourceCode,
    chap: String(chapter),
    sec: '1',
    cVersion: '',
    fontSize: '15px',
    fontWeight: 'normal',
  });

  let lastError;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await throttle(delayMs);
      const response = await fetch(url, {
        headers: {
          Accept: 'text/html,application/xhtml+xml',
          'User-Agent': 'BibleOn/0.1 licensed-bible-data-preparation',
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      return parseChapterHtml(html, { bookName: book.name, chapter });
    } catch (error) {
      lastError = error;
      if (attempt < 5) await sleep(700 * (2 ** (attempt - 1)));
    }
  }
  throw new Error(`${translation.label} ${book.name} ${chapter}장 수집 실패: ${lastError?.message}`);
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function isCompleteBook(filePath, book, translation) {
  try {
    const saved = JSON.parse(await readFile(filePath, 'utf8'));
    return saved.translation?.id === translation.id
      && saved.book?.id === book.id
      && saved.chapters?.length === book.chapters
      && saved.chapters.every((chapter, index) => chapter.chapter === index + 1 && chapter.verses?.length);
  } catch {
    return false;
  }
}

async function writeJsonAtomic(filePath, value) {
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rm(filePath, { force: true });
  await rename(temporaryPath, filePath);
}

function countCanonicalVerses(chapters) {
  return chapters.reduce((sum, chapter) => sum + chapter.verses.reduce((verseSum, verse) => (
    verseSum + ((verse.verseEnd ?? verse.verse) - verse.verse + 1)
  ), 0), 0);
}

async function downloadTranslation(translation, books, options) {
  const translationDirectory = path.join(outputRoot, translation.directory);
  await mkdir(translationDirectory, { recursive: true });
  let completedChapters = 0;
  let totalVerses = 0;
  let totalHeadings = 0;

  for (const book of books) {
    const filePath = path.join(translationDirectory, `${book.file}.json`);
    if (!options.force && await isCompleteBook(filePath, book, translation)) {
      const saved = JSON.parse(await readFile(filePath, 'utf8'));
      const verseCount = countCanonicalVerses(saved.chapters);
      const headingCount = saved.chapters.reduce((sum, chapter) => sum + chapter.verses.reduce(
        (verseSum, verse) => verseSum + (verse.segments?.filter(({ type }) => type === 'heading').length ?? 0), 0,
      ), 0);
      completedChapters += book.chapters;
      totalVerses += verseCount;
      totalHeadings += headingCount;
      console.log(`[skip] ${translation.label} ${book.name} (${verseCount}절)`);
      continue;
    }

    const chapterNumbers = Array.from({ length: book.chapters }, (_, index) => index + 1);
    const chapters = await mapWithConcurrency(chapterNumbers, options.concurrency, async (chapter) => {
      const verses = await fetchChapter(translation, book, chapter, options.delayMs);
      completedChapters += 1;
      process.stdout.write(`\r${translation.label}: ${book.name} ${chapter}/${book.chapters}장`);
      return { chapter, verses };
    });
    process.stdout.write('\n');

    const verseCount = countCanonicalVerses(chapters);
    const headingCount = chapters.reduce((sum, chapter) => sum + chapter.verses.reduce(
      (verseSum, verse) => verseSum + (verse.segments?.filter(({ type }) => type === 'heading').length ?? 0), 0,
    ), 0);
    totalVerses += verseCount;
    totalHeadings += headingCount;

    await writeJsonAtomic(filePath, {
      schemaVersion: 1,
      source: SOURCE_URL,
      translation: { id: translation.id, label: translation.label, sourceVersion: translation.sourceVersion ?? translation.id },
      book: { id: book.id, name: book.name, sourceCode: book.sourceCode },
      chapters,
    });
    console.log(`[saved] ${translation.label} ${book.name}: ${verseCount}절, 소제목 ${headingCount}개`);
  }

  return { id: translation.id, label: translation.label, books: books.length, chapters: completedChapters, verses: totalVerses, headings: totalHeadings };
}

async function main() {
  if (BOOK_CODES.length !== bibleCatalog.length) throw new Error('Official book-code list does not match the app catalog.');
  const options = parseArguments(process.argv.slice(2));
  const allBooks = bibleCatalog.map((book, index) => ({ ...book, sourceCode: BOOK_CODES[index] }));
  const books = options.books
    ? allBooks.filter((book) => options.books.has(book.id) || options.books.has(book.sourceCode))
    : allBooks;
  if (!books.length) throw new Error('No matching books were selected.');

  await mkdir(outputRoot, { recursive: true });
  const summaries = [];
  for (const translationKey of options.translations) {
    summaries.push(await downloadTranslation(TRANSLATIONS[translationKey], books, options));
  }

  await writeJsonAtomic(path.join(outputRoot, 'manifest.json'), {
    schemaVersion: 1,
    generatedAtUtc: new Date().toISOString(),
    source: SOURCE_URL,
    translations: summaries,
  });
  console.log(`완료: ${summaries.map(({ label, verses }) => `${label} ${verses}절`).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
