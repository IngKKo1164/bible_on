import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { bibleCatalog } from '../src/bibleData.js';
import { buildParagraphsForChapter } from './lib/rag-corpus.mjs';
import { formatCanonicalRange, parseOpenBibleReference } from './lib/bible-reference.mjs';

const TRANSLATIONS = [
  { id: 'GAE', label: '개역개정', directory: 'gae' },
  { id: 'RNKSV', label: '새번역', directory: 'rnksv' },
];
const OPEN_BIBLE_SOURCE = {
  id: 'openbible-cross-references',
  url: 'https://www.openbible.info/labs/cross-references/',
  license: 'CC BY 4.0',
};

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const bibleRoot = path.join(repositoryRoot, 'public', 'data', 'bible');
const crossReferencePath = path.join(
  repositoryRoot,
  'data',
  'rag',
  'raw',
  'cross-references',
  'openbible',
  'cross_references.txt',
);
const outputRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
const temporaryRoot = path.join(repositoryRoot, 'data', 'rag', `.derived-${process.pid}`);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function writeJsonLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, 'drain');
}

async function finishStream(stream) {
  stream.end();
  await once(stream, 'finish');
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

function emptyTranslationStats(translation) {
  return {
    id: translation.id,
    label: translation.label,
    books: 0,
    chapters: 0,
    verseRecords: 0,
    canonicalPositionsAvailable: 0,
    passages: 0,
    passagesWithHeading: 0,
    passagesWithoutHeading: 0,
    longestPassageVerses: 0,
    longestPassageCharacters: 0,
  };
}

async function buildBibleDocuments(verseOutputPath, passageOutputPath) {
  const verseStream = createWriteStream(verseOutputPath, { encoding: 'utf8' });
  const passageStream = createWriteStream(passageOutputPath, { encoding: 'utf8' });
  const availableCanonicalIds = new Set();
  const translationStats = [];

  try {
    for (const translation of TRANSLATIONS) {
      const stats = emptyTranslationStats(translation);

      for (const book of bibleCatalog) {
        const inputPath = path.join(bibleRoot, translation.directory, `${book.file}.json`);
        const data = JSON.parse(await readFile(inputPath, 'utf8'));
        assert(data.translation?.id === translation.id, `${inputPath}: translation ID mismatch`);
        assert(data.book?.id === book.id, `${inputPath}: book ID mismatch`);
        stats.books += 1;

        for (const chapter of data.chapters) {
          const { verseRecords, passages } = buildParagraphsForChapter({
            translation: data.translation,
            book: data.book,
            chapter: chapter.chapter,
            verses: chapter.verses,
            source: data.source,
          });

          for (const verse of verseRecords) {
            await writeJsonLine(verseStream, verse);
            verse.canonicalIds.forEach((id) => availableCanonicalIds.add(id));
          }
          for (const passage of passages) await writeJsonLine(passageStream, passage);

          stats.chapters += 1;
          stats.verseRecords += verseRecords.length;
          stats.canonicalPositionsAvailable += verseRecords.reduce(
            (count, verse) => count + verse.canonicalIds.length,
            0,
          );
          stats.passages += passages.length;
          stats.passagesWithHeading += passages.filter((passage) => passage.heading).length;
          stats.passagesWithoutHeading += passages.filter((passage) => !passage.heading).length;
          stats.longestPassageVerses = Math.max(
            stats.longestPassageVerses,
            ...passages.map((passage) => passage.verseIds.length),
          );
          stats.longestPassageCharacters = Math.max(
            stats.longestPassageCharacters,
            ...passages.map((passage) => passage.content.length),
          );
        }
      }

      translationStats.push(stats);
    }
  } finally {
    await Promise.all([finishStream(verseStream), finishStream(passageStream)]);
  }

  return { translationStats, availableCanonicalIds };
}

function compactReference(reference) {
  return {
    start: reference.start.id,
    end: reference.end.id,
    isRange: reference.isRange,
  };
}

async function buildCrossReferenceGraph(outputPath, availableCanonicalIds) {
  const input = createReadStream(crossReferencePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  const output = createWriteStream(outputPath, { encoding: 'utf8' });
  const sourceNodes = new Set();
  const missingCanonicalIds = new Set();
  const stats = {
    edges: 0,
    activeEdges: 0,
    inactiveEdges: 0,
    sourceRanges: 0,
    targetRanges: 0,
    sourceNodes: 0,
    edgesWithUnavailableKoreanEndpoint: 0,
    unavailableCanonicalEndpoints: 0,
    minVotes: Number.POSITIVE_INFINITY,
    maxVotes: Number.NEGATIVE_INFINITY,
  };
  let header = null;
  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      if (!header) {
        header = line;
        assert(line.startsWith('From Verse\tTo Verse\tVotes'), 'Unexpected OpenBible header.');
        continue;
      }

      const [fromValue, toValue, votesValue] = line.split('\t');
      const votes = Number.parseInt(votesValue, 10);
      assert(fromValue && toValue && Number.isInteger(votes), `Invalid cross reference at line ${lineNumber}`);

      let from;
      let to;
      try {
        from = parseOpenBibleReference(fromValue);
        to = parseOpenBibleReference(toValue);
      } catch (error) {
        throw new Error(`OpenBible line ${lineNumber}: ${error.message}`, { cause: error });
      }

      const fromRange = formatCanonicalRange(from.start.id, from.end.id);
      const endpointIds = [from.start.id, from.end.id, to.start.id, to.end.id];
      const unavailableEndpoints = endpointIds.filter((id) => !availableCanonicalIds.has(id));
      unavailableEndpoints.forEach((id) => missingCanonicalIds.add(id));
      const active = votes > 0;

      await writeJsonLine(output, {
        schemaVersion: 1,
        type: 'cross_reference',
        relationType: 'editorial_cross_reference',
        id: `openbible:${stats.edges + 1}`,
        from: compactReference(from),
        to: compactReference(to),
        votes,
        weight: active ? Number(Math.log1p(votes).toFixed(6)) : 0,
        active,
        source: OPEN_BIBLE_SOURCE,
      });

      stats.edges += 1;
      stats.activeEdges += active ? 1 : 0;
      stats.inactiveEdges += active ? 0 : 1;
      stats.sourceRanges += from.isRange ? 1 : 0;
      stats.targetRanges += to.isRange ? 1 : 0;
      stats.edgesWithUnavailableKoreanEndpoint += unavailableEndpoints.length ? 1 : 0;
      stats.minVotes = Math.min(stats.minVotes, votes);
      stats.maxVotes = Math.max(stats.maxVotes, votes);
      sourceNodes.add(fromRange);
    }
  } finally {
    lines.close();
    await finishStream(output);
  }

  stats.sourceNodes = sourceNodes.size;
  stats.unavailableCanonicalEndpoints = missingCanonicalIds.size;
  return { header, stats };
}

