import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { readJsonLines } from './lib/jsonl.mjs';
import {
  compareCanonicalVerseIds,
  createCanonicalRangeExpander,
  makeTopicAssociationKey,
  normalizeTopicLabel,
  parseOpenBibleTopicScoreLine,
  parseOpenBibleTopicVoteLine,
  parseStepOriginalLine,
  validateAuthorizedCommentary,
  validateDatingClaim,
} from './lib/rag-metadata.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const rawRoot = path.join(repositoryRoot, 'data', 'rag', 'raw');
const derivedRoot = path.join(repositoryRoot, 'data', 'rag', 'derived');
const outputRoot = path.join(repositoryRoot, 'data', 'rag', 'metadata');
const temporaryRoot = path.join(repositoryRoot, 'data', 'rag', `.metadata-${process.pid}`);
const topicRoot = path.join(rawRoot, 'topics', 'openbible');
const stepBibleRoot = path.join(rawRoot, 'stepbible');
const datingClaimsPath = path.join(repositoryRoot, 'data', 'rag', 'curated', 'dating-claims.jsonl');
const commentaryPath = path.join(
  repositoryRoot,
  'data',
  'rag',
  'curated',
  'commentary-passages.jsonl',
);

const STEP_SOURCE = Object.freeze({
  id: 'stepbible-data',
  url: 'https://github.com/STEPBible/STEPBible-Data',
  license: 'CC BY 4.0',
});

const OPEN_BIBLE_TOPIC_SOURCE = Object.freeze({
  id: 'openbible-topics',
  url: 'https://www.openbible.info/topics/',
  license: 'CC BY 4.0',
});

const CORPUS_VERSE_ALIASES = Object.freeze({
  // STEPBible TVTMS maps the NRSV/OpenBible verse to the Korean/KJV-style final verse.
  '2Cor.13.14': '2Cor.13.13',
});

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const stream = createReadStream(filePath);
  for await (const chunk of stream) hash.update(chunk);
  return hash.digest('hex');
}

async function readJsonFile(filePath) {
  return JSON.parse((await readFile(filePath, 'utf8')).replace(/^\uFEFF/, ''));
}

async function writeJsonLine(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, 'drain');
}

function finishStream(stream) {
  return new Promise((resolve, reject) => {
    stream.once('error', reject);
    stream.end(resolve);
  });
}

async function readHeaderAndRows(filePath) {
  const input = createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let header = null;
  const rows = [];
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      if (header === null) header = line.replace(/^\uFEFF/, '');
      else rows.push(line);
    }
  } finally {
    lines.close();
  }
  return { header, rows };
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  }));
  return nested.flat();
}

async function loadCanonicalVerseIds(corpusManifest) {
  const ids = new Set();
  for await (const verse of readJsonLines(
    path.join(derivedRoot, corpusManifest.files.verses.path),
  )) {
    verse.canonicalIds.forEach((id) => ids.add(id));
  }
  return [...ids].sort(compareCanonicalVerseIds);
}

