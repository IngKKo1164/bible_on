import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadJsonLines } from './jsonl.mjs';
import { METADATA_CHANNELS, selectMetadataChannels } from './rag-metadata.mjs';

function uniqueById(records) {
  return [...new Map(records.map((record) => [record.id, record])).values()];
}

function uniqueBy(records, getKey) {
  const seen = new Set();
  return records.filter((record) => {
    const key = getKey(record);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function addToIndex(index, key, value) {
  const values = index.get(key) ?? [];
  values.push(value);
  index.set(key, values);
}

function resolveChannels(query, channels) {
  if (channels === 'all') return [...METADATA_CHANNELS];
  if (channels === 'auto' || channels === undefined) return selectMetadataChannels(query ?? '');
  const requested = Array.isArray(channels) ? channels : String(channels).split(',');
  const normalized = requested.map((channel) => channel.trim()).filter(Boolean);
  const unsupported = normalized.filter((channel) => !METADATA_CHANNELS.includes(channel));
  if (unsupported.length) throw new Error(`Unsupported metadata channels: ${unsupported.join(', ')}`);
  return normalized;
}

export async function createMetadataRepository({ repositoryRoot } = {}) {
  const root = path.resolve(repositoryRoot ?? process.cwd());
  const metadataRoot = path.join(root, 'data', 'rag', 'metadata');
  const derivedRoot = path.join(root, 'data', 'rag', 'derived');
  const manifest = JSON.parse(await readFile(path.join(metadataRoot, 'manifest.json'), 'utf8'));
  const channelPromises = new Map();

  function loadChannel(channel) {
    if (channelPromises.has(channel)) return channelPromises.get(channel);
    const promise = (async () => {
      if (channel === 'topics') {
        const [topics, associations] = await Promise.all([
          loadJsonLines(path.join(metadataRoot, manifest.files.topics.path)),
          loadJsonLines(path.join(metadataRoot, manifest.files.topicAssociations.path)),
        ]);
        const topicsById = new Map(topics.map((topic) => [topic.id, topic]));
        const byVerse = new Map();
        for (const association of associations) {
          association.verseIds.forEach((verseId) => addToIndex(byVerse, verseId, association));
        }
        return { topicsById, byVerse };
      }
      if (channel === 'originalLanguage') {
        const records = await loadJsonLines(
          path.join(metadataRoot, manifest.files.originalLanguage.path),
        );
        return { byVerse: new Map(records.map((record) => [record.verseId, record])) };
      }
      if (channel === 'relations') {
        const [editorialEdges, lemmaRecords] = await Promise.all([
          loadJsonLines(path.join(derivedRoot, 'cross-references.jsonl')),
          loadJsonLines(path.join(metadataRoot, manifest.files.lemmaIndex.path)),
        ]);
        const editorialByVerse = new Map();
        for (const edge of editorialEdges) addToIndex(editorialByVerse, edge.from.start, edge);
        const lemmaByStrong = new Map(lemmaRecords.map((record) => [record.strong, record]));
        return { editorialByVerse, lemmaByStrong };
      }
      if (channel === 'datingClaims') {
        const claims = await loadJsonLines(path.join(metadataRoot, manifest.files.datingClaims.path));
        const byVerse = new Map();
        for (const claim of claims) {
          claim.verseIds.forEach((verseId) => addToIndex(byVerse, verseId, claim));
        }
        return { byVerse };
      }
      throw new Error(`Unsupported metadata channel: ${channel}`);
    })();
    channelPromises.set(channel, promise);
    return promise;
  }

  async function getForVerseIds(verseIds, {
    query = '',
    channels = 'auto',
    topicLimit = 12,
    editorialRelationLimit = 20,
    sharedLemmaLimit = 20,
    sharedLemmaTargetsPerEntry = 12,
  } = {}) {
    const requestedChannels = resolveChannels(query, channels);
    const loadedEntries = await Promise.all(
      requestedChannels.map(async (channel) => [channel, await loadChannel(channel)]),
    );
    const loaded = Object.fromEntries(loadedEntries);
    const result = {
      channels: requestedChannels,
      topics: [],
      originalLanguage: [],
      relations: { editorial: [], sharedLemma: [] },
      datingClaims: [],
    };

    if (loaded.topics) {
      const associations = uniqueById(verseIds.flatMap((verseId) => (
        loaded.topics.byVerse.get(verseId) ?? []
      ))).sort((left, right) => (
        right.qualityScore - left.qualityScore
        || (right.votes ?? -1) - (left.votes ?? -1)
      ));
      const uniqueTopics = uniqueBy(associations, (association) => association.topicId)
        .slice(0, topicLimit);
      result.topics = uniqueTopics.map((association) => ({
        ...association,
        topic: loaded.topics.topicsById.get(association.topicId),
      }));
    }

    if (loaded.originalLanguage) {
      result.originalLanguage = verseIds
        .map((verseId) => loaded.originalLanguage.byVerse.get(verseId))
        .filter(Boolean);
    }

    if (loaded.relations) {
      result.relations.editorial = uniqueById(verseIds.flatMap((verseId) => (
        loaded.relations.editorialByVerse.get(verseId) ?? []
      ))).sort((left, right) => right.votes - left.votes).slice(0, editorialRelationLimit);

      const excludedVerseIds = new Set(verseIds);
      const lemmaStrongs = new Set(
        result.originalLanguage.flatMap((record) => (
          record.tokens.map((token) => token.lemmaStrong).filter(Boolean)
        )),
      );
      result.relations.sharedLemma = [...lemmaStrongs]
        .map((strong) => loaded.relations.lemmaByStrong.get(strong))
        .filter(Boolean)
        .sort((left, right) => left.verseCount - right.verseCount)
        .slice(0, sharedLemmaLimit)
        .map((record) => ({
          relationType: record.relationType,
          strong: record.strong,
          totalVerseCount: record.verseCount,
          targetVerseIds: record.verseIds
            .filter((verseId) => !excludedVerseIds.has(verseId))
            .slice(0, sharedLemmaTargetsPerEntry),
          source: record.source,
        }));
    }

    if (loaded.datingClaims) {
      result.datingClaims = uniqueById(verseIds.flatMap((verseId) => (
        loaded.datingClaims.byVerse.get(verseId) ?? []
      )));
    }

    return result;
  }

  return {
    manifest,
    getForVerseIds,
    getForPassage(passage, options = {}) {
      return getForVerseIds(passage.verseIds, options);
    },
  };
}
