import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonLines, readJsonLines } from './lib/jsonl.mjs';
import {
  createEmbeddingWindows,
  createLocalEmbedder,
  LOCAL_EMBEDDING_MODEL,
} from './lib/local-embedder.mjs';
import { buildBm25Index } from './lib/search-text.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
const indexRoot = path.join(repositoryRoot, 'data', 'rag', 'index');
const temporaryRoot = path.join(repositoryRoot, 'data', 'rag', `.index-${process.pid}`);
const modelCacheRoot = path.join(repositoryRoot, 'data', 'rag', 'models');
const embeddingBatchSize = 16;
const crossReferencesPerVerse = 8;

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

async function buildVectorIndex(passages, vectorPath, metadataPath) {
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
  let windowCount = 0;
  let batch = [];

  const flushBatch = async () => {
    if (!batch.length) return;
    const output = await embedder.embedPassages(batch.map((item) => item.window.text));
    assert(output.dims[0] === batch.length, 'Embedding batch size mismatch.');
    assert(output.dims[1] === LOCAL_EMBEDDING_MODEL.dimensions, 'Embedding dimension mismatch.');
    await writeChunk(
      vectorStream,
      Buffer.from(output.data.buffer, output.data.byteOffset, output.data.byteLength),
    );

    for (const item of batch) {
      const metadata = {
        schemaVersion: 1,
        vectorIndex: windowCount,
        passageId: item.passage.id,
        translationId: item.passage.translation.id,
        windowIndex: item.window.index,
        canonicalStart: item.window.canonicalStart,
        canonicalEnd: item.window.canonicalEnd,
        verseIds: item.window.verseIds,
        tokenCount: item.window.tokenCount,
      };
      await writeChunk(metadataStream, `${JSON.stringify(metadata)}\n`);
      windowCount += 1;
    }
    batch = [];
    if (windowCount % 500 < embeddingBatchSize) {
      console.log(`임베딩 ${windowCount}개 생성 완료`);
    }
  };

  try {
    for (const passage of passages) {
      const windows = createEmbeddingWindows(passage, embedder.tokenizer);
      for (const window of windows) {
        batch.push({ passage, window });
        if (batch.length >= embeddingBatchSize) await flushBatch();
      }
    }
    await flushBatch();
  } finally {
    await Promise.all([finishStream(vectorStream), finishStream(metadataStream)]);
    await embedder.dispose();
  }

  return { windowCount, dimensions: LOCAL_EMBEDDING_MODEL.dimensions };
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
      toStart: edge.to.start,
      toEnd: edge.to.end,
      votes: edge.votes,
      weight: edge.weight,
    });
  }

  const nodes = Object.fromEntries([...adjacency].sort(([left], [right]) => left.localeCompare(right)));
  const keptEdges = Object.values(nodes).reduce((sum, edges) => sum + edges.length, 0);
  await writeFile(outputPath, `${JSON.stringify({
    schemaVersion: 1,
    source: 'openbible-cross-references',
    direction: 'outgoing',
    policy: {
      activeOnly: true,
      maxEdgesPerSource: crossReferencesPerVerse,
      order: 'votes_descending',
    },
    activeEdgesRead,
    keptEdges,
    nodes,
  })}\n`, 'utf8');
  return { sourceNodes: adjacency.size, activeEdgesRead, keptEdges };
}

async function build() {
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });

  try {
    const corpusManifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
    const passagesPath = path.join(derivedRoot, corpusManifest.files.passages.path);
    const crossReferencesPath = path.join(derivedRoot, corpusManifest.files.crossReferences.path);
    const passages = await loadJsonLines(passagesPath);
    assert(passages.length === corpusManifest.files.passages.records, 'Passage count does not match corpus manifest.');

    console.log(`BM25 인덱스 생성 중: ${passages.length}개 문단`);
    const lexicalIndex = buildBm25Index(passages);
    const lexicalPath = path.join(temporaryRoot, 'lexical-index.json');
    await writeFile(lexicalPath, `${JSON.stringify(lexicalIndex)}\n`, 'utf8');

    console.log(`벡터 인덱스 생성 중: ${LOCAL_EMBEDDING_MODEL.id}`);
    const vectorPath = path.join(temporaryRoot, 'vectors.f32');
    const vectorMetadataPath = path.join(temporaryRoot, 'vector-windows.jsonl');
    const vectors = await buildVectorIndex(passages, vectorPath, vectorMetadataPath);

    console.log('상위 1-hop 관주 인덱스 생성 중');
    const crossReferenceIndexPath = path.join(temporaryRoot, 'cross-reference-top.json');
    const crossReferences = await buildCrossReferenceIndex(
      crossReferencesPath,
      crossReferenceIndexPath,
    );

    const outputFiles = {
      lexical: { path: 'lexical-index.json', sha256: await sha256File(lexicalPath) },
      vectors: { path: 'vectors.f32', sha256: await sha256File(vectorPath) },
      vectorMetadata: {
        path: 'vector-windows.jsonl',
        sha256: await sha256File(vectorMetadataPath),
      },
      crossReferences: {
        path: 'cross-reference-top.json',
        sha256: await sha256File(crossReferenceIndexPath),
      },
    };
    const manifest = {
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      corpus: {
        manifest: 'data/rag/derived/manifest.json',
        passagesSha256: corpusManifest.files.passages.sha256,
        passageRecords: passages.length,
      },
      lexical: {
        tokenizer: lexicalIndex.tokenizer,
        parameters: lexicalIndex.parameters,
        terms: Object.keys(lexicalIndex.terms).length,
      },
      embeddings: {
        ...LOCAL_EMBEDDING_MODEL,
        format: 'row_major_float32_little_endian',
        windows: vectors.windowCount,
      },
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
      + `벡터 ${vectors.windowCount}개, 상위 관주 ${crossReferences.keptEdges}개`,
    );
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

await build();
