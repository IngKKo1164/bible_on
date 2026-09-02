import { createBibleChatCheckpointer } from './lib/conversation/checkpointer.mjs';

const schema = process.env.LANGGRAPH_CHECKPOINT_SCHEMA ?? 'bibleon_langgraph';
const runtime = await createBibleChatCheckpointer({
  mode: 'postgres',
  schema,
  setup: true,
});

try {
  console.log(`LangGraph PostgreSQL checkpoint schema is ready: ${schema}`);
} finally {
  await runtime.close();
}
