import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonLines, readJsonLines } from './lib/jsonl.mjs';
import {
  createLocalEmbedder,
  LOCAL_EMBEDDING_MODEL,
} from './lib/local-embedder.mjs';
import { buildBm25Index, retrievalHeading } from './lib/search-text.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
const metadataRoot = path.join(repositoryRoot, 'data', 'rag', 'metadata');
const indexRoot = path.join(repositoryRoot, 'data', 'rag', 'index');
const temporaryRoot = path.join(repositoryRoot, 'data', 'rag', `.index-${process.pid}`);
const modelCacheRoot = path.join(repositoryRoot, 'data', 'rag', 'models');
const embeddingBatchSize = 16;
const crossReferencesPerVerse = 8;
const topicLinksPerTopic = 32;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk)) await once(stream, 'drain');
}

async function finishStream(stream) {
  stream.end();
  await once(stream, 'finish');
}

function tokenIds(tokenizer, text) {
  return Array.from(tokenizer(text, {
    add_special_tokens: false,
    truncation: false,
  }).input_ids.data);
}

function splitTextForEmbedding(text, tokenizer) {
  const ids = tokenIds(tokenizer, text);
  const capacity = LOCAL_EMBEDDING_MODEL.maxTokens - 2;
  if (ids.length <= capacity) return [{ text, tokenCount: ids.length + 2 }];
  const windows = [];
  for (let start = 0; start < ids.length; start += capacity) {
    const slice = ids.slice(start, start + capacity);
    windows.push({
      text: tokenizer.decode(slice, { skip_special_tokens: true }),
      tokenCount: slice.length + 2,
    });
  }
  return windows;
}

function mapPassagesByVerseRecord(passages) {
  const index = new Map();
  for (const passage of passages) {
    for (const verseRecordId of passage.verseRecordIds) {
      const passageIds = index.get(verseRecordId) ?? new Set();
      passageIds.add(passage.id);
      index.set(verseRecordId, passageIds);
    }
  }
  return index;
}

function createVectorSourceRecords({ verses, passages, topics, commentary }) {
  const passageIdsByVerseRecord = mapPassagesByVerseRecord(passages);
  const records = [];

  for (const verse of verses) {
    records.push({
      view: 'body',
      text: `${verse.book.name} ${verse.chapter}장 ${verse.verseStart}절\n${verse.text}`,
      translationId: verse.translation.id,
      passageIds: [...(passageIdsByVerseRecord.get(verse.id) ?? [])],
      verseIds: verse.canonicalIds,
      sourceRecordId: verse.id,
    });
  }

  for (const passage of passages) {
    const heading = retrievalHeading(passage);
    if (!heading) continue;
    records.push({
      view: 'heading_scene',
      text: `${passage.book.name} ${passage.chapter}장\n소제목과 장면: ${heading}`,
      translationId: passage.translation.id,
      passageIds: [passage.id],
      verseIds: passage.verseIds,
      sourceRecordId: passage.id,
    });
  }

  for (const topic of topics) {
    records.push({
      view: 'topic',
      text: `Bible topic: ${topic.label}`,
      translationId: null,
      passageIds: [],
      verseIds: [],
      topicId: topic.id,
      topicLabel: topic.label,
      sourceRecordId: topic.id,
    });
  }

  for (const record of commentary) {
    records.push({
      view: 'commentary',
      text: `${record.title}\n${record.content}`,
      translationId: null,
      passageIds: [],
      verseIds: record.verseIds,
      commentaryId: record.id,
      commentaryTitle: record.title,
      sourceRecordId: record.id,
    });
  }
  return records;
}

