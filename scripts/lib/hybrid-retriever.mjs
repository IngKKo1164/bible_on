import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getReferenceBookById,
  parseOpenBibleReference,
} from './bible-reference.mjs';
import { createLocalEmbedder } from './local-embedder.mjs';
import { loadJsonLines } from './jsonl.mjs';
import {
  expandQueryForSearch,
  expandQueryForEmbedding,
  scorePassageSegments,
  searchBm25,
} from './search-text.mjs';

function compareCanonicalVerseIds(leftId, rightId) {
  const left = parseOpenBibleReference(leftId).start;
  const right = parseOpenBibleReference(rightId).start;
  return getReferenceBookById(left.bookId).order - getReferenceBookById(right.bookId).order
    || left.chapter - right.chapter
    || left.verse - right.verse;
}

function addCandidate(candidates, passageId) {
  let candidate = candidates.get(passageId);
  if (!candidate) {
    candidate = {
      passageId,
      lexicalScore: 0,
      vectorScore: 0,
      directScore: 0,
      graphScore: 0,
      channels: new Set(),
      seedVerseIds: new Set(),
      crossReferences: [],
    };
    candidates.set(passageId, candidate);
  }
  return candidate;
}

function dotProduct(query, vectors, offset, dimensions) {
  let score = 0;
  for (let index = 0; index < dimensions; index += 1) {
    score += query[index] * vectors[offset + index];
  }
  return score;
}

export async function createHybridRetriever({ repositoryRoot, localFilesOnly = true } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  const derivedRoot = path.join(root, 'data', 'rag', 'derived');
  const indexRoot = path.join(root, 'data', 'rag', 'index');
  const modelCacheRoot = path.join(root, 'data', 'rag', 'models');
  const indexManifest = JSON.parse(await readFile(path.join(indexRoot, 'manifest.json'), 'utf8'));
  const corpusManifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
  const passages = await loadJsonLines(
    path.join(derivedRoot, corpusManifest.files.passages.path),
  );
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
  const graph = JSON.parse(await readFile(
    path.join(indexRoot, indexManifest.files.crossReferences.path),
    'utf8',
  ));
  const dimensions = indexManifest.embeddings.dimensions;
  if (vectors.length !== vectorMetadata.length * dimensions) {
    throw new Error('Vector file size does not match vector metadata.');
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
    vectorLimit = 60,
    graphSeedLimit = 8,
    graphEdgesPerVerse = 3,
  } = {}) {
    const lexicalQuery = expandQueryForSearch(query);
    const lexicalResults = searchBm25(lexicalIndex, lexicalQuery, {
      translationId,
      limit: lexicalLimit,
    });
    const queryVector = await embedder.embedQuery(expandQueryForEmbedding(query));
    const vectorByPassage = new Map();

    for (const metadata of vectorMetadata) {
      if (metadata.translationId !== translationId) continue;
      const score = dotProduct(
        queryVector,
        vectors,
        metadata.vectorIndex * dimensions,
        dimensions,
      );
      const current = vectorByPassage.get(metadata.passageId);
      if (!current || score > current.score) {
        vectorByPassage.set(metadata.passageId, {
          passageId: metadata.passageId,
          score,
          verseIds: metadata.verseIds,
        });
      }
    }

    const vectorResults = [...vectorByPassage.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, vectorLimit)
      .map((result, rank) => ({ ...result, rank: rank + 1 }));
    const candidates = new Map();
    const bestLexicalScore = lexicalResults[0]?.score ?? 1;
    const bestVectorScore = vectorResults[0]?.score ?? 1;
    const vectorScoreFloor = vectorResults.at(-1)?.score ?? bestVectorScore;
    const vectorScoreRange = bestVectorScore - vectorScoreFloor;

    for (const result of lexicalResults) {
      const candidate = addCandidate(candidates, result.passageId);
      candidate.lexicalScore = result.score / bestLexicalScore;
      candidate.channels.add('bm25');
      const passage = passagesById.get(result.passageId);
      scorePassageSegments(lexicalQuery, passage).forEach((id) => candidate.seedVerseIds.add(id));
    }
    for (const result of vectorResults) {
      const candidate = addCandidate(candidates, result.passageId);
      candidate.vectorScore = vectorScoreRange > 0
        ? (result.score - vectorScoreFloor) / vectorScoreRange
        : result.score / bestVectorScore;
      candidate.channels.add('vector');
      result.verseIds.forEach((id) => candidate.seedVerseIds.add(id));
    }

    for (const candidate of candidates.values()) {
      const strongerChannel = Math.max(candidate.lexicalScore, candidate.vectorScore);
      const supportingChannel = Math.min(candidate.lexicalScore, candidate.vectorScore);
      candidate.directScore = strongerChannel + supportingChannel * 0.15;
    }

    const graphSeeds = [...candidates.values()]
      .sort((left, right) => right.directScore - left.directScore)
      .slice(0, graphSeedLimit);

    graphSeeds.forEach((seed, seedIndex) => {
      const seedPassage = passagesById.get(seed.passageId);
      const seedVerseIds = seed.seedVerseIds.size
        ? [...seed.seedVerseIds]
        : seedPassage.verseIds.slice(0, 3);

      for (const seedVerseId of seedVerseIds.slice(0, 5)) {
        const edges = (graph.nodes[seedVerseId] ?? []).slice(0, graphEdgesPerVerse);
        const strongestWeight = edges[0]?.weight ?? 1;
        for (const edge of edges) {
          const targetVerseIds = expandCanonicalRange(translationId, edge.toStart, edge.toEnd);
          const targetPassageIds = new Set();
          targetVerseIds.forEach((verseId) => {
            const ids = passageIdsByVerse.get(`${translationId}:${verseId}`);
            ids?.forEach((id) => targetPassageIds.add(id));
          });

          for (const targetPassageId of targetPassageIds) {
            if (targetPassageId === seed.passageId) continue;
            const target = addCandidate(candidates, targetPassageId);
            const relativeWeight = edge.weight / strongestWeight;
            const contribution = seed.directScore
              * (1 / (seedIndex + 1))
              * relativeWeight
              * 0.04;
            target.graphScore += contribution;
            target.channels.add('cross_reference');
            target.crossReferences.push({
              from: seedVerseId,
              toStart: edge.toStart,
              toEnd: edge.toEnd,
              votes: edge.votes,
              seedPassageId: seed.passageId,
            });
          }
        }
      }
    });

    return [...candidates.values()]
      .map((candidate) => ({
        ...candidate,
        graphScore: Math.min(candidate.graphScore, 0.12),
        score: candidate.directScore + Math.min(candidate.graphScore, 0.12),
        passage: passagesById.get(candidate.passageId),
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((result, rank) => ({
        rank: rank + 1,
        score: Number(result.score.toFixed(8)),
        scoreBreakdown: {
          lexical: Number(result.lexicalScore.toFixed(8)),
          vector: Number(result.vectorScore.toFixed(8)),
          graph: Number(result.graphScore.toFixed(8)),
        },
        channels: [...result.channels],
        matchedVerseIds: [...result.seedVerseIds],
        crossReferences: result.crossReferences
          .sort((left, right) => right.votes - left.votes)
          .slice(0, 5),
        passage: result.passage,
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
