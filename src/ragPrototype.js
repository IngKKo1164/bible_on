import { bibleCatalog, loadBibleChapter } from './bibleData';

const bibleSearchTopics = [
  {
    sourceTopic: 'anxiety',
    keywords: ['불안', '걱정', '염려', '평안'],
    answer: '염려를 기도로 옮기고 하나님의 돌보심을 기억하도록 돕는 말씀을 찾았어요.',
    passages: [
      { bookId: 'philippians', chapter: 4, verses: [6, 7], topicScore: 4 },
      { bookId: '1peter', chapter: 5, verses: [7], topicScore: 3 },
      { bookId: 'psalms', chapter: 55, verses: [22], topicScore: 2 },
      { bookId: 'isaiah', chapter: 41, verses: [10], topicScore: 2 },
      { bookId: 'psalms', chapter: 56, verses: [3], topicScore: 2 },
    ],
  },
  {
    sourceTopic: 'comfort',
    keywords: ['지친', '힘들', '위로', '쉼', '외로', '낙심'],
    answer: '지친 마음에 쉼과 동행을 전하는 말씀을 모았어요. 한 구절씩 천천히 읽어보세요.',
    passages: [
      { bookId: '2corinthians', chapter: 1, verses: [3, 4], topicScore: 8 },
      { bookId: 'psalms', chapter: 23, verses: [4], topicScore: 5 },
      { bookId: 'matthew', chapter: 11, verses: [28, 29, 30], topicScore: 4 },
      { bookId: 'psalms', chapter: 119, verses: [76], topicScore: 3 },
      { bookId: 'matthew', chapter: 5, verses: [4], topicScore: 3 },
    ],
  },
  {
    sourceTopic: 'guidance',
    keywords: ['결정', '선택', '진로', '지혜', '길', '인도'],
    answer: '결정을 서두르기보다 지혜를 구하고 인도하심을 신뢰하도록 돕는 말씀을 찾았어요.',
    passages: [
      { bookId: 'proverbs', chapter: 3, verses: [5, 6], topicScore: 4 },
      { bookId: 'psalms', chapter: 32, verses: [8], topicScore: 3 },
      { bookId: 'psalms', chapter: 119, verses: [105], topicScore: 3 },
      { bookId: 'proverbs', chapter: 16, verses: [9], topicScore: 2 },
      { bookId: 'james', chapter: 1, verses: [5], topicScore: 2 },
    ],
  },
  {
    sourceTopic: 'gratitude',
    keywords: ['감사', '기쁨', '찬양'],
    answer: '일상에서 감사를 기억하고 표현하도록 돕는 말씀을 찾았어요.',
    passages: [
      { bookId: '1thessalonians', chapter: 5, verses: [18], topicScore: 7 },
      { bookId: 'psalms', chapter: 118, verses: [24], topicScore: 5 },
      { bookId: 'colossians', chapter: 3, verses: [17], topicScore: 5 },
      { bookId: 'james', chapter: 1, verses: [17], topicScore: 4 },
      { bookId: 'psalms', chapter: 136, verses: [1], topicScore: 4 },
    ],
  },
  {
    sourceTopic: 'forgiveness',
    keywords: ['용서', '미움', '관계', '사랑'],
    answer: '용서와 사랑을 관계 안에서 실천하도록 이끄는 말씀을 찾았어요.',
    passages: [
      { bookId: 'ephesians', chapter: 4, verses: [32], topicScore: 6 },
      { bookId: 'mark', chapter: 11, verses: [25], topicScore: 5 },
      { bookId: '1john', chapter: 1, verses: [9], topicScore: 5 },
      { bookId: 'matthew', chapter: 6, verses: [15], topicScore: 4 },
      { bookId: 'matthew', chapter: 18, verses: [21, 22], topicScore: 4 },
    ],
  },
];

const defaultBibleSearchTopic = {
  answer: '질문과 함께 천천히 읽어볼 수 있는 말씀을 찾았어요. 본문을 직접 읽으며 마음에 남는 구절을 살펴보세요.',
  passages: [
    { bookId: 'psalms', chapter: 119, verses: [105] },
    { bookId: 'matthew', chapter: 11, verses: [28] },
    { bookId: 'philippians', chapter: 4, verses: [6, 7] },
  ],
};

function takeRandomPassages(passages, limit) {
  const shuffled = [...passages];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const targetIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
  }
  return shuffled.slice(0, limit);
}

export async function searchOpenBibleTopicPassages(question, translationId = 'KRV', limit = 3) {
  const normalizedQuestion = question.trim().toLocaleLowerCase('ko-KR');
  if (!normalizedQuestion) return [];
  const matchedTopics = bibleSearchTopics.filter(({ keywords }) => (
    keywords.some((keyword) => normalizedQuestion.includes(keyword) || keyword.includes(normalizedQuestion))
  ));
  if (!matchedTopics.length) return [];

  const uniquePassages = [...new Map(matchedTopics
    .flatMap((topic) => topic.passages.map((passage) => ({
      ...passage,
      topics: topic.keywords,
      sourceTopic: topic.sourceTopic,
    })))
    .map((passage) => [`${passage.bookId}-${passage.chapter}-${passage.verses.join('-')}`, passage])).values()];
  const passages = takeRandomPassages(uniquePassages, limit);

  return Promise.all(passages.map(async (passage) => {
    const book = bibleCatalog.find(({ id }) => id === passage.bookId);
    const chapterVerses = await loadBibleChapter(translationId, passage.bookId, passage.chapter);
    const matchedVerses = chapterVerses.filter(({ verse }) => passage.verses.includes(verse));
    const verseLabel = passage.verses.length > 1
      ? `${passage.verses[0]}-${passage.verses.at(-1)}`
      : `${passage.verses[0]}`;
    return {
      id: `${passage.bookId}-${passage.chapter}-${verseLabel}`,
      bookId: passage.bookId,
      chapter: passage.chapter,
      verse: passage.verses[0],
      reference: `${book.name} ${passage.chapter}:${verseLabel}`,
      text: matchedVerses.map(({ text }) => text).join(' '),
      topics: passage.topics,
      topicScore: passage.topicScore,
      topicSource: `OpenBible.info/topics/${passage.sourceTopic}`,
      translationId,
    };
  }));
}

export async function retrieveBibleSearchAnswer(question) {
  const normalizedQuestion = question.trim().toLowerCase();
  const topic = bibleSearchTopics.find(({ keywords }) => (
    keywords.some((keyword) => normalizedQuestion.includes(keyword))
  )) ?? defaultBibleSearchTopic;

  const citations = await Promise.all(topic.passages.map(async (passage) => {
    const book = bibleCatalog.find(({ id }) => id === passage.bookId);
    const chapterVerses = await loadBibleChapter('KRV', passage.bookId, passage.chapter);
    const matchedVerses = chapterVerses.filter(({ verse }) => passage.verses.includes(verse));
    const verseLabel = passage.verses.length > 1
      ? `${passage.verses[0]}-${passage.verses.at(-1)}`
      : `${passage.verses[0]}`;

    return {
      id: `${passage.bookId}-${passage.chapter}-${verseLabel}`,
      bookId: passage.bookId,
      chapter: passage.chapter,
      reference: `${book.name} ${passage.chapter}:${verseLabel}`,
      text: matchedVerses.map(({ text }) => text).join(' '),
      translation: '개역개정',
    };
  }));

  return { answer: topic.answer, citations };
}