async function buildVectorIndex(sourceRecords, vectorPath, metadataPath) {
  const vectorStream = createWriteStream(vectorPath);
  const metadataStream = createWriteStream(metadataPath, { encoding: 'utf8' });
  let modelProgressShown = false;
  const embedder = await createLocalEmbedder({
    cacheDirectory: modelCacheRoot,
    onProgress(progress) {
      if (!modelProgressShown && progress.status === 'progress') {
        console.log('로컬 임베딩 모델을 준비하고 있습니다.');
        modelProgressShown = true;
      }
    },
  });
  let vectorCount = 0;
  let batch = [];
  const viewCounts = {};

  const flushBatch = async () => {
    if (!batch.length) return;
    const output = await embedder.embedPassages(batch.map((item) => item.text));
    assert(output.dims[0] === batch.length, 'Embedding batch size mismatch.');
    assert(output.dims[1] === LOCAL_EMBEDDING_MODEL.dimensions, 'Embedding dimension mismatch.');
    await writeChunk(
      vectorStream,
      Buffer.from(output.data.buffer, output.data.byteOffset, output.data.byteLength),
    );

    for (const item of batch) {
      const metadata = {
        schemaVersion: 2,
        vectorIndex: vectorCount,
        view: item.view,
        sourceRecordId: item.sourceRecordId,
        translationId: item.translationId,
        passageIds: item.passageIds,
        verseIds: item.verseIds,
        windowIndex: item.windowIndex,
        tokenCount: item.tokenCount,
        ...(item.topicId ? { topicId: item.topicId } : {}),
        ...(item.topicLabel ? { topicLabel: item.topicLabel } : {}),
        ...(item.commentaryId ? { commentaryId: item.commentaryId } : {}),
        ...(item.commentaryTitle ? { commentaryTitle: item.commentaryTitle } : {}),
      };
      await writeChunk(metadataStream, `${JSON.stringify(metadata)}\n`);
      vectorCount += 1;
      viewCounts[item.view] = (viewCounts[item.view] ?? 0) + 1;
    }
    batch = [];
    if (vectorCount % 2000 < embeddingBatchSize) {
      console.log(`다중 표현 임베딩 ${vectorCount}개 생성 완료`);
    }
  };

  try {
    for (const source of sourceRecords) {
      const windows = splitTextForEmbedding(source.text, embedder.tokenizer);
      for (let index = 0; index < windows.length; index += 1) {
        batch.push({ ...source, ...windows[index], windowIndex: index });
        if (batch.length >= embeddingBatchSize) await flushBatch();
      }
    }
    await flushBatch();
  } finally {
    await Promise.all([finishStream(vectorStream), finishStream(metadataStream)]);
    await embedder.dispose();
  }

  return {
    vectorCount,
    dimensions: LOCAL_EMBEDDING_MODEL.dimensions,
    views: viewCounts,
  };
}

function addTopCrossReference(adjacency, sourceId, edge) {
  const edges = adjacency.get(sourceId) ?? [];
  edges.push(edge);
  edges.sort((left, right) => right.votes - left.votes || left.toStart.localeCompare(right.toStart));
  if (edges.length > crossReferencesPerVerse) edges.length = crossReferencesPerVerse;
  adjacency.set(sourceId, edges);
}

async function buildCrossReferenceIndex(inputPath, outputPath) {
  const adjacency = new Map();
  let activeEdgesRead = 0;

  for await (const edge of readJsonLines(inputPath)) {
    if (!edge.active) continue;
    activeEdgesRead += 1;
    addTopCrossReference(adjacency, edge.from.start, {
      relationType: edge.relationType,
      toStart: edge.to.start,
      toEnd: edge.to.end,
      votes: edge.votes,
      weight: edge.weight,
    });
  }

  const nodes = Object.fromEntries([...adjacency].sort(([left], [right]) => left.localeCompare(right)));
  const keptEdges = Object.values(nodes).reduce((sum, edges) => sum + edges.length, 0);
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 2,
    source: 'openbible-cross-references',
    relationType: 'editorial_cross_reference',
    direction: 'outgoing',
    expansionDepth: 1,
    policy: {
      activeOnly: true,
      maxEdgesPerSource: crossReferencesPerVerse,
      order: 'votes_descending',
    },
    activeEdgesRead,
    keptEdges,
    nodes,
  })}\n`, 'utf8');
  return { sourceNodes: adjacency.size, activeEdgesRead, keptEdges, expansionDepth: 1 };
}

function addTopTopicLink(adjacency, association) {
  const links = adjacency.get(association.topicId) ?? [];
  links.push({
    associationId: association.id,
    verseIds: association.verseIds,
    qualityScore: association.qualityScore,
    votes: association.votes,
  });
  links.sort((left, right) => (
    right.qualityScore - left.qualityScore
    || (right.votes ?? -1) - (left.votes ?? -1)
  ));
  if (links.length > topicLinksPerTopic) links.length = topicLinksPerTopic;
  adjacency.set(association.topicId, links);
}

async function buildTopicLinkIndex(associations, outputPath) {
  const adjacency = new Map();
  for (const association of associations) addTopTopicLink(adjacency, association);
  const nodes = Object.fromEntries([...adjacency].sort(([left], [right]) => left.localeCompare(right)));
  const keptLinks = Object.values(nodes).reduce((sum, links) => sum + links.length, 0);
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    source: 'openbible-topics',
    direction: 'topic_to_canonical_verses',
    policy: {
      maxLinksPerTopic: topicLinksPerTopic,
      order: 'quality_score_then_votes_descending',
    },
    sourceAssociations: associations.length,
    topicNodes: adjacency.size,
    keptLinks,
    nodes,
  })}\n`, 'utf8');
  return { topicNodes: adjacency.size, sourceAssociations: associations.length, keptLinks };
}

