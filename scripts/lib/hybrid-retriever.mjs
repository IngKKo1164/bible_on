import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getReferenceBookById,
  parseOpenBibleReference,
} from './bible-reference.mjs';
import { createLocalEmbedder } from './local-embedder.mjs';
import { loadJsonLines } from './jsonl.mjs';
import {
  createSearchHypotheses,
  expandQueryForSearch,
  scorePassageSegments,
  searchBm25,
} from './search-text.mjs';

const RRF_K = 60;
const CHANNEL_WEIGHTS = {
  lexical: 1.1,
  body: 1,
  heading_scene: 0.72,
  topic: 0.9,
  commentary: 0.82,
  cross_reference: 0.5,
};

function compareCanonicalVerseIds(leftId, rightId) {
  const left = parseOpenBibleReference(leftId).start;
  const right = parseOpenBibleReference(rightId).start;
  return getReferenceBookById(left.bookId).order - getReferenceBookById(right.bookId).order
    || left.chapter - right.chapter
    || left.verse - right.verse;
}

function createScoreBreakdown() {
  return {
    lexical: 0,
    body: 0,
    headingScene: 0,
    topic: 0,
    commentary: 0,
    crossReference: 0,
  };
}

function scoreKey(channel) {
  if (channel === 'heading_scene') return 'headingScene';
  if (channel === 'cross_reference') return 'crossReference';
  return channel;
}

function addCandidate(candidates, passageId) {
  let candidate = candidates.get(passageId);
  if (!candidate) {
    candidate = {
      passageId,
      score: 0,
      scoreBreakdown: createScoreBreakdown(),
      channels: new Set(),
      seedVerseIds: new Set(),
      hypotheses: new Map(),
      vectorMatches: [],
      topicMatches: [],
      commentaryMatches: [],
      crossReferences: [],
    };
    candidates.set(passageId, candidate);
  }
  return candidate;
}

function addRrfScore(candidate, channel, rank, weight) {
  const contribution = weight / (RRF_K + rank);
  candidate.score += contribution;
  candidate.scoreBreakdown[scoreKey(channel)] += contribution;
  candidate.channels.add(channel);
}

function rememberHypothesis(candidate, hypothesis) {
  if (!hypothesis || hypothesis.kind === 'user_query') return;
  candidate.hypotheses.set(hypothesis.id, {
    id: hypothesis.id,
    kind: hypothesis.kind,
    text: hypothesis.text,
  });
}

function dotProduct(query, vectors, offset, dimensions) {
  let score = 0;
  for (let index = 0; index < dimensions; index += 1) {
    score += query[index] * vectors[offset + index];
  }
  return score;
}

function topVectorRecords({
  queryVector,
  vectors,
  dimensions,
  metadataRecords,
  sourceLimit,
}) {
  return metadataRecords
    .map((metadata) => ({
      metadata,
      similarity: dotProduct(
        queryVector,
        vectors,
        metadata.vectorIndex * dimensions,
        dimensions,
      ),
    }))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, sourceLimit);
}

function passageMatchesFromVectorRecords(records, {
  passageIdsByVerse,
  translationId,
  limit,
}) {
  const matches = [];
  const seenPassageIds = new Set();

  for (const record of records) {
    const passageIds = new Set(record.metadata.passageIds);
    if (record.metadata.view === 'commentary') {
      for (const verseId of record.metadata.verseIds) {
        passageIdsByVerse.get(`${translationId}:${verseId}`)
          ?.forEach((passageId) => passageIds.add(passageId));
      }
    }
    for (const passageId of passageIds) {
      if (seenPassageIds.has(passageId)) continue;
      seenPassageIds.add(passageId);
      matches.push({ ...record, passageId });
      if (matches.length >= limit) return matches;
    }
  }
  return matches;
}

