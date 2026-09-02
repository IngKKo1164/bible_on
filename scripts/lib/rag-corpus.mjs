import {
  formatCanonicalRange,
  getReferenceBookById,
  makeCanonicalVerseId,
} from './bible-reference.mjs';

function verseEndOf(verse) {
  return verse.verseEnd ?? verse.verse;
}

function headingsOf(verse) {
  return (verse.segments ?? [])
    .filter((segment) => segment.type === 'heading')
    .map((segment) => segment.text.trim())
    .filter(Boolean);
}

export function canonicalIdsForVerse(book, chapter, verse) {
  const verseEnd = verseEndOf(verse);
  return Array.from(
    { length: verseEnd - verse.verse + 1 },
    (_, index) => makeCanonicalVerseId(book, chapter, verse.verse + index),
  );
}

function koreanReference(book, chapter, startVerse, endVerse = startVerse) {
  const verseLabel = startVerse === endVerse ? `${startVerse}` : `${startVerse}-${endVerse}`;
  return `${book.name} ${chapter}:${verseLabel}`;
}

export function createVerseRecord({ translation, book: inputBook, chapter, verse, source }) {
  const book = getReferenceBookById(inputBook.id);
  const canonicalIds = canonicalIdsForVerse(book, chapter, verse);
  const canonicalStart = canonicalIds[0];
  const canonicalEnd = canonicalIds.at(-1);
  const headings = headingsOf(verse);
  const verseEnd = verseEndOf(verse);

  return {
    schemaVersion: 1,
    type: 'verse',
    id: `${translation.id}:${formatCanonicalRange(canonicalStart, canonicalEnd)}`,
    canonicalStart,
    canonicalEnd,
    canonicalIds,
    translation: {
      id: translation.id,
      label: translation.label,
      sourceVersion: translation.sourceVersion ?? null,
    },
    testament: book.testament,
    book: {
      id: book.id,
      osis: book.osis,
      name: book.name,
      order: book.order,
    },
    chapter,
    verseStart: verse.verse,
    verseEnd,
    reference: koreanReference(book, chapter, verse.verse, verseEnd),
    headings,
    text: verse.text,
    footnotes: verse.footnotes ?? [],
    source: {
      id: 'kbs-korean-bible',
      url: source,
      license: 'licensed',
    },
  };
}

function uniqueInOrder(values) {
  return [...new Set(values)];
}

function createPassageRecord({
  translation,
  book,
  chapter,
  passageIndex,
  heading,
  contentSegments,
  source,
}) {
  const firstSegment = contentSegments[0];
  const lastSegment = contentSegments.at(-1);
  const canonicalStart = firstSegment.canonicalIds[0];
  const canonicalEnd = lastSegment.canonicalIds.at(-1);
  const verseIds = uniqueInOrder(contentSegments.flatMap((segment) => segment.canonicalIds));
  const content = contentSegments.map((segment) => segment.text).join(' ');
  const embeddingParts = [
    `${book.name} ${chapter}장`,
    heading,
    content,
  ].filter(Boolean);

  return {
    schemaVersion: 1,
    type: 'passage',
    id: `${translation.id}:${book.osis}.${chapter}:p${passageIndex}`,
    passageIndex,
    canonicalStart,
    canonicalEnd,
    translation: {
      id: translation.id,
      label: translation.label,
      sourceVersion: translation.sourceVersion ?? null,
    },
    testament: book.testament,
    book: {
      id: book.id,
      osis: book.osis,
      name: book.name,
      order: book.order,
    },
    chapter,
    verseStart: firstSegment.verseStart,
    verseEnd: lastSegment.verseEnd,
    reference: koreanReference(book, chapter, firstSegment.verseStart, lastSegment.verseEnd),
    heading,
    boundary: heading ? 'source_heading' : 'chapter_start',
    verseRecordIds: uniqueInOrder(contentSegments.map((segment) => segment.verseRecordId)),
    verseIds,
    contentSegments: contentSegments.map(({ verseRecordId, canonicalIds, text }) => ({
      verseRecordId,
      canonicalIds,
      text,
    })),
    content,
    embeddingText: embeddingParts.join('\n'),
    source: {
      id: 'kbs-korean-bible',
      url: source,
      license: 'licensed',
    },
  };
}

export function buildParagraphsForChapter({ translation, book: inputBook, chapter, verses, source }) {
  const book = getReferenceBookById(inputBook.id);
  const verseRecords = verses.map((verse) => createVerseRecord({
    translation,
    book,
    chapter,
    verse,
    source,
  }));
  const passageParts = [];
  let currentPassage = null;

  const flushPassage = () => {
    if (currentPassage?.contentSegments.length) passageParts.push(currentPassage);
    currentPassage = null;
  };

  verses.forEach((verse, verseIndex) => {
    const verseRecord = verseRecords[verseIndex];
    const segments = verse.segments?.length
      ? verse.segments
      : [{ type: 'text', text: verse.text }];

    for (const segment of segments) {
      const text = segment.text?.trim();
      if (!text) continue;

      if (segment.type === 'heading') {
        if (currentPassage?.contentSegments.length) flushPassage();
        if (!currentPassage) currentPassage = { heading: text, contentSegments: [] };
        else currentPassage.heading = [currentPassage.heading, text].filter(Boolean).join(' / ');
        continue;
      }

      if (segment.type !== 'text') continue;
      if (!currentPassage) currentPassage = { heading: null, contentSegments: [] };
      currentPassage.contentSegments.push({
        verseRecordId: verseRecord.id,
        canonicalIds: verseRecord.canonicalIds,
        verseStart: verseRecord.verseStart,
        verseEnd: verseRecord.verseEnd,
        text,
      });
    }
  });

  flushPassage();
  const passages = passageParts.map((passage, index) => (
    createPassageRecord({
      translation,
      book,
      chapter,
      passageIndex: index + 1,
      source,
      ...passage,
    })
  ));

  return { verseRecords, passages };
}