async function build() {
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });

  try {
    const corpusManifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
    const metadataManifest = JSON.parse(await readFile(path.join(metadataRoot, 'manifest.json'), 'utf8'));
    assert(
      metadataManifest.corpus.passagesSha256 === corpusManifest.files.passages.sha256,
      'Linked metadata was built from a different passage corpus.',
    );
    const [passages, verses, topics, topicAssociations, commentary] = await Promise.all([
      loadJsonLines(path.join(derivedRoot, corpusManifest.files.passages.path)),
      loadJsonLines(path.join(derivedRoot, corpusManifest.files.verses.path)),
      loadJsonLines(path.join(metadataRoot, metadataManifest.files.topics.path)),
      loadJsonLines(path.join(metadataRoot, metadataManifest.files.topicAssociations.path)),
      loadJsonLines(path.join(metadataRoot, metadataManifest.files.commentary.path)),
    ]);
    assert(passages.length === corpusManifest.files.passages.records, 'Passage count mismatch.');
    assert(verses.length === corpusManifest.files.verses.records, 'Verse count mismatch.');

    console.log(`BM25 인덱스 생성 중: ${passages.length}개 문단`);
    const lexicalIndex = buildBm25Index(passages);
    const lexicalPath = path.join(temporaryRoot, 'lexical-index.json');
    await writeFile(lexicalPath, `${JSON.stringify(lexicalIndex)}\n`, 'utf8');

    const vectorSources = createVectorSourceRecords({ verses, passages, topics, commentary });
    console.log(
      `다중 표현 벡터 인덱스 생성 중: 절 ${verses.length}, 소제목 ${passages.length}, `
      + `주제 ${topics.length}, 주석 ${commentary.length}`,
    );
    const vectorPath = path.join(temporaryRoot, 'vectors.f32');
    const vectorMetadataPath = path.join(temporaryRoot, 'vector-records.jsonl');
    const vectors = await buildVectorIndex(vectorSources, vectorPath, vectorMetadataPath);

    console.log('OpenBible 주제 역색인 생성 중');
    const topicLinkIndexPath = path.join(temporaryRoot, 'topic-links-top.json');
    const topicLinks = await buildTopicLinkIndex(topicAssociations, topicLinkIndexPath);

    console.log('상위 1-hop 관주 인덱스 생성 중');
    const crossReferenceIndexPath = path.join(temporaryRoot, 'cross-reference-top.json');
    const crossReferences = await buildCrossReferenceIndex(
      path.join(derivedRoot, corpusManifest.files.crossReferences.path),
      crossReferenceIndexPath,
    );

    const outputFiles = {
      lexical: { path: 'lexical-index.json', sha256: await sha256File(lexicalPath) },
      vectors: { path: 'vectors.f32', sha256: await sha256File(vectorPath) },
      vectorMetadata: {
        path: 'vector-records.jsonl',
        sha256: await sha256File(vectorMetadataPath),
      },
      topicLinks: {
        path: 'topic-links-top.json',
        sha256: await sha256File(topicLinkIndexPath),
      },
      crossReferences: {
        path: 'cross-reference-top.json',
        sha256: await sha256File(crossReferenceIndexPath),
      },
    };
    const manifest = {
      schemaVersion: 2,
      generatedAtUtc: new Date().toISOString(),
      corpus: {
        manifest: 'data/rag/derived/manifest.json',
        passagesSha256: corpusManifest.files.passages.sha256,
        versesSha256: corpusManifest.files.verses.sha256,
        passageRecords: passages.length,
        verseRecords: verses.length,
      },
      metadata: {
        manifest: 'data/rag/metadata/manifest.json',
        topicsSha256: metadataManifest.files.topics.sha256,
        topicAssociationsSha256: metadataManifest.files.topicAssociations.sha256,
        commentarySha256: metadataManifest.files.commentary.sha256,
      },
      lexical: {
        tokenizer: lexicalIndex.tokenizer,
        parameters: lexicalIndex.parameters,
        terms: Object.keys(lexicalIndex.terms).length,
      },
      embeddings: {
        ...LOCAL_EMBEDDING_MODEL,
        format: 'row_major_float32_little_endian',
        vectors: vectors.vectorCount,
        views: vectors.views,
        policy: 'verse_linked_multi_view',
      },
      topics: topicLinks,
      crossReferences,
      files: outputFiles,
    };
    await writeFile(
      path.join(temporaryRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );

    await rm(indexRoot, { recursive: true, force: true });
    await rename(temporaryRoot, indexRoot);
    console.log(
      `검색 인덱스를 생성했습니다: BM25 용어 ${manifest.lexical.terms}개, `
      + `다중 표현 벡터 ${vectors.vectorCount}개, 주제 연결 ${topicLinks.keptLinks}개, `
      + `상위 관주 ${crossReferences.keptEdges}개`,
    );
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

await build();