async function buildTopics({ canonicalIds, outputDirectory }) {
  const scoresPath = path.join(topicRoot, 'topic-scores.txt');
  const votesPath = path.join(topicRoot, 'topic-votes.txt');
  const scoreInput = await readHeaderAndRows(scoresPath);
  const associations = scoreInput.rows.map(parseOpenBibleTopicScoreLine);
  const associationKeys = new Set(
    associations.map((association) => makeTopicAssociationKey(
      association.label,
      association.start,
      association.end,
    )),
  );
  const votesByAssociation = new Map();
  const voteInput = createReadStream(votesPath, { encoding: 'utf8' });
  const voteLines = readline.createInterface({ input: voteInput, crlfDelay: Infinity });
  let voteHeader = null;
  let voteRows = 0;
  try {
    for await (const line of voteLines) {
      if (!line.trim()) continue;
      if (voteHeader === null) {
        voteHeader = line.replace(/^\uFEFF/, '');
        continue;
      }
      voteRows += 1;
      const vote = parseOpenBibleTopicVoteLine(line);
      const key = makeTopicAssociationKey(vote.label, vote.start, vote.end);
      if (associationKeys.has(key)) votesByAssociation.set(key, vote.votes);
    }
  } finally {
    voteLines.close();
  }

  const expandRange = createCanonicalRangeExpander(canonicalIds);
  const canonicalIdSet = new Set(canonicalIds);
  const topicMap = new Map();
  const topicOutputPath = path.join(outputDirectory, 'topics.jsonl');
  const associationOutputPath = path.join(outputDirectory, 'topic-associations.jsonl');
  const associationOutput = createWriteStream(associationOutputPath, { encoding: 'utf8' });
  let missingVoteCount = 0;
  let unavailableEndpointCount = 0;
  let remappedEndpointCount = 0;
  let writtenAssociations = 0;

  try {
    for (let index = 0; index < associations.length; index += 1) {
      const association = associations[index];
      const normalizedLabel = normalizeTopicLabel(association.label);
      if (!topicMap.has(association.topicId)) {
        topicMap.set(association.topicId, {
          schemaVersion: 1,
          type: 'topic',
          id: association.topicId,
          label: association.label,
          normalizedLabel,
          language: 'en',
          source: OPEN_BIBLE_TOPIC_SOURCE,
        });
      }
      const key = makeTopicAssociationKey(
        association.label,
        association.start,
        association.end,
      );
      const votes = votesByAssociation.get(key) ?? null;
      if (!canonicalIdSet.has(association.start) || !canonicalIdSet.has(association.end)) {
        unavailableEndpointCount += 1;
      }
      const mappedStart = canonicalIdSet.has(association.start)
        ? association.start
        : CORPUS_VERSE_ALIASES[association.start] ?? association.start;
      const mappedEnd = canonicalIdSet.has(association.end)
        ? association.end
        : CORPUS_VERSE_ALIASES[association.end] ?? association.end;
      if (mappedStart !== association.start || mappedEnd !== association.end) remappedEndpointCount += 1;
      const verseIds = expandRange(mappedStart, mappedEnd)
        .filter((verseId) => canonicalIdSet.has(verseId));
      if (!verseIds.length) continue;
      if (votes === null) missingVoteCount += 1;
      await writeJsonLine(associationOutput, {
        schemaVersion: 1,
        type: 'topic_association',
        id: `openbible-topic-association:${index + 1}`,
        topicId: association.topicId,
        reference: {
          start: association.start,
          end: association.end,
          isRange: association.start !== association.end,
        },
        corpusReference: {
          start: mappedStart,
          end: mappedEnd,
          remapped: mappedStart !== association.start || mappedEnd !== association.end,
        },
        verseIds,
        qualityScore: association.qualityScore,
        votes,
        source: OPEN_BIBLE_TOPIC_SOURCE,
      });
      writtenAssociations += 1;
    }
  } finally {
    await finishStream(associationOutput);
  }

  const topicOutput = createWriteStream(topicOutputPath, { encoding: 'utf8' });
  try {
    for (const topic of [...topicMap.values()].sort((left, right) => (
      left.normalizedLabel.localeCompare(right.normalizedLabel, 'en')
    ))) {
      await writeJsonLine(topicOutput, topic);
    }
  } finally {
    await finishStream(topicOutput);
  }

  return {
    headers: { scores: scoreInput.header, votes: voteHeader },
    sourceRows: { scores: associations.length, votes: voteRows },
    topics: topicMap.size,
    associations: writtenAssociations,
    associationsWithVotes: writtenAssociations - missingVoteCount,
    associationsWithoutVotes: missingVoteCount,
    unavailableEndpointCount,
    remappedEndpointCount,
    files: { topics: topicOutputPath, associations: associationOutputPath },
  };
}

function datasetFromFile(filePath) {
  const name = path.basename(filePath);
  if (name.startsWith('TAHOT ')) return { id: 'TAHOT', language: 'he', testament: 'OT' };
  if (name.startsWith('TAGNT ')) return { id: 'TAGNT', language: 'grc', testament: 'NT' };
  return null;
}

