import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseOpenBibleReference } from './lib/bible-reference.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function* readJsonLines(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;

  for await (const line of lines) {
    lineNumber += 1;
    if (!line.trim()) continue;
    try {
      yield JSON.parse(line);
    } catch (error) {
      throw new Error(`${filePath}:${lineNumber}: invalid JSON`, { cause: error });
    }
  }
}

function increment(map, key, amount = 1) {
  map.set(key, (map.get(key) ?? 0) + amount);
}

async function validateVerses(filePath) {
  const records = new Map();
  const canonicalIds = new Set();
  const counts = new Map();
  const canonicalCounts = new Map();

  for await (const verse of readJsonLines(filePath)) {
    assert(verse.schemaVersion === 1 && verse.type === 'verse', `${verse.id}: invalid verse schema`);
    assert(verse.id && !records.has(verse.id), `${verse.id}: duplicate verse record ID`);
    assert(verse.translation?.id, `${verse.id}: missing translation`);
    assert(verse.book?.id && verse.book?.osis, `${verse.id}: missing book metadata`);
    assert(Number.isInteger(verse.chapter) && verse.chapter > 0, `${verse.id}: invalid chapter`);
    assert(Number.isInteger(verse.verseStart) && verse.verseStart > 0, `${verse.id}: invalid verse`);
    assert(verse.verseEnd >= verse.verseStart, `${verse.id}: invalid verse range`);
    assert(typeof verse.text === 'string' && verse.text.trim(), `${verse.id}: empty text`);
    assert(Array.isArray(verse.canonicalIds) && verse.canonicalIds.length, `${verse.id}: missing canonical IDs`);
    assert(verse.canonicalIds[0] === verse.canonicalStart, `${verse.id}: canonical start mismatch`);
    assert(verse.canonicalIds.at(-1) === verse.canonicalEnd, `${verse.id}: canonical end mismatch`);

    for (const canonicalId of verse.canonicalIds) {
      const parsed = parseOpenBibleReference(canonicalId);
      assert(parsed.start.bookId === verse.book.id, `${verse.id}: canonical book mismatch`);
      assert(parsed.start.chapter === verse.chapter, `${verse.id}: canonical chapter mismatch`);
      canonicalIds.add(canonicalId);
    }

    records.set(verse.id, {
      translationId: verse.translation.id,
      bookId: verse.book.id,
      chapter: verse.chapter,
      canonicalIds: verse.canonicalIds,
      text: verse.text,
    });
    increment(counts, verse.translation.id);
    increment(canonicalCounts, verse.translation.id, verse.canonicalIds.length);
  }

  return { records, canonicalIds, counts, canonicalCounts };
}

