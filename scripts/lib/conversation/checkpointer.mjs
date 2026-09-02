import { MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

const POSTGRES_SCHEMA_PATTERN = /^[a-z_][a-z0-9_]*$/u;

export async function createBibleChatCheckpointer({
  mode = process.env.NODE_ENV === 'production' ? 'postgres' : 'memory',
  databaseUrl = process.env.DATABASE_URL,
  schema = process.env.LANGGRAPH_CHECKPOINT_SCHEMA ?? 'bibleon_langgraph',
  setup = false,
} = {}) {
  if (mode === 'memory') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MemorySaver is disabled in production; configure DATABASE_URL.');
    }
    return {
      kind: 'memory',
      checkpointer: new MemorySaver(),
      async close() {},
    };
  }

  if (mode !== 'postgres') throw new Error(`Unsupported checkpointer mode: ${mode}`);
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the PostgreSQL checkpointer.');
  if (!POSTGRES_SCHEMA_PATTERN.test(schema)) {
    throw new Error(`Invalid PostgreSQL schema name: ${schema}`);
  }

  const checkpointer = PostgresSaver.fromConnString(databaseUrl, { schema });
  if (setup) {
    try {
      await checkpointer.setup();
    } catch (error) {
      await checkpointer.end();
      throw error;
    }
  }
  return {
    kind: 'postgres',
    checkpointer,
    async close() {
      await checkpointer.end();
    },
  };
}
