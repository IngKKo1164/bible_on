import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBibleChatApiHandler } from './bible-chat-api.mjs';
import { createOpenAIBibleChatRuntime } from '../scripts/lib/conversation/openai-bible-chat-runtime.mjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('The development API server must not run in production.');
}

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(serverDirectory, '..');
const environmentFile = path.join(repositoryRoot, '.env');
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
const port = Number.parseInt(process.env.BIBLEON_API_PORT ?? '8787', 10);
let runtimePromise;

function getRuntime() {
  runtimePromise ??= createOpenAIBibleChatRuntime({
    repositoryRoot,
    checkpointerMode: 'memory',
    databaseUrl: null,
  });
  return runtimePromise;
}

const handler = createBibleChatApiHandler({
  getRuntime,
  async authenticateRequest() {
    return { userId: 'local-development-user' };
  },
  async consumeQuota() {},
});
const server = createServer(handler);

async function shutdown() {
  server.close();
  const runtime = await runtimePromise?.catch(() => null);
  await runtime?.close();
}

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.listen(port, '127.0.0.1', () => {
  console.log(`BibleOn API listening on http://127.0.0.1:${port}`);
});
