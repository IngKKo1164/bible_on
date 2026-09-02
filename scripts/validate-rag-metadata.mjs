import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonLines } from './lib/jsonl.mjs';
import { parseOpenBibleReference, formatCanonicalRange } from './lib/bible-reference.mjs';
import { validateDatingClaim } from './lib/rag-metadata.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
const metadataRoot = path.join(repositoryRoot, 'data', 'rag', 'metadata');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function assertCount(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, received ${actual}`);
}

async function loadCanonicalIds(corpusManifest) {
  const ids = new Set();
  for await (const verse of readJsonLines(
    path.join(derivedRoot, corpusManifest.files.verses.path),
  )) {
    verse.canonicalIds.forEach((id) => ids.add(id));
  }
  return ids;
}

async function validate() {
  const metadataManifest = JSON.parse(await readFile(path.join(metadataRoot, 'manifest.json'), 'utf8'));
  const corpusManifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
  assert(metadataManifest.schemaVersion === 1, 'Unsupported metadata manifest schema.');
  assert(metadataManifest.architecture?.joinKey === 'canonical OSIS verse ID', 'Unexpected metadata join key.');
  assert(
    metadataManifest.corpus.passagesSha256 === corpusManifest.files.passages.sha256,
    'Metadata was built from a different passage corpus.',
  );
  assert(
    metadataManifest.relations.editorialCrossReferences.sha256
      === corpusManifest.files.crossReferences.sha256,
    'Metadata points to a different editorial cross-reference graph.',
  );

  for (const file of Object.values(metadataManifest.files)) {
    const actualHash = await sha256File(path.join(metadataRoot, file.path));
    assert(actualHash === file.sha256, `${file.path}: SHA-256 mismatch`);
  }

  const canonicalIds = await loadCanonicalIds(corpusManifest);
  assertCount(canonicalIds.size, metadataManifest.corpus.canonicalVerses, 'Canonical verse count');

  const topicIds = new Set();
  for await (const topic of readJsonLines(path.join(metadataRoot, metadataManifest.files.topics.path))) {
    assert(topic.schemaVersion === 1 && topic.type === 'topic', `${topic.id}: invalid topic schema`);
    assert(topic.id && !topicIds.has(topic.id), `${topic.id}: duplicate topic ID`);
    assert(topic.label?.trim() && topic.normalizedLabel?.trim(), `${topic.id}: missing topic label`);
    assert(topic.source?.id === 'openbible-topics', `${topic.id}: missing topic attribution`);
    topicIds.add(topic.id);
  }
  assertCount(topicIds.size, metadataManifest.files.topics.records, 'Topic count');

  const associationIds = new Set();
  let associationsWithVotes = 0;
  for await (const association of readJsonLines(
    path.join(metadataRoot, metadataManifest.files.topicAssociations.path),
  )) {
    assert(
      association.schemaVersion === 1 && association.type === 'topic_association',
      `${association.id}: invalid topic association schema`,
    );
    assert(association.id && !associationIds.has(association.id), `${association.id}: duplicate association ID`);
    assert(topicIds.has(association.topicId), `${association.id}: unknown topic`);
    assert(Number.isInteger(association.qualityScore), `${association.id}: invalid quality score`);
    assert(association.votes === null || Number.isInteger(association.votes), `${association.id}: invalid votes`);
    assert(Array.isArray(association.verseIds) && association.verseIds.length, `${association.id}: no corpus overlap`);
    association.verseIds.forEach((id) => assert(canonicalIds.has(id), `${association.id}: unknown verse ${id}`));
    if (association.votes !== null) associationsWithVotes += 1;
    associationIds.add(association.id);
  }
  assertCount(
    associationIds.size,
    metadataManifest.files.topicAssociations.records,
    'Topic association count',
  );
  assertCount(
    associationsWithVotes,
    metadataManifest.topics.associationsWithVotes,
    'Topic associations with votes',
  );

  const originalIds = new Set();
  const originalVerseIds = new Set();
  let originalTokens = 0;
  for await (const record of readJsonLines(
    path.join(metadataRoot, metadataManifest.files.originalLanguage.path),
  )) {
    assert(
      record.schemaVersion === 1 && record.type === 'original_language_verse',
      `${record.id}: invalid original-language schema`,
    );
    assert(record.id && !originalIds.has(record.id), `${record.id}: duplicate original-language ID`);
    assert(canonicalIds.has(record.verseId), `${record.id}: unknown canonical verse`);
    assert(!originalVerseIds.has(record.verseId), `${record.id}: duplicate original-language verse`);
    assert(['he', 'grc'].includes(record.language), `${record.id}: invalid original language`);
    assert(Array.isArray(record.tokens) && record.tokens.length, `${record.id}: empty token list`);
    record.tokens.forEach((token) => {
      assert(Number.isInteger(token.position) && token.position > 0, `${record.id}: invalid token position`);
      assert(
        token.surface || (token.omitted === true && token.variants?.meaning),
        `${record.id}: token is missing its source-language surface or omission evidence`,
      );
      assert(Array.isArray(token.strongs), `${record.id}: token strongs must be an array`);
    });
    originalTokens += record.tokens.length;
    originalIds.add(record.id);
    originalVerseIds.add(record.verseId);
  }
  assertCount(originalIds.size, metadataManifest.files.originalLanguage.records, 'Original-language verse count');
  assertCount(originalTokens, metadataManifest.originalLanguage.tokens, 'Original-language token count');

  const lemmaIds = new Set();
  for await (const lemma of readJsonLines(path.join(metadataRoot, metadataManifest.files.lemmaIndex.path))) {
    assert(lemma.schemaVersion === 1 && lemma.type === 'lemma_verse_index', `${lemma.id}: invalid lemma schema`);
    assert(lemma.id && !lemmaIds.has(lemma.id), `${lemma.id}: duplicate lemma ID`);
    assert(lemma.relationType === 'shared_lemma', `${lemma.id}: invalid lemma relation type`);
    assert(lemma.verseCount === lemma.verseIds.length, `${lemma.id}: lemma verse count mismatch`);
    assert(new Set(lemma.verseIds).size === lemma.verseIds.length, `${lemma.id}: duplicate lemma verse`);
    lemma.verseIds.forEach((id) => assert(canonicalIds.has(id), `${lemma.id}: unknown verse ${id}`));
    lemmaIds.add(lemma.id);
  }
  assertCount(lemmaIds.size, metadataManifest.files.lemmaIndex.records, 'Lemma count');

  const datingIds = new Set();
  for await (const claim of readJsonLines(path.join(metadataRoot, metadataManifest.files.datingClaims.path))) {
    validateDatingClaim(claim);
    assert(!datingIds.has(claim.id), `${claim.id}: duplicate dating claim ID`);
    assert(Array.isArray(claim.verseIds) && claim.verseIds.length, `${claim.id}: no corpus overlap`);
    claim.verseIds.forEach((id) => assert(canonicalIds.has(id), `${claim.id}: unknown verse ${id}`));
    datingIds.add(claim.id);
  }
  assertCount(datingIds.size, metadataManifest.files.datingClaims.records, 'Dating claim count');

  let crossReferenceCount = 0;
  for await (const edge of readJsonLines(
    path.join(derivedRoot, corpusManifest.files.crossReferences.path),
  )) {
    assert(edge.relationType === 'editorial_cross_reference', `${edge.id}: missing relation type`);
    const from = formatCanonicalRange(edge.from.start, edge.from.end);
    const to = formatCanonicalRange(edge.to.start, edge.to.end);
    parseOpenBibleReference(from);
    parseOpenBibleReference(to);
    crossReferenceCount += 1;
  }
  assertCount(
    crossReferenceCount,
    metadataManifest.relations.editorialCrossReferences.records,
    'Editorial cross-reference count',
  );

  console.log(
    `메타데이터 검증 완료: 주제 연결 ${associationIds.size}개, 원어 ${originalIds.size}절/`
    + `${originalTokens}토큰, 표제어 ${lemmaIds.size}개, 연대 주장 ${datingIds.size}개.`,
  );
  console.log(`관주 ${crossReferenceCount}개가 editorial_cross_reference 유형을 가집니다.`);
}

await validate();