async function validatePassages(filePath, verses) {
  const ids = new Set();
  const textSegmentsByVerseRecord = new Map();
  const counts = new Map();
  const headingCounts = new Map();

  for await (const passage of readJsonLines(filePath)) {
    assert(passage.schemaVersion === 1 && passage.type === 'passage', `${passage.id}: invalid passage schema`);
    assert(passage.id && !ids.has(passage.id), `${passage.id}: duplicate passage ID`);
    assert(passage.translation?.id, `${passage.id}: missing translation`);
    assert(Array.isArray(passage.verseRecordIds) && passage.verseRecordIds.length, `${passage.id}: empty passage`);
    assert(Array.isArray(passage.verseIds) && passage.verseIds.length, `${passage.id}: missing verse IDs`);
    assert(Array.isArray(passage.contentSegments) && passage.contentSegments.length, `${passage.id}: missing content segments`);
    assert(typeof passage.content === 'string' && passage.content.trim(), `${passage.id}: empty passage content`);
    assert(typeof passage.embeddingText === 'string' && passage.embeddingText.includes(passage.content), `${passage.id}: invalid embedding text`);
    assert(
      passage.heading ? passage.boundary === 'source_heading' : passage.boundary === 'chapter_start',
      `${passage.id}: invalid source-heading boundary`,
    );

    const start = parseOpenBibleReference(passage.canonicalStart).start;
    const end = parseOpenBibleReference(passage.canonicalEnd).start;
    assert(start.bookId === end.bookId && start.chapter === end.chapter, `${passage.id}: passage crosses a chapter`);

    const expectedVerseRecordIds = [...new Set(
      passage.contentSegments.map((segment) => segment.verseRecordId),
    )];
    const expectedVerseIds = [...new Set(
      passage.contentSegments.flatMap((segment) => segment.canonicalIds),
    )];
    assert(
      JSON.stringify(passage.verseRecordIds) === JSON.stringify(expectedVerseRecordIds),
      `${passage.id}: verse record list does not match content segments`,
    );
    assert(
      JSON.stringify(passage.verseIds) === JSON.stringify(expectedVerseIds),
      `${passage.id}: canonical verse list does not match content segments`,
    );
    assert(
      passage.contentSegments.map((segment) => segment.text).join(' ') === passage.content,
      `${passage.id}: passage content does not match content segments`,
    );

    for (const segment of passage.contentSegments) {
      const verse = verses.records.get(segment.verseRecordId);
      assert(verse, `${passage.id}: unknown verse record ${segment.verseRecordId}`);
      assert(verse.translationId === passage.translation.id, `${passage.id}: translation mismatch`);
      assert(verse.bookId === passage.book.id && verse.chapter === passage.chapter, `${passage.id}: chapter mismatch`);
      assert(
        JSON.stringify(segment.canonicalIds) === JSON.stringify(verse.canonicalIds),
        `${passage.id}: segment canonical IDs do not match ${segment.verseRecordId}`,
      );
      const collectedSegments = textSegmentsByVerseRecord.get(segment.verseRecordId) ?? [];
      collectedSegments.push(segment.text);
      textSegmentsByVerseRecord.set(segment.verseRecordId, collectedSegments);
    }

    ids.add(passage.id);
    increment(counts, passage.translation.id);
    if (passage.heading) increment(headingCounts, passage.translation.id);
  }

  for (const [verseRecordId, verse] of verses.records) {
    const reconstructed = (textSegmentsByVerseRecord.get(verseRecordId) ?? []).join(' ');
    assert(reconstructed === verse.text, `${verseRecordId}: passage segments do not reconstruct verse text`);
  }
  return { ids, counts, headingCounts };
}

async function validateCrossReferences(filePath, availableCanonicalIds) {
  const ids = new Set();
  const sourceNodes = new Set();
  const unavailableCanonicalIds = new Set();
  const stats = {
    edges: 0,
    activeEdges: 0,
    inactiveEdges: 0,
    sourceRanges: 0,
    targetRanges: 0,
    edgesWithUnavailableKoreanEndpoint: 0,
    minVotes: Number.POSITIVE_INFINITY,
    maxVotes: Number.NEGATIVE_INFINITY,
  };

  for await (const edge of readJsonLines(filePath)) {
    assert(edge.schemaVersion === 1 && edge.type === 'cross_reference', `${edge.id}: invalid edge schema`);
    assert(edge.id && !ids.has(edge.id), `${edge.id}: duplicate edge ID`);
    assert(Number.isInteger(edge.votes), `${edge.id}: invalid vote count`);
    assert(edge.active === (edge.votes > 0), `${edge.id}: active flag does not match votes`);
    assert(
      edge.weight === (edge.active ? Number(Math.log1p(edge.votes).toFixed(6)) : 0),
      `${edge.id}: invalid edge weight`,
    );
    assert(edge.source?.id === 'openbible-cross-references', `${edge.id}: missing attribution`);

    const from = parseOpenBibleReference(
      edge.from.start === edge.from.end ? edge.from.start : `${edge.from.start}-${edge.from.end}`,
    );
    const to = parseOpenBibleReference(
      edge.to.start === edge.to.end ? edge.to.start : `${edge.to.start}-${edge.to.end}`,
    );
    assert(from.isRange === edge.from.isRange, `${edge.id}: source range flag mismatch`);
    assert(to.isRange === edge.to.isRange, `${edge.id}: target range flag mismatch`);

    const endpoints = [edge.from.start, edge.from.end, edge.to.start, edge.to.end];
    const unavailable = endpoints.filter((id) => !availableCanonicalIds.has(id));
    unavailable.forEach((id) => unavailableCanonicalIds.add(id));

    ids.add(edge.id);
    sourceNodes.add(edge.from.start === edge.from.end
      ? edge.from.start
      : `${edge.from.start}-${edge.from.end}`);
    stats.edges += 1;
    stats.activeEdges += edge.active ? 1 : 0;
    stats.inactiveEdges += edge.active ? 0 : 1;
    stats.sourceRanges += edge.from.isRange ? 1 : 0;
    stats.targetRanges += edge.to.isRange ? 1 : 0;
    stats.edgesWithUnavailableKoreanEndpoint += unavailable.length ? 1 : 0;
    stats.minVotes = Math.min(stats.minVotes, edge.votes);
    stats.maxVotes = Math.max(stats.maxVotes, edge.votes);
  }

  return {
    ...stats,
    sourceNodes: sourceNodes.size,
    unavailableCanonicalEndpoints: unavailableCanonicalIds.size,
  };
}

