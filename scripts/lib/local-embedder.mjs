import path from 'node:path';
import { env, pipeline } from '@huggingface/transformers';
import { retrievalHeading } from './search-text.mjs';

export const LOCAL_EMBEDDING_MODEL = {
  id: 'Xenova/multilingual-e5-small',
  revision: '761b726dd34fb83930e26aab4e9ac3899aa1fa78',
  dtype: 'q8',
  dimensions: 384,
  maxTokens: 500,
  license: 'MIT',
  upstream: 'intfloat/multilingual-e5-small',
};

export async function createLocalEmbedder({
  cacheDirectory,
  localFilesOnly = false,
  onProgress = null,
} = {}) {
  if (cacheDirectory) env.cacheDir = path.resolve(cacheDirectory);
  env.allowLocalModels = true;
  env.allowRemoteModels = !localFilesOnly;

  const extractor = await pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL.id, {
    revision: LOCAL_EMBEDDING_MODEL.revision,
    dtype: LOCAL_EMBEDDING_MODEL.dtype,
    local_files_only: localFilesOnly,
    progress_callback: onProgress ?? undefined,
  });

  return {
    config: LOCAL_EMBEDDING_MODEL,
    tokenizer: extractor.tokenizer,
    async embedPassages(texts) {
      const output = await extractor(
        texts.map((text) => (text.startsWith('passage: ') ? text : `passage: ${text}`)),
        { pooling: 'mean', normalize: true },
      );
      return output;
    },
    async embedQuery(query) {
      const output = await extractor(`query: ${query}`, { pooling: 'mean', normalize: true });
      return output.data;
    },
    async dispose() {
      if (typeof extractor.dispose === 'function') await extractor.dispose();
    },
  };
}

function tokenIds(tokenizer, text) {
  return Array.from(tokenizer(text, {
    add_special_tokens: false,
    truncation: false,
  }).input_ids.data);
}

export function createEmbeddingWindows(passage, tokenizer, maxTokens = LOCAL_EMBEDDING_MODEL.maxTokens) {
  const header = [
    `${passage.book.name} ${passage.chapter}장`,
    retrievalHeading(passage),
  ].filter(Boolean).join('\n');
  const headerTokens = tokenIds(tokenizer, `passage: ${header}\n`);
  const capacity = maxTokens - headerTokens.length - 2;
  if (capacity < 32) throw new Error(`${passage.id}: passage heading leaves too little token capacity`);

  const windows = [];
  let current = { tokenCount: 0, segments: [] };

  const flush = () => {
    if (!current.segments.length) return;
    const content = current.segments.map((segment) => segment.text).join(' ');
    windows.push({
      text: `${header}\n${content}`,
      verseIds: [...new Set(current.segments.flatMap((segment) => segment.canonicalIds))],
      tokenCount: headerTokens.length + current.tokenCount + 2,
    });
    current = { tokenCount: 0, segments: [] };
  };

  for (const segment of passage.contentSegments) {
    const ids = tokenIds(tokenizer, segment.text);
    if (ids.length > capacity) {
      flush();
      for (let start = 0; start < ids.length; start += capacity) {
        const slice = ids.slice(start, start + capacity);
        windows.push({
          text: `${header}\n${tokenizer.decode(slice, { skip_special_tokens: true })}`,
          verseIds: segment.canonicalIds,
          tokenCount: headerTokens.length + slice.length + 2,
        });
      }
      continue;
    }

    if (current.segments.length && current.tokenCount + ids.length > capacity) flush();
    current.segments.push(segment);
    current.tokenCount += ids.length;
  }
  flush();

  return windows.map((window, index) => ({
    ...window,
    index,
    canonicalStart: window.verseIds[0],
    canonicalEnd: window.verseIds.at(-1),
  }));
}
