import { bibleCatalog, loadBibleChapter } from './bibleData';

const bibleSearchTopics = [
  {
    keywords: ['불안', '걱정', '염려', '평안'],
    answer: '염려를 기도로 옮기고 하나님의 돌보심을 기억하도록 돕는 말씀을 찾았어요.',
    passages: [
      { bookId: 'philippians', chapter: 4, verses: [6, 7] },
      { bookId: '1peter', chapter: 5, verses: [7] },
      { bookId: 'psalms', chapter: 55, verses: [22] },
    ],
  },
  {
    keywords: ['지친', '힘들', '위로', '쉼', '외로', '낙심'],
    answer: '지친 마음에 쉼과 동행을 전하는 말씀을 모았어요. 한 구절씩 천천히 읽어보세요.',
    passages: [
      { bookId: 'matthew', chapter: 11, verses: [28] },
      { bookId: 'psalms', chapter: 23, verses: [1, 2, 3, 4] },
      { bookId: 'john', chapter: 14, verses: [27] },
    ],
  },
  {
    keywords: ['결정', '선택', '진로', '지혜', '길', '인도'],
    answer: '결정을 서두르기보다 지혜를 구하고 인도하심을 신뢰하도록 돕는 말씀을 찾았어요.',
    passages: [
      { bookId: 'james', chapter: 1, verses: [5] },
      { bookId: 'proverbs', chapter: 3, verses: [5, 6] },
      { bookId: 'psalms', chapter: 119, verses: [105] },
    ],
  },
  {
    keywords: ['감사', '기쁨', '찬양'],
    answer: '일상에서 감사를 기억하고 표현하도록 돕는 말씀을 찾았어요.',
    passages: [
      { bookId: '1thessalonians', chapter: 5, verses: [16, 17, 18] },
      { bookId: 'psalms', chapter: 100, verses: [4, 5] },
      { bookId: 'philippians', chapter: 4, verses: [4] },
    ],
  },
  {
    keywords: ['용서', '미움', '관계', '사랑'],
    answer: '용서와 사랑을 관계 안에서 실천하도록 이끄는 말씀을 찾았어요.',
    passages: [
      { bookId: 'ephesians', chapter: 4, verses: [32] },
      { bookId: 'colossians', chapter: 3, verses: [13] },
      { bookId: '1corinthians', chapter: 13, verses: [4, 5, 7] },
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
