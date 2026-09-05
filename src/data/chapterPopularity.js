export const CHAPTER_POPULARITY_VERSION = 2;

export function createEmptyChapterPopularityData() {
  return { version: CHAPTER_POPULARITY_VERSION, days: {}, chapters: {} };
}

export function normalizeChapterPopularityData(value) {
  if (
    value?.version === CHAPTER_POPULARITY_VERSION
    && value.days
    && typeof value.days === 'object'
    && value.chapters
    && typeof value.chapters === 'object'
  ) {
    return value;
  }
  return createEmptyChapterPopularityData();
}

export function chapterPopularityKey(bookId, chapter) {
  return `${bookId}-${Number(chapter)}`;
}

export function recordUniqueChapterAccess(currentValue, chapter, dateKey) {
  const current = normalizeChapterPopularityData(currentValue);
  if (!chapter?.bookId || !Number(chapter.chapter) || !dateKey) return current;

  const chapterKey = chapterPopularityKey(chapter.bookId, chapter.chapter);
  if (current.days[dateKey]?.[chapterKey]) return current;

  return {
    version: CHAPTER_POPULARITY_VERSION,
    days: {
      ...current.days,
      [dateKey]: {
        ...(current.days[dateKey] ?? {}),
        [chapterKey]: 1,
      },
    },
    chapters: {
      ...current.chapters,
      [chapterKey]: {
        bookId: chapter.bookId,
        chapter: Number(chapter.chapter),
        reference: chapter.reference,
      },
    },
  };
}

export function rankChapterPopularity(value, dateKeys, limit = 5) {
  const data = normalizeChapterPopularityData(value);
  const totals = new Map();

  dateKeys.forEach((dateKey) => {
    Object.entries(data.days[dateKey] ?? {}).forEach(([chapterKey, count]) => {
      totals.set(chapterKey, (totals.get(chapterKey) ?? 0) + Number(count || 0));
    });
  });

  return [...totals.entries()]
    .map(([chapterKey, count]) => ({ chapterKey, count, ...data.chapters[chapterKey] }))
    .filter(({ bookId, chapter, reference }) => bookId && chapter && reference)
    .sort((left, right) => right.count - left.count || left.reference.localeCompare(right.reference, 'ko-KR'))
    .slice(0, limit);
}