function topicPassageMatches(records, {
  passageIdsByVerse,
  topicLinks,
  translationId,
  topicLimit,
  linksPerTopic,
  limit,
}) {
  const bestByPassage = new Map();

  records.slice(0, topicLimit).forEach((record, topicIndex) => {
    const links = (topicLinks.nodes[record.metadata.topicId] ?? []).slice(0, linksPerTopic);
    links.forEach((link, linkIndex) => {
      const combinedRank = (topicIndex + 1) + (linkIndex + 1) * 0.5;
      const passageIds = new Set();
      link.verseIds.forEach((verseId) => {
        passageIdsByVerse.get(`${translationId}:${verseId}`)
          ?.forEach((passageId) => passageIds.add(passageId));
      });
      for (const passageId of passageIds) {
        const current = bestByPassage.get(passageId);
        if (!current || combinedRank < current.combinedRank) {
          bestByPassage.set(passageId, {
            passageId,
            combinedRank,
            similarity: record.similarity,
            metadata: record.metadata,
            associationId: link.associationId,
            verseIds: link.verseIds,
            qualityScore: link.qualityScore,
            votes: link.votes,
          });
        }
      }
    });
  });

  return [...bestByPassage.values()]
    .sort((left, right) => left.combinedRank - right.combinedRank
      || right.qualityScore - left.qualityScore
      || (right.votes ?? -1) - (left.votes ?? -1))
    .slice(0, limit);
}

