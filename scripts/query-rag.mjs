import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHybridRetriever } from './lib/hybrid-retriever.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const args = process.argv.slice(2);
let translationId = 'RNKSV';
let limit = 5;
let json = false;
const questionParts = [];

for (const arg of args) {
  if (arg.startsWith('--translation=')) translationId = arg.split('=')[1].toUpperCase();
  else if (arg.startsWith('--limit=')) limit = Number.parseInt(arg.split('=')[1], 10);
  else if (arg === '--json') json = true;
  else questionParts.push(arg);
}

const question = questionParts.join(' ').trim();
if (!question) {
  console.error('Usage: npm run rag:query -- [--translation=RNKSV] [--limit=5] "질문"');
  process.exitCode = 1;
} else {
  const retriever = await createHybridRetriever({ repositoryRoot, localFilesOnly: true });
  try {
    const results = await retriever.search(question, { translationId, limit });
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
        console.log('');
      });
    }
  } finally {
    await retriever.dispose();
  }
}