async function buildOriginalLanguage({ canonicalIds, outputDirectory }) {
  const allFiles = await collectFiles(stepBibleRoot);
  const sourceFiles = allFiles
    .filter((filePath) => {
      const parent = path.basename(path.dirname(filePath));
      return parent === 'Translators Amalgamated OT+NT' && datasetFromFile(filePath);
    })
    .sort();
  assert(sourceFiles.length === 6, `Expected 6 current TAHOT/TAGNT files, found ${sourceFiles.length}.`);

  const canonicalIdSet = new Set(canonicalIds);
  const outputPath = path.join(outputDirectory, 'original-language.jsonl');
  const lemmaOutputPath = path.join(outputDirectory, 'lemma-verse-index.jsonl');
  const output = createWriteStream(outputPath, { encoding: 'utf8' });
  const lemmaVerses = new Map();
  const stats = {
    files: sourceFiles.length,
    verses: 0,
    oldTestamentVerses: 0,
    newTestamentVerses: 0,
    tokens: 0,
    skippedUnsupportedRows: 0,
    skippedUnavailableVerses: new Set(),
  };

  async function writeVerse(dataset, verseId, tokens) {
    if (!canonicalIdSet.has(verseId)) {
      stats.skippedUnavailableVerses.add(verseId);
      return;
    }
    const uniqueLemmaStrongs = [...new Set(tokens.map((token) => token.lemmaStrong).filter(Boolean))];
    for (const strong of uniqueLemmaStrongs) {
      const verseIds = lemmaVerses.get(strong) ?? new Set();
      verseIds.add(verseId);
      lemmaVerses.set(strong, verseIds);
    }
    await writeJsonLine(output, {
      schemaVersion: 1,
      type: 'original_language_verse',
      id: `${dataset.id}:${verseId}`,
      verseId,
      testament: dataset.testament,
      language: dataset.language,
      dataset: dataset.id,
      tokens,
      source: STEP_SOURCE,
    });
    stats.verses += 1;
    stats.tokens += tokens.length;
    if (dataset.testament === 'OT') stats.oldTestamentVerses += 1;
    else stats.newTestamentVerses += 1;
  }

  try {
    for (const filePath of sourceFiles) {
      const dataset = datasetFromFile(filePath);
      const input = createReadStream(filePath, { encoding: 'utf8' });
      const lines = readline.createInterface({ input, crlfDelay: Infinity });
      let currentVerseId = null;
      let currentTokens = [];
      try {
        for await (const line of lines) {
          let token;
          try {
            token = parseStepOriginalLine(line, dataset.id);
          } catch (error) {
            if (/Invalid verse: 0/.test(error.message)) {
              stats.skippedUnsupportedRows += 1;
              continue;
            }
            throw new Error(`${path.basename(filePath)}: ${error.message}`, { cause: error });
          }
          if (!token) continue;
          if (currentVerseId && token.verseId !== currentVerseId) {
            await writeVerse(dataset, currentVerseId, currentTokens);
            currentTokens = [];
          }
          currentVerseId = token.verseId;
          currentTokens.push({
            position: token.position,
            textType: token.textType,
            surface: token.surface,
            omitted: token.omitted,
            transliteration: token.transliteration,
            gloss: token.gloss,
            strongs: token.strongs,
            lemmaStrong: token.lemmaStrong,
            lemma: token.lemma,
            lemmaGloss: token.lemmaGloss,
            morphology: token.morphology,
            editions: token.editions,
            variants: token.variants,
          });
        }
        if (currentVerseId) await writeVerse(dataset, currentVerseId, currentTokens);
      } finally {
        lines.close();
      }
    }
  } finally {
    await finishStream(output);
  }

  const lemmaOutput = createWriteStream(lemmaOutputPath, { encoding: 'utf8' });
  try {
    for (const [strong, verseIdSet] of [...lemmaVerses.entries()].sort(([left], [right]) => (
      left.localeCompare(right, 'en', { numeric: true })
    ))) {
      const verseIds = [...verseIdSet].sort(compareCanonicalVerseIds);
      await writeJsonLine(lemmaOutput, {
        schemaVersion: 1,
        type: 'lemma_verse_index',
        id: `lemma:${strong}`,
        strong,
        language: strong.startsWith('H') ? 'he' : 'grc',
        relationType: 'shared_lemma',
        verseCount: verseIds.length,
        verseIds,
        source: STEP_SOURCE,
      });
    }
  } finally {
    await finishStream(lemmaOutput);
  }

  return {
    ...stats,
    skippedUnavailableVerses: stats.skippedUnavailableVerses.size,
    lemmas: lemmaVerses.size,
    sourceFiles: sourceFiles.map((filePath) => path.relative(repositoryRoot, filePath).replaceAll('\\', '/')),
    files: { originalLanguage: outputPath, lemmaIndex: lemmaOutputPath },
  };
}

