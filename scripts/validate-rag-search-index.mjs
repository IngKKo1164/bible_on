import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadJsonLines } from './lib/jsonl.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
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
assert(manifest.schemaVersion === 1, 'Unsupported search-index manifest schema.');
assert(
  manifest.corpus.passagesSha256 === corpusManifest.files.passages.sha256,
  'Search index was built from a different passage corpus.',
);

for (const file of Object.values(manifest.files)) {
  const actual = await sha256File(path.join(indexRoot, file.path));
  assert(actual === file.sha256, `${file.path}: SHA-256 mismatch`);
}

const lexical = JSON.parse(await readFile(path.join(indexRoot, manifest.files.lexical.path), 'utf8'));
assert(lexical.documents.length === manifest.corpus.passageRecords, 'BM25 document count mismatch.');
assert(Object.keys(lexical.terms).length === manifest.lexical.terms, 'BM25 term count mismatch.');

const vectorMetadata = await loadJsonLines(path.join(indexRoot, manifest.files.vectorMetadata.path));
assert(vectorMetadata.length === manifest.embeddings.windows, 'Vector metadata count mismatch.');
vectorMetadata.forEach((metadata, index) => {
  assert(metadata.vectorIndex === index, `${metadata.passageId}: vector index is not contiguous`);
  assert(metadata.tokenCount <= manifest.embeddings.maxTokens, `${metadata.passageId}: token limit exceeded`);
});
const vectorFile = await readFile(path.join(indexRoot, manifest.files.vectors.path));
assert(
  vectorFile.byteLength === manifest.embeddings.windows * manifest.embeddings.dimensions * 4,
  'Vector binary size mismatch.',
);

const crossReferences = JSON.parse(await readFile(
  path.join(indexRoot, manifest.files.crossReferences.path),
  'utf8',
));
assert(Object.keys(crossReferences.nodes).length === manifest.crossReferences.sourceNodes, 'Graph node count mismatch.');
let keptEdges = 0;
for (const edges of Object.values(crossReferences.nodes)) {
  assert(edges.length <= crossReferences.policy.maxEdgesPerSource, 'Graph edge limit exceeded.');
  assert(edges.every((edge) => edge.votes > 0), 'Inactive graph edge was indexed.');
  for (let index = 1; index < edges.length; index += 1) {
    assert(edges[index - 1].votes >= edges[index].votes, 'Graph edges are not vote-sorted.');
  }
  keptEdges += edges.length;
}
assert(keptEdges === manifest.crossReferences.keptEdges, 'Graph edge count mismatch.');

console.log(
  `검색 인덱스 검증 완료: BM25 ${manifest.lexical.terms}개 용어, `
  + `벡터 ${manifest.embeddings.windows}개, 관주 ${keptEdges}개`,
);