export async function createHybridRetriever({ repositoryRoot, localFilesOnly = true } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  const derivedRoot = path.join(root, 'data', 'rag', 'derived');
  const indexRoot = path.join(root, 'data', 'rag', 'index');
  const modelCacheRoot = path.join(root, 'data', 'rag', 'models');
  const indexManifest = JSON.parse(await readFile(path.join(indexRoot, 'manifest.json'), 'utf8'));
  if (indexManifest.schemaVersion !== 2) {
    throw new Error('RAG search index schema 2 is required. Run npm run data:rag-index.');
  }
  const corpusManifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
  const passages = await loadJsonLines(path.join(derivedRoot, corpusManifest.files.passages.path));
  const passagesById = new Map(passages.map((passage) => [passage.id, passage]));
  const lexicalIndex = JSON.parse(await readFile(
    path.join(indexRoot, indexManifest.files.lexical.path),
    'utf8',
  ));
  const vectorMetadata = await loadJsonLines(
    path.join(indexRoot, indexManifest.files.vectorMetadata.path),
  );
  const vectorBuffer = await readFile(path.join(indexRoot, indexManifest.files.vectors.path));
  const vectorArrayBuffer = vectorBuffer.buffer.slice(
    vectorBuffer.byteOffset,
    vectorBuffer.byteOffset + vectorBuffer.byteLength,
  );
  const vectors = new Float32Array(vectorArrayBuffer);
  const topicLinks = JSON.parse(await readFile(
    path.join(indexRoot, indexManifest.files.topicLinks.path),
    'utf8',
  ));
  const graph = JSON.parse(await readFile(
    path.join(indexRoot, indexManifest.files.crossReferences.path),
    'utf8',
  ));
  const dimensions = indexManifest.embeddings.dimensions;
  if (vectors.length !== vectorMetadata.length * dimensions) {
    throw new Error('Vector file size does not match vector metadata.');
  }
  if (graph.expansionDepth !== 1) throw new Error('Cross-reference index must be exactly one hop.');

  const vectorsByView = new Map();
  for (const metadata of vectorMetadata) {
    const records = vectorsByView.get(metadata.view) ?? [];
    records.push(metadata);
    vectorsByView.set(metadata.view, records);
  }

  const passageIdsByVerse = new Map();
  const verseIdsByTranslation = new Map();
  for (const passage of passages) {
    for (const verseId of passage.verseIds) {
      const key = `${passage.translation.id}:${verseId}`;
      const passageIds = passageIdsByVerse.get(key) ?? new Set();
      passageIds.add(passage.id);
      passageIdsByVerse.set(key, passageIds);
      const verseIds = verseIdsByTranslation.get(passage.translation.id) ?? new Set();
      verseIds.add(verseId);
      verseIdsByTranslation.set(passage.translation.id, verseIds);
    }
  }
  const verseRangesByTranslation = new Map();
  for (const [translationId, verseIds] of verseIdsByTranslation) {
    const orderedIds = [...verseIds].sort(compareCanonicalVerseIds);
    verseRangesByTranslation.set(translationId, {
      orderedIds,
      indexById: new Map(orderedIds.map((id, index) => [id, index])),
    });
  }

  function expandCanonicalRange(translationId, startId, endId) {
    if (startId === endId) return [startId];
    const range = verseRangesByTranslation.get(translationId);
    const startIndex = range?.indexById.get(startId);
    const endIndex = range?.indexById.get(endId);
    if (startIndex === undefined || endIndex === undefined || startIndex > endIndex) {
      return [startId, endId];
    }
    return range.orderedIds.slice(startIndex, endIndex + 1);
  }

  const embedder = await createLocalEmbedder({
    cacheDirectory: modelCacheRoot,
    localFilesOnly,
  });

  async function search(query, {
    translationId = 'RNKSV',
    limit = 8,
    lexicalLimit = 60,
    bodyLimit = 80,
    headingLimit = 40,
    topicLimit = 12,
    topicLinksPerTopic = 16,
    topicPassageLimit = 60,
    commentaryLimit = 40,
    graphSeedLimit = 8,
    graphEdgesPerVerse = 3,
  } = {}) {
    const hypotheses = createSearchHypotheses(query);
    if (!hypotheses.length) return [];
    const candidates = new Map();
    const lexicalQuery = expandQueryForSearch(query);
    const lexicalResults = searchBm25(lexicalIndex, lexicalQuery, {
      translationId,
      limit: lexicalLimit,
    });

    lexicalResults.forEach((result, index) => {
      const candidate = addCandidate(candidates, result.passageId);
      addRrfScore(candidate, 'lexical', index + 1, CHANNEL_WEIGHTS.lexical);
      const passage = passagesById.get(result.passageId);
      scorePassageSegments(lexicalQuery, passage)
        .forEach((verseId) => candidate.seedVerseIds.add(verseId));
    });

    for (const hypothesis of hypotheses) {
      const queryVector = await embedder.embedQuery(hypothesis.text);
      for (const [view, resultLimit] of [
        ['body', bodyLimit],
        ['heading_scene', headingLimit],
        ['commentary', commentaryLimit],
      ]) {
        const viewRecords = (vectorsByView.get(view) ?? []).filter((metadata) => (
          metadata.translationId === null || metadata.translationId === translationId
        ));
        if (!viewRecords.length) continue;
        const topRecords = topVectorRecords({
          queryVector,
          vectors,
          dimensions,
          metadataRecords: viewRecords,
          sourceLimit: Math.max(resultLimit * 4, resultLimit),
        });
        const matches = passageMatchesFromVectorRecords(topRecords, {
          passageIdsByVerse,
          translationId,
          limit: resultLimit,
        });
        matches.forEach((match, index) => {
          const candidate = addCandidate(candidates, match.passageId);
          addRrfScore(
            candidate,
            view,
            index + 1,
            CHANNEL_WEIGHTS[view] * hypothesis.weight,
          );
          match.metadata.verseIds.forEach((verseId) => candidate.seedVerseIds.add(verseId));
          rememberHypothesis(candidate, hypothesis);
          candidate.vectorMatches.push({
            view,
            hypothesisId: hypothesis.id,
            sourceRecordId: match.metadata.sourceRecordId,
            similarity: Number(match.similarity.toFixed(8)),
            rank: index + 1,
          });
          if (view === 'commentary') {
            candidate.commentaryMatches.push({
              id: match.metadata.commentaryId,
              title: match.metadata.commentaryTitle,
              hypothesisId: hypothesis.id,
              similarity: Number(match.similarity.toFixed(8)),
            });
          }
        });
      }

      const topicRecords = vectorsByView.get('topic') ?? [];
      if (topicRecords.length) {
        const topTopics = topVectorRecords({
          queryVector,
          vectors,
          dimensions,
          metadataRecords: topicRecords,
          sourceLimit: topicLimit,
        });
        const topicMatches = topicPassageMatches(topTopics, {
          passageIdsByVerse,
          topicLinks,
          translationId,
          topicLimit,
          linksPerTopic: topicLinksPerTopic,
          limit: topicPassageLimit,
        });
        topicMatches.forEach((match, index) => {
          const candidate = addCandidate(candidates, match.passageId);
          addRrfScore(
            candidate,
            'topic',
            index + 1,
            CHANNEL_WEIGHTS.topic * hypothesis.weight,
          );
          match.verseIds.forEach((verseId) => candidate.seedVerseIds.add(verseId));
          rememberHypothesis(candidate, hypothesis);
          candidate.topicMatches.push({
            id: match.metadata.topicId,
            label: match.metadata.topicLabel,
            associationId: match.associationId,
            hypothesisId: hypothesis.id,
            similarity: Number(match.similarity.toFixed(8)),
            qualityScore: match.qualityScore,
            votes: match.votes,
          });
        });
      }
    }

    // Candidates introduced by an edge never become seeds, keeping expansion at exactly one hop.
    const graphSeeds = [...candidates.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, graphSeedLimit);
    const graphMatches = new Map();
    graphSeeds.forEach((seed, seedIndex) => {
      const seedPassage = passagesById.get(seed.passageId);
      const seedVerseIds = seed.seedVerseIds.size
        ? [...seed.seedVerseIds]
        : seedPassage.verseIds.slice(0, 3);
      seedVerseIds.slice(0, 5).forEach((seedVerseId) => {
        const edges = (graph.nodes[seedVerseId] ?? []).slice(0, graphEdgesPerVerse);
        edges.forEach((edge, edgeIndex) => {
          const targetVerseIds = expandCanonicalRange(translationId, edge.toStart, edge.toEnd);
          const targetPassageIds = new Set();
          targetVerseIds.forEach((verseId) => {
            passageIdsByVerse.get(`${translationId}:${verseId}`)
              ?.forEach((passageId) => targetPassageIds.add(passageId));
          });
          for (const targetPassageId of targetPassageIds) {
            if (targetPassageId === seed.passageId) continue;
            const graphRank = seedIndex * graphEdgesPerVerse + edgeIndex + 1;
            const reference = {
              relationType: edge.relationType,
              expansionDepth: 1,
              from: seedVerseId,
              toStart: edge.toStart,
              toEnd: edge.toEnd,
              votes: edge.votes,
              seedPassageId: seed.passageId,
            };
            const current = graphMatches.get(targetPassageId);
            if (!current) {
              graphMatches.set(targetPassageId, {
                passageId: targetPassageId,
                rank: graphRank,
                references: [reference],
              });
            } else {
              current.rank = Math.min(current.rank, graphRank);
              current.references.push(reference);
            }
          }
        });
      });
    });
    [...graphMatches.values()]
      .sort((left, right) => left.rank - right.rank)
      .forEach((match, index) => {
        const target = addCandidate(candidates, match.passageId);
        addRrfScore(target, 'cross_reference', index + 1, CHANNEL_WEIGHTS.cross_reference);
        target.crossReferences.push(...match.references);
      });

    const ranked = [...candidates.values()]
      .filter((candidate) => passagesById.has(candidate.passageId))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit);
    const topScore = ranked[0]?.score ?? 1;
    return ranked.map((candidate, rank) => ({
      rank: rank + 1,
      score: Number((candidate.score / topScore).toFixed(8)),
      reciprocalRankScore: Number(candidate.score.toFixed(8)),
      scoreBreakdown: Object.fromEntries(
        Object.entries(candidate.scoreBreakdown)
          .map(([channel, score]) => [channel, Number(score.toFixed(8))]),
      ),
      channels: [...candidate.channels],
      matchedVerseIds: [...candidate.seedVerseIds],
      matchedHypotheses: [...candidate.hypotheses.values()],
      matchedTopics: candidate.topicMatches.slice(0, 5),
      matchedCommentary: candidate.commentaryMatches.slice(0, 5),
      vectorMatches: candidate.vectorMatches.slice(0, 8),
      crossReferences: candidate.crossReferences
        .sort((left, right) => right.votes - left.votes)
        .slice(0, 5),
      passage: passagesById.get(candidate.passageId),
    }));
  }

  return {
    manifest: indexManifest,
    search,
    async dispose() {
      await embedder.dispose();
    },
  };
}
