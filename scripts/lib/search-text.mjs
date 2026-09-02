const WORD_PATTERN = /[가-힣]+|[a-z0-9]+/gu;

export function retrievalHeading(passage) {
  const heading = passage.heading?.trim();
  if (!heading) return null;

  // GAE Psalm superscriptions use "인도자" for a music director. Indexing that
  // boilerplate creates false matches for questions about divine guidance.
  if (passage.translation.id === 'GAE' && /인도자를 따라/u.test(heading)) return null;
  return heading;
}

export function passageSearchText(passage) {
  return [
    `${passage.book.name} ${passage.chapter}장`,
    retrievalHeading(passage),
    passage.content,
  ].filter(Boolean).join('\n');
}

export function normalizeSearchText(value) {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^가-힣a-z0-9]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const QUERY_EXPANSIONS = [
  {
    pattern: /불안|걱정|염려|근심|두려/u,
    terms: '염려 걱정 불안 근심 두려움 낙심 평안 평화 위로 맡기다 기도',
  },
  {
    pattern: /인도|방향|길/u,
    terms: '인도 길 지도 등불 빛 의뢰 신뢰 지혜',
  },
];

export function expandQueryForSearch(value) {
  const normalized = normalizeSearchText(value);
  const additions = QUERY_EXPANSIONS
    .filter(({ pattern }) => pattern.test(normalized))
    .map(({ terms }) => terms);

  if (/용서/u.test(normalized)) {
    additions.push(
      /다른|사람|서로|이웃/u.test(normalized)
        ? '서로 용서 용납 친절 불쌍히 잘못'
        : '용서 죄 사함 자비 회개',
    );
  }

  return [...new Set([normalized, ...additions])].join(' ');
}

export function expandQueryForEmbedding(value) {
  const additions = [];
  if (/불안|걱정|염려|근심|두려/u.test(value)) {
    additions.push('염려하지 말고 두려워하지 말라. 하나님께 맡기고 평안과 위로를 얻는다.');
  }
  if (/인도|방향|길/u.test(value)) {
    additions.push('하나님을 신뢰하면 바른 길로 인도하시고 지혜와 빛을 주신다.');
  }
  if (/용서/u.test(value) && /다른|사람|서로|이웃/u.test(value)) {
    additions.push('서로 용서하고 용납하며 친절과 자비로 대한다.');
  }
  return [value.trim(), ...additions].filter(Boolean).join('\n');
}

export function tokenizeForSearch(value) {
  const normalized = normalizeSearchText(value);
  const words = normalized.match(WORD_PATTERN) ?? [];
  const tokens = [];

  for (const word of words) {
    tokens.push(`w:${word}`);
    if (!/^[가-힣]+$/u.test(word)) continue;

    for (const width of [2, 3]) {
      if (word.length < width) continue;
      for (let index = 0; index <= word.length - width; index += 1) {
        tokens.push(`g${width}:${word.slice(index, index + width)}`);
      }
    }
  }

  return tokens;
}

export function buildBm25Index(passages, { maxDocumentFrequencyRatio = 0.92 } = {}) {
  const postingMaps = new Map();
  const documents = [];
  const lengthTotals = new Map();
  const documentCounts = new Map();

  passages.forEach((passage, documentIndex) => {
    const tokens = tokenizeForSearch(passageSearchText(passage));
    const frequencies = new Map();
    tokens.forEach((token) => frequencies.set(token, (frequencies.get(token) ?? 0) + 1));

    documents.push({
      passageId: passage.id,
      translationId: passage.translation.id,
      length: tokens.length,
    });
    lengthTotals.set(
      passage.translation.id,
      (lengthTotals.get(passage.translation.id) ?? 0) + tokens.length,
    );
    documentCounts.set(
      passage.translation.id,
      (documentCounts.get(passage.translation.id) ?? 0) + 1,
    );

    for (const [token, frequency] of frequencies) {
      const postings = postingMaps.get(token) ?? [];
      postings.push([documentIndex, frequency]);
      postingMaps.set(token, postings);
    }
  });

  const averageDocumentLengths = Object.fromEntries(
    [...lengthTotals].map(([translationId, total]) => [
      translationId,
      total / documentCounts.get(translationId),
    ]),
  );
  const terms = {};

  for (const [term, postings] of postingMaps) {
    const documentFrequencies = {};
    for (const [documentIndex] of postings) {
      const translationId = documents[documentIndex].translationId;
      documentFrequencies[translationId] = (documentFrequencies[translationId] ?? 0) + 1;
    }
    const keep = Object.entries(documentFrequencies).some(([translationId, frequency]) => (
      frequency / documentCounts.get(translationId) <= maxDocumentFrequencyRatio
    ));
    if (keep) terms[term] = { documentFrequencies, postings };
  }

  return {
    schemaVersion: 1,
    tokenizer: 'normalized_words_and_hangul_2_3_grams',
    parameters: { k1: 1.2, b: 0.75, maxDocumentFrequencyRatio },
    documentCounts: Object.fromEntries(documentCounts),
    averageDocumentLengths,
    documents,
    terms,
  };
}

export function searchBm25(index, query, { translationId, limit = 50 } = {}) {
  const k1 = index.parameters.k1;
  const b = index.parameters.b;
  const documentCount = index.documentCounts[translationId];
  const averageLength = index.averageDocumentLengths[translationId];
  if (!documentCount || !averageLength) throw new Error(`Unknown translation: ${translationId}`);

  const queryTokens = [...new Set(tokenizeForSearch(query))];
  const scores = new Map();
  const matchedTerms = new Map();

  for (const token of queryTokens) {
    const term = index.terms[token];
    const documentFrequency = term?.documentFrequencies[translationId] ?? 0;
    if (!term || !documentFrequency) continue;

    const inverseDocumentFrequency = Math.log(
      1 + (documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5),
    );
    for (const [documentIndex, frequency] of term.postings) {
      const document = index.documents[documentIndex];
      if (document.translationId !== translationId) continue;
      const denominator = frequency + k1 * (1 - b + b * document.length / averageLength);
      const score = inverseDocumentFrequency * (frequency * (k1 + 1)) / denominator;
      scores.set(documentIndex, (scores.get(documentIndex) ?? 0) + score);
      const terms = matchedTerms.get(documentIndex) ?? [];
      terms.push(token);
      matchedTerms.set(documentIndex, terms);
    }
  }

  return [...scores]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([documentIndex, score], rank) => ({
      rank: rank + 1,
      documentIndex,
      passageId: index.documents[documentIndex].passageId,
      score,
      matchedTerms: matchedTerms.get(documentIndex) ?? [],
    }));
}

export function scorePassageSegments(query, passage, limit = 3) {
  const queryTokens = new Set(tokenizeForSearch(query));
  return passage.contentSegments
    .map((segment) => {
      const segmentTokens = new Set(tokenizeForSearch(segment.text));
      let score = 0;
      queryTokens.forEach((token) => {
        if (segmentTokens.has(token)) score += token.startsWith('w:') ? 2 : 1;
      });
      return { score, verseIds: segment.canonicalIds };
    })
    .filter((segment) => segment.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .flatMap((segment) => segment.verseIds);
}