async function buildDatingClaims({ canonicalIds, outputDirectory }) {
  const canonicalIdSet = new Set(canonicalIds);
  const expandRange = createCanonicalRangeExpander(canonicalIds);
  const outputPath = path.join(outputDirectory, 'dating-claims.jsonl');
  const output = createWriteStream(outputPath, { encoding: 'utf8' });
  const ids = new Set();
  let records = 0;
  try {
    for await (const claim of readJsonLines(datingClaimsPath)) {
      validateDatingClaim(claim);
      assert(!ids.has(claim.id), `${claim.id}: duplicate dating claim ID`);
      ids.add(claim.id);
      const verseIds = expandRange(claim.scope.start, claim.scope.end)
        .filter((verseId) => canonicalIdSet.has(verseId));
      assert(verseIds.length, `${claim.id}: dating claim does not overlap the Korean Bible corpus`);
      await writeJsonLine(output, { ...claim, verseIds });
      records += 1;
    }
  } finally {
    await finishStream(output);
  }
  return { records, files: { datingClaims: outputPath } };
}

async function buildAuthorizedCommentary({ canonicalIds, outputDirectory }) {
  const canonicalIdSet = new Set(canonicalIds);
  const expandRange = createCanonicalRangeExpander(canonicalIds);
  const outputPath = path.join(outputDirectory, 'commentary-passages.jsonl');
  const output = createWriteStream(outputPath, { encoding: 'utf8' });
  const ids = new Set();
  let records = 0;
  let inputExists = true;
  try {
    await access(commentaryPath);
  } catch {
    inputExists = false;
  }

  try {
    if (inputExists) {
      for await (const record of readJsonLines(commentaryPath)) {
        validateAuthorizedCommentary(record);
        assert(!ids.has(record.id), `${record.id}: duplicate commentary ID`);
        ids.add(record.id);
        const verseIds = expandRange(record.reference.start, record.reference.end)
          .filter((verseId) => canonicalIdSet.has(verseId));
        assert(verseIds.length, `${record.id}: commentary does not overlap the Korean Bible corpus`);
        await writeJsonLine(output, { ...record, verseIds });
        records += 1;
      }
    }
  } finally {
    await finishStream(output);
  }
  return { records, inputExists, files: { commentary: outputPath } };
}

async function describeFile(filePath, records) {
  return {
    path: path.basename(filePath),
    sha256: await sha256File(filePath),
    records,
  };
}

