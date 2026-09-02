import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAIBibleChatRuntime } from './lib/conversation/openai-bible-chat-runtime.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..');
const environmentFile = path.join(repositoryRoot, '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const question = process.argv.slice(2).join(' ').trim();

if (!question) {
  console.error('Usage: npm run rag:chat -- "질문"');
  process.exitCode = 1;
} else {
  let runtime;
  try {
    runtime = await createOpenAIBibleChatRuntime({ repositoryRoot });
    const result = await runtime.ask({
      threadId: randomUUID(),
      ownerUserId: 'local-cli-user',
      query: question,
    });
    console.log(`\n${result.responseText}\n`);
    result.displayCitations.forEach((citation) => {
      console.log(`- ${citation.reference} (${citation.translation})`);
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await runtime?.close();
  }
}