function assertStat(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${expected}, received ${actual}`);
}

async function validate() {
  const manifest = JSON.parse(await readFile(path.join(derivedRoot, 'manifest.json'), 'utf8'));
  assert(manifest.schemaVersion === 1, 'Unsupported RAG manifest schema.');
  assert(manifest.chunkingPolicy?.passageBoundary === 'chapter_and_source_heading', 'Unexpected chunking policy.');
  assert(manifest.chunkingPolicy?.artificialTokenBoundary === false, 'Artificial token chunking must be disabled.');

  for (const file of Object.values(manifest.files)) {
    const actualHash = await sha256File(path.join(derivedRoot, file.path));
    assert(actualHash === file.sha256, `${file.path}: SHA-256 mismatch`);
  }

  const verses = await validateVerses(path.join(derivedRoot, manifest.files.verses.path));
  const passages = await validatePassages(path.join(derivedRoot, manifest.files.passages.path), verses);
  const crossReferences = await validateCrossReferences(
    path.join(derivedRoot, manifest.files.crossReferences.path),
    verses.canonicalIds,
  );

  assertStat(verses.records.size, manifest.files.verses.records, 'Verse record count');
  assertStat(passages.ids.size, manifest.files.passages.records, 'Passage record count');
  assertStat(crossReferences.edges, manifest.files.crossReferences.records, 'Cross-reference record count');

  for (const translation of manifest.translations) {
    assertStat(verses.counts.get(translation.id), translation.verseRecords, `${translation.label} verse records`);
    assertStat(
      verses.canonicalCounts.get(translation.id),
      translation.canonicalPositionsAvailable,
      `${translation.label} canonical positions`,
    );
    assertStat(passages.counts.get(translation.id), translation.passages, `${translation.label} passages`);
    assertStat(
      passages.headingCounts.get(translation.id),
      translation.passagesWithHeading,
      `${translation.label} headed passages`,
    );
  }

  for (const [key, expected] of Object.entries(manifest.crossReferences)) {
    assertStat(crossReferences[key], expected, `Cross references ${key}`);
  }

  console.log(
    `절 문서 ${verses.records.size}개와 소제목 문단 ${passages.ids.size}개가 `
    + `모든 절을 중복 없이 포함합니다.`,
  );
  console.log(
    `관주 ${crossReferences.edges}개를 검증했습니다 `
    + `(활성 ${crossReferences.activeEdges}개, 범위 대상 ${crossReferences.targetRanges}개).`,
  );
  console.log('RAG 파생 코퍼스 검증을 통과했습니다.');
}

await validate();
