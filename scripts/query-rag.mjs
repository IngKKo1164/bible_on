import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHybridRetriever } from './lib/hybrid-retriever.mjs';
import { createMetadataRepository } from './lib/metadata-repository.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const args = process.argv.slice(2);
let translationId = 'RNKSV';
let limit = 5;
let json = false;
let metadataMode = 'auto';
const questionParts = [];

for (const arg of args) {
  if (arg.startsWith('--translation=')) translationId = arg.split('=')[1].toUpperCase();
  else if (arg.startsWith('--limit=')) limit = Number.parseInt(arg.split('=')[1], 10);
  else if (arg === '--json') json = true;
  else if (arg.startsWith('--metadata=')) metadataMode = arg.split('=')[1];
  else questionParts.push(arg);
}

const question = questionParts.join(' ').trim();
if (!question) {
  console.error(
    'Usage: npm run rag:query -- [--translation=RNKSV] [--limit=5] '
    + '[--metadata=auto|all|none|topics,originalLanguage,relations,datingClaims] "질문"',
  );
  process.exitCode = 1;
} else {
  const retriever = await createHybridRetriever({ repositoryRoot, localFilesOnly: true });
  try {
    const retrieved = await retriever.search(question, { translationId, limit });
    const metadataRepository = metadataMode === 'none'
      ? null
      : await createMetadataRepository({ repositoryRoot });
    const channels = metadataMode === 'auto' || metadataMode === 'all'
      ? metadataMode
      : metadataMode.split(',');
    const results = await Promise.all(retrieved.map(async (result) => ({
      ...result,
      ...(metadataRepository
        ? {
            metadata: await metadataRepository.getForPassage(
              result.passage,
              { query: question, channels },
            ),
          }
        : {}),
    })));
    if (json) {
      console.log(JSON.stringify({ question, translationId, results }, null, 2));
    } else {
      console.log(`\n질문: ${question}\n`);
      results.forEach((result) => {
        const { passage } = result;
        const preview = passage.content.length > 240
          ? `${passage.content.slice(0, 240)}...`
          : passage.content;
        console.log(`${result.rank}. ${passage.reference}${passage.heading ? ` · ${passage.heading}` : ''}`);
        console.log(`   경로: ${result.channels.join(' + ')} | 점수: ${result.score}`);
        console.log(`   ${preview}`);
        if (result.crossReferences.length) {
          const edge = result.crossReferences[0];
          console.log(`   관주: ${edge.from} → ${edge.toStart}${edge.toEnd === edge.toStart ? '' : `-${edge.toEnd}`} (${edge.votes})`);
        }
        if (result.metadata?.topics.length) {
          console.log(
            `   주제: ${result.metadata.topics.slice(0, 4).map((item) => item.topic.label).join(', ')}`,
          );
        }
        if (result.metadata?.originalLanguage.length) {
          const tokenCount = result.metadata.originalLanguage.reduce(
            (count, record) => count + record.tokens.length,
            0,
          );
          console.log(`   원어: ${result.metadata.originalLanguage.length}절, ${tokenCount}토큰`);
        }
        if (
          result.metadata?.datingClaims.length === 0
          && result.metadata?.channels.includes('datingClaims')
        ) {
          console.log('   연대: 검증된 출처가 등록된 주장이 아직 없습니다.');
        }
        console.log('');
      });
    }
  } finally {
    await retriever.dispose();
  }
}
