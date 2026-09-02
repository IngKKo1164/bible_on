import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonLines } from './lib/jsonl.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
const metadataRoot = path.join(repositoryRoot, 'data', 'rag', 'metadata');
const indexRoot = path.join(repositoryRoot, 'data', 'rag', 'index');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

const manifest = JSON.parse(await readFile(path.join(indexRoot, 'manifest.json'), 'utf8'));
const corpusManifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
const metadataManifest = JSON.parse(await readFile(path.join(metadataRoot, 'manifest.json'), 'utf8'));
assert(manifest.schemaVersion === 2, 'Unsupported search-index manifest schema.');
assert(
  manifest.corpus.passagesSha256 === corpusManifest.files.passages.sha256,
  'Search index was built from a different passage corpus.',
);
assert(
  manifest.corpus.versesSha256 === corpusManifest.files.verses.sha256,
  'Search index was built from a different verse corpus.',
);
assert(
  manifest.metadata.topicsSha256 === metadataManifest.files.topics.sha256
  && manifest.metadata.topicAssociationsSha256
    === metadataManifest.files.topicAssociations.sha256
  && manifest.metadata.commentarySha256 === metadataManifest.files.commentary.sha256,
  'Search index was built from different linked metadata.',
);

for (const file of Object.values(manifest.files)) {
  const actual = await sha256File(path.join(indexRoot, file.path));
  assert(actual === file.sha256, `${file.path}: SHA-256 mismatch`);
}

const lexical = JSON.parse(await readFile(path.join(indexRoot, manifest.files.lexical.path), 'utf8'));
assert(lexical.documents.length === manifest.corpus.passageRecords, 'BM25 document count mismatch.');
assert(Object.keys(lexical.terms).length === manifest.lexical.terms, 'BM25 term count mismatch.');

const vectorMetadata = await loadJsonLines(
  path.join(indexRoot, manifest.files.vectorMetadata.path),
);
assert(vectorMetadata.length === manifest.embeddings.vectors, 'Vector metadata count mismatch.');
const allowedViews = new Set(['body', 'heading_scene', 'topic', 'commentary']);
const viewCounts = {};
vectorMetadata.forEach((metadata, index) => {
  assert(metadata.schemaVersion === 2, `${metadata.sourceRecordId}: invalid vector schema`);
  assert(metadata.vectorIndex === index, `${metadata.sourceRecordId}: vector index is not contiguous`);
  assert(allowedViews.has(metadata.view), `${metadata.sourceRecordId}: unknown vector view`);
  assert(metadata.tokenCount <= manifest.embeddings.maxTokens, `${metadata.sourceRecordId}: token limit exceeded`);
  assert(Array.isArray(metadata.passageIds), `${metadata.sourceRecordId}: passage IDs must be an array`);
  assert(Array.isArray(metadata.verseIds), `${metadata.sourceRecordId}: verse IDs must be an array`);
  if (metadata.view === 'body' || metadata.view === 'heading_scene') {
    assert(metadata.translationId, `${metadata.sourceRecordId}: translation is required`);
    assert(metadata.passageIds.length && metadata.verseIds.length, `${metadata.sourceRecordId}: missing Bible links`);
  }
  if (metadata.view === 'topic') {
    assert(
      metadata.topicId && metadata.topicLabel && metadata.translationId === null,
      `${metadata.sourceRecordId}: invalid topic vector`,
    );
  }
  if (metadata.view === 'commentary') {
    assert(
      metadata.commentaryId
      && metadata.commentaryTitle
      && metadata.translationId === null
      && metadata.verseIds.length,
      `${metadata.sourceRecordId}: invalid commentary vector`,
    );
  }
  viewCounts[metadata.view] = (viewCounts[metadata.view] ?? 0) + 1;
});
for (const view of allowedViews) {
  assert(
    (viewCounts[view] ?? 0) === (manifest.embeddings.views[view] ?? 0),
    `${view}: vector view count mismatch`,
  );
}
assert(viewCounts.body === manifest.corpus.verseRecords, 'Each translated verse needs a body vector.');
assert(
  viewCounts.topic === metadataManifest.topics.definitions,
  'Each OpenBible topic needs a topic vector.',
);
if (metadataManifest.commentary.records === 0) {
  assert(!viewCounts.commentary, 'Empty commentary input must not create commentary vectors.');
} else {
  assert(
    viewCounts.commentary >= metadataManifest.commentary.records,
    'Each commentary record needs at least one vector.',
  );
}
const vectorFile = await readFile(path.join(indexRoot, manifest.files.vectors.path));
assert(
  vectorFile.byteLength === manifest.embeddings.vectors * manifest.embeddings.dimensions * 4,
  'Vector binary size mismatch.',
);

const topicLinks = JSON.parse(await readFile(
  path.join(indexRoot, manifest.files.topicLinks.path),
  'utf8',
));
assert(topicLinks.direction === 'topic_to_canonical_verses', 'Invalid topic-link direction.');
assert(Object.keys(topicLinks.nodes).length === manifest.topics.topicNodes, 'Topic node count mismatch.');
let keptTopicLinks = 0;
for (const links of Object.values(topicLinks.nodes)) {
  assert(links.length <= topicLinks.policy.maxLinksPerTopic, 'Topic link limit exceeded.');
  for (let index = 1; index < links.length; index += 1) {
    assert(
      links[index - 1].qualityScore >= links[index].qualityScore,
      'Topic links are not quality-sorted.',
    );
  }
  keptTopicLinks += links.length;
}
assert(keptTopicLinks === manifest.topics.keptLinks, 'Topic link count mismatch.');

const crossReferences = JSON.parse(await readFile(
  path.join(indexRoot, manifest.files.crossReferences.path),
  'utf8',
));
assert(crossReferences.expansionDepth === 1, 'Cross-reference expansion must be exactly one hop.');
assert(
  crossReferences.relationType === 'editorial_cross_reference',
  'Invalid cross-reference relation type.',
);
assert(
  Object.keys(crossReferences.nodes).length === manifest.crossReferences.sourceNodes,
  'Graph node count mismatch.',
);
let keptEdges = 0;
for (const edges of Object.values(crossReferences.nodes)) {
  assert(edges.length <= crossReferences.policy.maxEdgesPerSource, 'Graph edge limit exceeded.');
  assert(edges.every((edge) => edge.votes > 0), 'Inactive graph edge was indexed.');
  assert(
    edges.every((edge) => edge.relationType === 'editorial_cross_reference'),
    'Graph edge relation type mismatch.',
  );
  for (let index = 1; index < edges.length; index += 1) {
    assert(edges[index - 1].votes >= edges[index].votes, 'Graph edges are not vote-sorted.');
  }
  keptEdges += edges.length;
}
assert(keptEdges === manifest.crossReferences.keptEdges, 'Graph edge count mismatch.');

console.log(
  `검색 인덱스 검증 완료: BM25 ${manifest.lexical.terms}개 용어, `
  + `다중 표현 벡터 ${manifest.embeddings.vectors}개, `
  + `주제 연결 ${keptTopicLinks}개, 1-hop 관주 ${keptEdges}개.`,
);