async function build() {
  await rm(temporaryRoot, { recursive: true, force: true });
  await mkdir(temporaryRoot, { recursive: true });
  try {
    const corpusManifest = await readJsonFile(path.join(derivedRoot, 'manifest.json'));
    const downloadManifest = await readJsonFile(path.join(rawRoot, 'download-manifest.json'));
    const canonicalIds = await loadCanonicalVerseIds(corpusManifest);
    const topics = await buildTopics({ canonicalIds, outputDirectory: temporaryRoot });
    const originalLanguage = await buildOriginalLanguage({ canonicalIds, outputDirectory: temporaryRoot });
    const datingClaims = await buildDatingClaims({ canonicalIds, outputDirectory: temporaryRoot });
    const commentary = await buildAuthorizedCommentary({
      canonicalIds,
      outputDirectory: temporaryRoot,
    });

    const files = {
      topics: await describeFile(topics.files.topics, topics.topics),
      topicAssociations: await describeFile(topics.files.associations, topics.associations),
      originalLanguage: await describeFile(
        originalLanguage.files.originalLanguage,
        originalLanguage.verses,
      ),
      lemmaIndex: await describeFile(originalLanguage.files.lemmaIndex, originalLanguage.lemmas),
      datingClaims: await describeFile(datingClaims.files.datingClaims, datingClaims.records),
      commentary: await describeFile(commentary.files.commentary, commentary.records),
    };
    const manifest = {
      schemaVersion: 1,
      generatedAtUtc: new Date().toISOString(),
      architecture: {
        joinKey: 'canonical OSIS verse ID',
        metadataPolicy: 'linked_not_concatenated_with_bible_text',
        retrievalChannels: ['topics', 'commentary'],
        postRetrievalPolicy: 'load_only_requested_channels',
      },
      corpus: {
        manifest: 'data/rag/derived/manifest.json',
        passagesSha256: corpusManifest.files.passages.sha256,
        canonicalVerses: canonicalIds.length,
      },
      inputs: {
        downloadManifestGeneratedAtUtc: downloadManifest.generatedAtUtc,
        openBibleTopicHeaders: topics.headers,
        stepBibleFiles: originalLanguage.sourceFiles,
        datingClaims: 'data/rag/curated/dating-claims.jsonl',
        commentary: {
          path: 'data/rag/curated/commentary-passages.jsonl',
          present: commentary.inputExists,
          schema: 'data/rag/curated/commentary-passages.schema.json',
        },
      },
      topics: {
        definitions: topics.topics,
        associations: topics.associations,
        associationsWithVotes: topics.associationsWithVotes,
        associationsWithoutVotes: topics.associationsWithoutVotes,
        sourceRows: topics.sourceRows,
        unavailableEndpointCount: topics.unavailableEndpointCount,
        remappedEndpointCount: topics.remappedEndpointCount,
      },
      originalLanguage: {
        verses: originalLanguage.verses,
        oldTestamentVerses: originalLanguage.oldTestamentVerses,
        newTestamentVerses: originalLanguage.newTestamentVerses,
        tokens: originalLanguage.tokens,
        lemmas: originalLanguage.lemmas,
        skippedUnsupportedRows: originalLanguage.skippedUnsupportedRows,
        skippedUnavailableVerses: originalLanguage.skippedUnavailableVerses,
      },
      relations: {
        editorialCrossReferences: {
          path: '../derived/cross-references.jsonl',
          relationType: 'editorial_cross_reference',
          records: corpusManifest.files.crossReferences.records,
          sha256: corpusManifest.files.crossReferences.sha256,
        },
        sharedLemma: {
          path: files.lemmaIndex.path,
          relationType: 'shared_lemma',
          records: files.lemmaIndex.records,
        },
        unsupportedWithoutCuratedEvidence: ['quotation', 'allusion', 'parallel', 'thematic'],
      },
      datingClaims: {
        records: datingClaims.records,
        policy: 'multiple_sourced_claims_no_synthetic_consensus',
      },
      commentary: {
        records: commentary.records,
        policy: 'verified_rights_and_source_required',
      },
      files,
    };
    await writeFile(
      path.join(temporaryRoot, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
    await rm(outputRoot, { recursive: true, force: true });
    await rename(temporaryRoot, outputRoot);

    console.log(`OpenBible 주제 ${topics.topics}개, 연결 ${topics.associations}개를 생성했습니다.`);
    console.log(
      `원어 ${originalLanguage.verses}절/${originalLanguage.tokens}토큰과 `
      + `공유 표제어 ${originalLanguage.lemmas}개를 생성했습니다.`,
    );
    console.log(`근거가 등록된 연대 주장 ${datingClaims.records}개를 생성했습니다.`);
    console.log(`사용 권한이 확인된 주석·해설 ${commentary.records}개를 생성했습니다.`);
    console.log(`RAG 연결 메타데이터를 생성했습니다: ${outputRoot}`);
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

await build();