async function build() {
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });

  const verseOutputPath = path.join(temporaryRoot, 'verses.jsonl');
  const passageOutputPath = path.join(temporaryRoot, 'passages.jsonl');
  const crossReferenceOutputPath = path.join(temporaryRoot, 'cross-references.jsonl');

  try {
    const { translationStats, availableCanonicalIds } = await buildBibleDocuments(
      verseOutputPath,
      passageOutputPath,
    );
    const crossReferences = await buildCrossReferenceGraph(
      crossReferenceOutputPath,
      availableCanonicalIds,
    );

    const outputFiles = {
      verses: {
        path: 'verses.jsonl',
        sha256: await sha256File(verseOutputPath),
        records: translationStats.reduce((sum, stats) => sum + stats.verseRecords, 0),
      },
      passages: {
        path: 'passages.jsonl',
        sha256: await sha256File(passageOutputPath),
        records: translationStats.reduce((sum, stats) => sum + stats.passages, 0),
      },
      crossReferences: {
        path: 'cross-references.jsonl',
        sha256: await sha256File(crossReferenceOutputPath),
        records: crossReferences.stats.edges,
      },
    };
    const manifest = {
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      chunkingPolicy: {
        atomicUnit: 'canonical_verse',
        passageBoundary: 'chapter_and_source_heading',
        artificialTokenBoundary: false,
        crossReferences: 'typed_weighted_canonical_range_edges',
        graphExpansion: 'one_hop_initial_retrieval',
      },
      inputs: {
        bibleManifest: 'public/data/bible/manifest.json',
        openBibleCrossReferences: 'data/rag/raw/cross-references/openbible/cross_references.txt',
        openBibleHeader: crossReferences.header,
      },
      translations: translationStats,
      crossReferences: crossReferences.stats,
      files: outputFiles,
    };

    await writeFile(
      path.join(temporaryRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    await rm(outputRoot, { recursive: true, force: true });
    await rename(temporaryRoot, outputRoot);

    for (const stats of translationStats) {
      console.log(
        `${stats.label}: 절 문서 ${stats.verseRecords}개, 소제목 문단 ${stats.passages}개 `
        + `(소제목 있음 ${stats.passagesWithHeading}개)`,
      );
    }
    console.log(
      `OpenBible 관주: ${crossReferences.stats.edges}개 간선, `
      + `활성 ${crossReferences.stats.activeEdges}개, 범위 대상 ${crossReferences.stats.targetRanges}개`,
    );
    console.log(`RAG 파생 코퍼스를 생성했습니다: ${outputRoot}`);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

await build();
